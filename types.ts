// 私有化服务配置状态
export interface ApiConfig {
  serverIp: string;     // 服务器 IP
  loginPort: string;    // 默认 30886
  servicePort: string;  // 默认 30888
  username: string;
  password: string;
  sessionId: string;    // 登录后获取的 Cookie SESSION
}

// LLM 提供商类型
export type LlmProvider = 'openai' | 'qwen' | 'deepseek' | 'grok' | 'none';

// LLM 配置
export interface LlmConfig {
  provider: LlmProvider;
  apiKey: string;
  model: string;
}

// 2.1.2 实时语音识别响应类型
export interface RealTimeResult {
  slice_type: number; // 0:开始, 1:中间结果, 2:结束
  index: number;
  start_time: number;
  end_time: number;
  voice_text_str: string;
  word_size: number;
  word_list: any[];
}

export interface RealTimeResponse {
  code: number | string;
  message: string;
  voice_id: string;
  message_id?: string;
  result?: RealTimeResult; // 识别阶段返回
  final?: number; // 结束阶段返回 1
}

// 2.2 一句话识别响应类型
export interface OneSentenceResponse {
  RequestId: string;
  Result: string;
  AudioDuration: number;
  WordSize?: number;
  WordList?: any[];
}
