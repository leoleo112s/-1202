import WebSocket from 'ws';
import { AsrService } from '../services/AsrService';
import { AsrConfig } from '../types';

/**
 * WebSocket 处理器
 * 处理前端的 WebSocket 连接
 */
export class WebSocketHandler {
  private asrService: AsrService;

  constructor(asrService: AsrService) {
    this.asrService = asrService;
  }

  /**
   * 处理客户端连接
   */
  handleConnection(clientWs: WebSocket, request: any): void {
    const clientSessionId = this.generateSessionId();
    console.log(`[WebSocket Handler] 客户端连接: ${clientSessionId}`);

    // 从查询参数中获取 ASR 配置
    const url = new URL(request.url, 'ws://localhost');
    const asrConfig: AsrConfig = {
      serverIp: url.searchParams.get('serverIp') || '127.0.0.1',
      loginPort: parseInt(url.searchParams.get('loginPort') || '30886'),
      servicePort: parseInt(url.searchParams.get('servicePort') || '30888'),
      username: url.searchParams.get('username') || 'superuser',
      password: url.searchParams.get('password') || ''
    };

    console.log(`[WebSocket Handler] ASR 配置:`, {
      serverIp: asrConfig.serverIp,
      loginPort: asrConfig.loginPort,
      servicePort: asrConfig.servicePort,
      username: asrConfig.username
    });

    // 开始 ASR 识别
    this.asrService
      .startRecognition(clientSessionId, asrConfig, (response) => {
        // 转发 ASR 服务器的响应到前端
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(JSON.stringify(response));
        }
      })
      .then((response) => {
        // 发送握手成功响应
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(JSON.stringify(response));
        }
      })
      .catch((error) => {
        console.error('[WebSocket Handler] 启动识别失败:', error);
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(
            JSON.stringify({
              code: 500,
              message: `启动识别失败: ${error.message}`
            })
          );
          clientWs.close();
        }
      });

    // 处理客户端消息
    clientWs.on('message', (data: WebSocket.Data) => {
      try {
        if (data instanceof Buffer) {
          // 二进制音频数据
          console.log(`[WebSocket Handler] 收到音频数据: ${data.length} bytes`);
          this.asrService.sendAudioData(clientSessionId, data);
        } else {
          // 文本消息（如结束信号）
          const message = data.toString();
          console.log(`[WebSocket Handler] 收到文本消息: ${message}`);

          try {
            const jsonMessage = JSON.parse(message);
            if (jsonMessage.type === 'end' || jsonMessage.isEnd) {
              console.log('[WebSocket Handler] 收到结束信号');
              this.asrService.endRecognition(clientSessionId);
            }
          } catch (e) {
            // 不是 JSON 格式,忽略
          }
        }
      } catch (error: any) {
        console.error('[WebSocket Handler] 处理消息失败:', error);
      }
    });

    // 处理连接关闭
    clientWs.on('close', () => {
      console.log(`[WebSocket Handler] 客户端断开连接: ${clientSessionId}`);
      this.asrService.endRecognition(clientSessionId);
    });

    // 处理错误
    clientWs.on('error', (error) => {
      console.error('[WebSocket Handler] WebSocket 错误:', error);
      this.asrService.endRecognition(clientSessionId);
    });
  }

  /**
   * 生成会话 ID
   */
  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }
}
