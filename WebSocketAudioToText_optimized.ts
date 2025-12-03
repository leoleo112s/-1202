/**
 * 实时语音转文字功能类 - 优化版
 *
 * 主要改进：
 * 1. 支持动态配置 ASR 服务器参数
 * 2. 正确处理音频降采样（48kHz -> 16kHz）
 * 3. 添加 WebSocket 自动重连机制
 * 4. 支持标准的控制信号格式
 * 5. 改进的错误处理和资源管理
 * 6. 音频数据分包发送
 */
export class WebSocketAudioToText {
  private ws: WebSocket | null = null;
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private scriptProcessor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;

  // 音频参数
  private readonly TARGET_SAMPLE_RATE = 16000; // 目标采样率
  private readonly BUFFER_SIZE = 4096; // 缓冲区大小

  // WebSocket 配置
  private wsUrl: string = '';
  private reconnectAttempts = 0;
  private readonly MAX_RECONNECT_ATTEMPTS = 3;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private isManualClose = false;

  // 回调函数
  private onTranscriptCallback: ((text: string, isFinal: boolean) => void) | null = null;
  private onErrorCallback: ((error: string) => void) | null = null;
  private onStatusChangeCallback: ((status: 'connecting' | 'connected' | 'disconnected') => void) | null = null;

  // ASR 配置参数
  private asrConfig: {
    serverIp: string;
    loginPort: number;
    servicePort: number;
    username: string;
    password: string;
  } | null = null;

  /**
   * 设置 ASR 配置
   * @param config ASR 服务器配置
   */
  public setAsrConfig(config: {
    serverIp: string;
    loginPort: number;
    servicePort: number;
    username: string;
    password: string;
  }): void {
    this.asrConfig = config;
    this.wsUrl = this.buildWebSocketUrl(config);
  }

  /**
   * 构建 WebSocket URL
   * @param config ASR 配置
   * @returns WebSocket URL
   */
  private buildWebSocketUrl(config: {
    serverIp: string;
    loginPort: number;
    servicePort: number;
    username: string;
    password: string;
  }): string {
    // 根据当前页面协议选择 ws 或 wss
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;

    // 构建查询参数
    const params = new URLSearchParams({
      serverIp: config.serverIp,
      loginPort: config.loginPort.toString(),
      servicePort: config.servicePort.toString(),
      username: config.username,
      password: config.password
    });

    return `${protocol}//${host}/asr?${params.toString()}`;
  }

  /**
   * 设置实时文本回调
   * @param callback 回调函数
   */
  public setOnTranscriptCallback(callback: (text: string, isFinal: boolean) => void): void {
    this.onTranscriptCallback = callback;
  }

  /**
   * 设置错误回调
   * @param callback 回调函数
   */
  public setOnErrorCallback(callback: (error: string) => void): void {
    this.onErrorCallback = callback;
  }

  /**
   * 设置连接状态变更回调
   * @param callback 回调函数
   */
  public setOnStatusChangeCallback(callback: (status: 'connecting' | 'connected' | 'disconnected') => void): void {
    this.onStatusChangeCallback = callback;
  }

  /**
   * 开始语音识别
   */
  public async start(): Promise<void> {
    try {
      // 检查是否已设置 ASR 配置
      if (!this.asrConfig) {
        throw new Error('请先调用 setAsrConfig() 设置 ASR 配置');
      }

      this.isManualClose = false;
      this.onStatusChangeCallback?.('connecting');

      // 1. 获取麦克风权限
      console.log('[ASR Client] 正在请求麦克风权限...');
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      // 2. 创建音频上下文（使用浏览器默认采样率，通常是 48kHz）
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      console.log('[ASR Client] 音频上下文采样率:', this.audioContext.sampleRate);

      // 3. 创建音频源
      this.source = this.audioContext.createMediaStreamSource(this.mediaStream);

      // 4. 创建 ScriptProcessorNode 处理音频数据
      this.scriptProcessor = this.audioContext.createScriptProcessor(
        this.BUFFER_SIZE,
        1, // 单声道输入
        1  // 单声道输出
      );

      // 5. 处理音频数据（降采样并发送）
      this.scriptProcessor.onaudioprocess = (event) => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          const inputData = event.inputBuffer.getChannelData(0);

          // 降采样到 16kHz
          const downSampledData = this.downsampleBuffer(
            inputData,
            this.audioContext!.sampleRate,
            this.TARGET_SAMPLE_RATE
          );

          // 转换为 Int16
          const pcmData = this.convertFloat32ToInt16(downSampledData);

          // 发送音频数据
          this.ws.send(pcmData);
        }
      };

      // 6. 连接音频节点
      this.source.connect(this.scriptProcessor);
      this.scriptProcessor.connect(this.audioContext.destination);

      // 7. 连接 WebSocket
      await this.connectWebSocket();

      console.log('[ASR Client] 语音识别已启动');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : '启动失败';
      console.error('[ASR Client] 启动失败:', error);

      // 特殊处理权限错误
      if (error instanceof DOMException) {
        if (error.name === 'NotAllowedError') {
          this.onErrorCallback?.('麦克风权限被拒绝，请检查浏览器权限设置');
        } else if (error.name === 'NotFoundError') {
          this.onErrorCallback?.('未找到麦克风设备');
        } else {
          this.onErrorCallback?.(errorMsg);
        }
      } else {
        this.onErrorCallback?.(errorMsg);
      }

      this.stop();
    }
  }

  /**
   * 降采样
   * @param buffer 原始音频数据
   * @param sampleRate 原始采样率
   * @param targetSampleRate 目标采样率
   * @returns 降采样后的数据
   */
  private downsampleBuffer(
    buffer: Float32Array,
    sampleRate: number,
    targetSampleRate: number
  ): Float32Array {
    if (sampleRate === targetSampleRate) {
      return buffer;
    }

    const sampleRateRatio = sampleRate / targetSampleRate;
    const newLength = Math.round(buffer.length / sampleRateRatio);
    const result = new Float32Array(newLength);

    let offsetResult = 0;
    let offsetBuffer = 0;

    while (offsetResult < result.length) {
      const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);

      // 线性插值
      let accum = 0;
      let count = 0;

      for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
        accum += buffer[i];
        count++;
      }

      result[offsetResult] = accum / count;
      offsetResult++;
      offsetBuffer = nextOffsetBuffer;
    }

    return result;
  }

  /**
   * Float32 数组转 Int16 数组
   * @param buffer Float32 数组
   * @returns Int16 数组缓冲区
   */
  private convertFloat32ToInt16(buffer: Float32Array): ArrayBuffer {
    const length = buffer.length;
    const bytes = new Int16Array(length);

    for (let i = 0; i < length; i++) {
      // 限制范围在 [-1, 1]
      const s = Math.max(-1, Math.min(1, buffer[i]));
      // 转换为 16 位整数
      bytes[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }

    return bytes.buffer;
  }

  /**
   * 连接 WebSocket
   */
  private connectWebSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        console.log('[ASR Client] 正在连接 WebSocket:', this.wsUrl);

        this.ws = new WebSocket(this.wsUrl);
        this.ws.binaryType = 'arraybuffer'; // 设置二进制数据类型

        // 连接超时处理
        const connectTimeout = setTimeout(() => {
          if (this.ws && this.ws.readyState !== WebSocket.OPEN) {
            this.ws.close();
            reject(new Error('WebSocket 连接超时'));
          }
        }, 10000); // 10 秒超时

        this.ws.onopen = () => {
          clearTimeout(connectTimeout);
          console.log('[ASR Client] WebSocket 连接已建立');
          this.reconnectAttempts = 0;
          this.onStatusChangeCallback?.('connected');
          resolve();
        };

        this.ws.onmessage = (event) => {
          this.handleWebSocketMessage(event);
        };

        this.ws.onerror = (error) => {
          clearTimeout(connectTimeout);
          console.error('[ASR Client] WebSocket 错误:', error);
          this.onErrorCallback?.('WebSocket 连接错误');
        };

        this.ws.onclose = (event) => {
          clearTimeout(connectTimeout);
          console.log('[ASR Client] WebSocket 连接已关闭:', event.code, event.reason);
          this.onStatusChangeCallback?.('disconnected');

          // 如果不是手动关闭，尝试重连
          if (!this.isManualClose && this.reconnectAttempts < this.MAX_RECONNECT_ATTEMPTS) {
            this.attemptReconnect();
          }
        };
      } catch (error) {
        console.error('[ASR Client] WebSocket 连接失败:', error);
        reject(error);
      }
    });
  }

  /**
   * 尝试重连
   */
  private attemptReconnect(): void {
    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 10000);

    console.log(`[ASR Client] 将在 ${delay}ms 后尝试第 ${this.reconnectAttempts} 次重连...`);

    this.reconnectTimeout = setTimeout(async () => {
      try {
        this.onStatusChangeCallback?.('connecting');
        await this.connectWebSocket();
      } catch (error) {
        console.error('[ASR Client] 重连失败:', error);
        this.onErrorCallback?.('WebSocket 重连失败');
      }
    }, delay);
  }

  /**
   * 处理 WebSocket 消息
   * @param event WebSocket 消息事件
   */
  private handleWebSocketMessage(event: MessageEvent): void {
    try {
      let data: string;

      // 处理不同类型的消息
      if (event.data instanceof Blob) {
        // Blob 类型需要异步读取
        const reader = new FileReader();
        reader.onload = () => {
          this.parseAsrResponse(reader.result as string);
        };
        reader.readAsText(event.data);
        return;
      } else if (event.data instanceof ArrayBuffer) {
        // ArrayBuffer 类型
        data = new TextDecoder().decode(event.data);
      } else {
        // 字符串类型
        data = event.data;
      }

      this.parseAsrResponse(data);
    } catch (error) {
      console.error('[ASR Client] 消息处理错误:', error);
    }
  }

  /**
   * 解析 ASR 响应
   * @param data 响应数据
   */
  private parseAsrResponse(data: string): void {
    try {
      const result = JSON.parse(data);

      // 检查响应代码
      if (result.code === 0) {
        // 握手响应
        if (result.voiceId && !result.result) {
          console.log('[ASR Client] 握手成功，voiceId:', result.voiceId);
          return;
        }

        // 识别结果
        if (result.result) {
          const voiceTextStr = result.result.voiceTextStr || '';
          const sliceType = result.result.sliceType;

          // sliceType: 0=开始, 1=识别中, 2=结束
          const isFinal = sliceType === 2;

          if (voiceTextStr) {
            console.log('[ASR Client] 识别结果:', voiceTextStr, isFinal ? '(最终)' : '(中间)');
            this.onTranscriptCallback?.(voiceTextStr, isFinal);
          }
        }
      } else {
        // 错误响应
        console.error('[ASR Client] ASR 错误:', result.code, result.message);
        this.onErrorCallback?.(`识别错误: ${result.message || '未知错误'}`);
      }
    } catch (error) {
      console.error('[ASR Client] JSON 解析错误:', error);
      console.warn('[ASR Client] 原始数据:', data);
    }
  }

  /**
   * 停止语音识别
   */
  public stop(): void {
    console.log('[ASR Client] 正在停止语音识别...');
    this.isManualClose = true;

    // 清除重连定时器
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    // 1. 发送结束信号（支持两种格式）
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        // 标准格式
        this.ws.send(JSON.stringify({ type: 'end' }));
        console.log('[ASR Client] 已发送结束信号');
      } catch (error) {
        console.error('[ASR Client] 发送结束信号失败:', error);
      }
    }

    // 2. 断开音频处理链
    if (this.scriptProcessor) {
      this.scriptProcessor.onaudioprocess = null;
      this.scriptProcessor.disconnect();
      this.scriptProcessor = null;
    }

    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }

    // 3. 停止媒体流
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => {
        track.stop();
        console.log('[ASR Client] 已停止音频轨道:', track.label);
      });
      this.mediaStream = null;
    }

    // 4. 关闭音频上下文
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().then(() => {
        console.log('[ASR Client] 音频上下文已关闭');
      });
      this.audioContext = null;
    }

    // 5. 关闭 WebSocket（延迟关闭，确保结束信号发送完成）
    if (this.ws) {
      setTimeout(() => {
        if (this.ws) {
          this.ws.close(1000, 'Normal closure');
          this.ws = null;
        }
      }, 500);
    }

    this.onStatusChangeCallback?.('disconnected');
    console.log('[ASR Client] 语音识别已停止');
  }

  /**
   * 获取当前连接状态
   */
  public getStatus(): 'connecting' | 'connected' | 'disconnected' {
    if (!this.ws) {
      return 'disconnected';
    }

    switch (this.ws.readyState) {
      case WebSocket.CONNECTING:
        return 'connecting';
      case WebSocket.OPEN:
        return 'connected';
      default:
        return 'disconnected';
    }
  }

  /**
   * 检查浏览器是否支持所需的 API
   */
  public static isSupported(): boolean {
    return !!(
      typeof navigator !== 'undefined' &&
      navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia !== 'undefined' &&
      (window.AudioContext || (window as any).webkitAudioContext) &&
      typeof WebSocket !== 'undefined'
    );
  }

  /**
   * 获取浏览器支持信息（用于调试）
   */
  public static getSupportInfo(): {
    mediaDevices: boolean;
    audioContext: boolean;
    webSocket: boolean;
    supported: boolean;
  } {
    return {
      mediaDevices: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
      audioContext: !!(window.AudioContext || (window as any).webkitAudioContext),
      webSocket: typeof WebSocket !== 'undefined',
      supported: WebSocketAudioToText.isSupported()
    };
  }
}

export default WebSocketAudioToText;
