/**
 * 实时语音转文字功能类
 */
export class WebSocketAudioToText {
  private ws: WebSocket | null = null;
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private scriptProcessor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private readonly SAMPLE_RATE = 16000;
  private readonly URL = '/asr'
  
  private onTranscriptCallback: ((text: string, isFinal: boolean) => void) | null = null;
  private onErrorCallback: ((error: string) => void) | null = null;
  private onStatusChangeCallback: ((status: 'connecting' | 'connected' | 'disconnected') => void) | null = null;

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
      this.onStatusChangeCallback?.('connecting');
      
      // 获取麦克风权限
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true
        } 
      });
      
      // 创建音频上下文
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      
      // 创建音频源
      this.source = this.audioContext.createMediaStreamSource(this.mediaStream);
      
      // 创建ScriptProcessorNode处理音频数据
      this.scriptProcessor = this.audioContext.createScriptProcessor(4096, 1, 1);
      
      // 处理音频数据
      this.scriptProcessor.onaudioprocess = (event) => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          const inputData = event.inputBuffer.getChannelData(0);
          const pcmData = this.convertFloat32ToInt16(inputData);
          this.ws.send(pcmData);
        }
      };
      
      // 连接音频节点
      this.source.connect(this.scriptProcessor);
      this.scriptProcessor.connect(this.audioContext.destination);
      
      // 连接WebSocket
      this.connectWebSocket();
    } catch (error) {
      const errorMsg = '麦克风访问失败，请检查浏览器权限设置';
      console.error(errorMsg, error);
      this.onErrorCallback?.(errorMsg);
      this.stop();
    }
  }

  /**
   * Float32数组转Int16数组
   * @param buffer Float32数组
   * @returns Int16数组缓冲区
   */
  private convertFloat32ToInt16(buffer: Float32Array): ArrayBuffer {
    const length = buffer.length;
    const bytes = new Int16Array(length);
    for (let i = 0; i < length; i++) {
      const s = Math.max(-1, Math.min(1, buffer[i]));
      bytes[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return bytes.buffer;
  }

  /**
   * 连接WebSocket
   */
  private connectWebSocket(): void {
    try {
      
      this.ws = new WebSocket(this.URL);
      console.log('wss', this.URL)
      
      this.ws.onopen = () => {
        this.onStatusChangeCallback?.('connected');
      };
      
      this.ws.onmessage = (event) => {
        try {
          console.log('收到WebSocket消息:', event.data);
          console.log('event.data类型', typeof event.data);
          if (typeof event.data === 'string') {
            try {
              const data = JSON.parse(event.data);
              console.log('解析后的数据:', data);
            } catch (error) {
              console.error('JSON解析错误:', error);
            }
          }
          // 检查消息类型
          if (event.data instanceof Blob) {
            // 处理Blob类型的二进制消息
            const reader = new FileReader();
            reader.onload = () => {
              this.handleMessageData(reader.result as string);
            };
            reader.readAsText(event.data);
          } else if (event.data instanceof ArrayBuffer) {
            // 处理ArrayBuffer类型的二进制消息
            const text = new TextDecoder().decode(event.data);
            this.handleMessageData(text);
          } else {
            // 处理文本消息
            this.handleMessageData(event.data);
          }
        } catch (e) {
          console.error('ASR结果解析错误:', e);
        }
      };
      
      this.ws.onerror = (err) => {
        const errorMsg = 'WebSocket连接错误';
        console.error(errorMsg, err);
        this.onErrorCallback?.(errorMsg);
        this.onStatusChangeCallback?.('disconnected');
      };
      
      this.ws.onclose = () => {
        this.onStatusChangeCallback?.('disconnected');
      };
    } catch (error) {
      const errorMsg = 'WebSocket连接失败';
      console.error(errorMsg, error);
      this.onErrorCallback?.(errorMsg);
    }
  }

  /**
   * 处理WebSocket消息数据
   * @param data 消息数据
   */
  private handleMessageData(data: string | ArrayBuffer): void {
    try {
      const result = JSON.parse(data as string);
      if (result.code === 0 && result.result) {
        const voiceTextStr = result.result.voiceTextStr || '';
        // sliceType === 1 表示实时中间结果
        // sliceType === 2 表示最终结果
        const isFinal = result.result.sliceType === 2;
        this.onTranscriptCallback?.(voiceTextStr, isFinal);
      } else if (result.code !== 0) {
        console.error('ASR错误:', result.message);
        this.onErrorCallback?.(`识别错误: ${result.message}`);
      }
    } catch (e) {
      console.error('ASR结果解析错误:', e);
      // 如果不是JSON格式，可能是其他格式的二进制数据
      console.warn('收到非JSON格式消息:', data);
    }
  }

  /**
   * 停止语音识别
   */
  public stop(): void {
    // 发送结束信号
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ isEnd: true }));
    }
    
    // 关闭WebSocket连接
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    
    // 断开音频节点连接并关闭
    if (this.scriptProcessor) {
      this.scriptProcessor.disconnect();
      this.scriptProcessor = null;
    }
    
    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }
    
    // 停止媒体流轨道
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }
    
    // 关闭音频上下文
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    
    this.onStatusChangeCallback?.('disconnected');
  }

  /**
   * 检查浏览器是否支持所需的API
   */
  public static isSupported(): boolean {
    return !!(
      typeof navigator !== 'undefined' &&
      navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia !== 'undefined' &&
      (window.AudioContext || (window as any).webkitAudioContext)
    );
  }
}

export default WebSocketAudioToText;