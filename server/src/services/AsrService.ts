import WebSocket from 'ws';
import axios from 'axios';
import { AsrConfig, AsrResponse, LoginResponse, SessionInfo } from '../types';
import { config } from '../config';

/**
 * ASR 服务类
 * 负责与 AIOS ASR 私有化服务器通信
 */
export class AsrService {
  private sessionCookie: string | null = null;
  private sessions: Map<string, SessionInfo> = new Map();

  /**
   * 生成 voice_id
   */
  private generateVoiceId(): string {
    const chars = '1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let result = '';
    for (let i = 0; i < 16; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  /**
   * 登录到 ASR 服务器
   */
  async login(username: string, password: string, serverIp: string, loginPort: number): Promise<LoginResponse> {
    try {
      console.log(`[ASR Service] 登录 ASR 服务: ${serverIp}:${loginPort}`);

      const loginUrl = `http://${serverIp}:${loginPort}/login`;
      const response = await axios.post(
        loginUrl,
        { username, password },
        {
          headers: { 'Content-Type': 'application/json' },
          validateStatus: () => true // 接受所有状态码
        }
      );

      console.log(`[ASR Service] 登录响应状态: ${response.status}`);

      // 提取 SESSION Cookie
      const setCookie = response.headers['set-cookie'];
      if (setCookie && setCookie.length > 0) {
        const sessionMatch = setCookie[0].match(/SESSION=([^;]+)/);
        if (sessionMatch) {
          this.sessionCookie = `SESSION=${sessionMatch[1]}`;
          console.log(`[ASR Service] 登录成功，SESSION: ${this.sessionCookie.substring(0, 20)}...`);
        }
      }

      return {
        status: response.status,
        msg: response.data.msg || 'success',
        data: {
          session: this.sessionCookie || undefined
        }
      };
    } catch (error: any) {
      console.error('[ASR Service] 登录失败:', error.message);
      throw new Error(`ASR 登录失败: ${error.message}`);
    }
  }

  /**
   * 构建 WebSocket URL
   */
  private buildWebSocketUrl(voiceId: string, serverIp: string, servicePort: number): string {
    const baseUrl = `ws://${serverIp}:${servicePort}/websocket/realtime_asr_ws_private`;
    const params = new URLSearchParams({
      voice_id: voiceId,
      ...config.websocket.params
    });
    return `${baseUrl}?${params.toString()}`;
  }

  /**
   * 开始语音识别
   */
  async startRecognition(
    clientSessionId: string,
    asrConfig: AsrConfig,
    onMessage: (response: AsrResponse) => void
  ): Promise<AsrResponse> {
    try {
      console.log(`[ASR Service] 开始识别会话: ${clientSessionId}`);

      // 如果没有登录过,先登录
      if (!this.sessionCookie) {
        await this.login(
          asrConfig.username,
          asrConfig.password,
          asrConfig.serverIp,
          asrConfig.loginPort
        );
      }

      // 生成 voiceId
      const voiceId = this.generateVoiceId();
      console.log(`[ASR Service] Voice ID: ${voiceId}`);

      // 构造 WebSocket URL
      const wsUrl = this.buildWebSocketUrl(voiceId, asrConfig.serverIp, asrConfig.servicePort);
      console.log(`[ASR Service] WebSocket URL: ${wsUrl}`);

      // 创建 WebSocket 连接
      const asrWs = new WebSocket(wsUrl, {
        headers: {
          Cookie: this.sessionCookie || '',
          'X-TC-Service': 'asr',
          'X-TC-Action': '/realtime_asr_ws_private',
          'X-TC-Timestamp': String(Math.floor(Date.now() / 1000)),
          'X-TC-Version': '2017-08-23',
          'X-TC-Project': '1',
          'Content-Type': 'application/json'
        }
      });

      // 设置超时
      const handshakeTimeout = setTimeout(() => {
        if (asrWs.readyState !== WebSocket.OPEN) {
          console.error('[ASR Service] WebSocket 连接超时');
          asrWs.close();
        }
      }, 10000);

      return new Promise((resolve, reject) => {
        let handshakeCompleted = false;

        asrWs.on('open', () => {
          console.log(`[ASR Service] WebSocket 连接已打开`);
          clearTimeout(handshakeTimeout);
        });

        asrWs.on('message', (data: WebSocket.Data) => {
          try {
            const message = data.toString();
            console.log(`[ASR Service] 收到消息: ${message.substring(0, 200)}`);

            const response: AsrResponse = JSON.parse(message);

            // 握手响应
            if (!handshakeCompleted && response.code === 0 && response.voice_id) {
              console.log(`[ASR Service] 握手成功: ${response.voice_id}`);
              handshakeCompleted = true;

              // 保存会话信息
              this.sessions.set(clientSessionId, {
                sessionId: clientSessionId,
                voiceId,
                asrWebSocket: asrWs,
                isActive: true
              });

              resolve({
                code: 0,
                message: 'success',
                voice_id: voiceId
              });
            }

            // 转发识别结果到前端
            onMessage(response);

          } catch (error: any) {
            console.error('[ASR Service] 解析消息失败:', error);
          }
        });

        asrWs.on('error', (error) => {
          console.error('[ASR Service] WebSocket 错误:', error);
          clearTimeout(handshakeTimeout);
          if (!handshakeCompleted) {
            reject(new Error('WebSocket 连接失败'));
          }
        });

        asrWs.on('close', () => {
          console.log(`[ASR Service] WebSocket 连接已关闭: ${clientSessionId}`);
          this.sessions.delete(clientSessionId);
        });
      });

    } catch (error: any) {
      console.error('[ASR Service] 启动识别失败:', error);
      throw error;
    }
  }

  /**
   * 发送音频数据到 ASR 服务器
   */
  sendAudioData(clientSessionId: string, audioData: Buffer): void {
    const session = this.sessions.get(clientSessionId);
    if (!session || !session.isActive) {
      console.warn(`[ASR Service] 会话不存在或未激活: ${clientSessionId}`);
      return;
    }

    const asrWs = session.asrWebSocket as WebSocket;
    if (asrWs.readyState !== WebSocket.OPEN) {
      console.warn(`[ASR Service] WebSocket 未打开: ${clientSessionId}`);
      return;
    }

    try {
      // 将音频数据分包发送 (每包 6400 字节 = 16kHz * 200ms * 2 bytes)
      const PACKET_SIZE = 6400;
      let offset = 0;

      while (offset < audioData.length) {
        const chunk = audioData.slice(offset, offset + PACKET_SIZE);
        asrWs.send(chunk);
        offset += PACKET_SIZE;
      }
    } catch (error: any) {
      console.error(`[ASR Service] 发送音频数据失败:`, error);
    }
  }

  /**
   * 结束语音识别
   */
  endRecognition(clientSessionId: string): void {
    const session = this.sessions.get(clientSessionId);
    if (!session) {
      console.warn(`[ASR Service] 会话不存在: ${clientSessionId}`);
      return;
    }

    const asrWs = session.asrWebSocket as WebSocket;

    try {
      if (asrWs.readyState === WebSocket.OPEN) {
        // 发送结束信号
        asrWs.send(JSON.stringify({ type: 'end' }));
        console.log(`[ASR Service] 已发送结束信号: ${clientSessionId}`);

        // 延迟关闭连接,等待最终结果
        setTimeout(() => {
          if (asrWs.readyState === WebSocket.OPEN) {
            asrWs.close();
          }
        }, 2000);
      }
    } catch (error: any) {
      console.error(`[ASR Service] 结束识别失败:`, error);
    } finally {
      session.isActive = false;
    }
  }
}
