/**
 * ASR 配置接口
 */
export interface AsrConfig {
  serverIp: string;
  loginPort: number;
  servicePort: number;
  username: string;
  password: string;
}

/**
 * ASR 实时识别结果
 */
export interface AsrResult {
  slice_type: number;  // 0:开始, 1:中间结果, 2:结束
  index: number;
  start_time: number;
  end_time: number;
  voice_text_str: string;
  word_size: number;
  word_list: any[];
}

/**
 * ASR 响应
 */
export interface AsrResponse {
  code: number | string;
  message: string;
  voice_id?: string;
  message_id?: string;
  result?: AsrResult;
  final?: number;
}

/**
 * 登录响应
 */
export interface LoginResponse {
  status: number;
  msg?: string;
  data?: {
    session?: string;
  };
}

/**
 * 会话信息
 */
export interface SessionInfo {
  sessionId: string;
  voiceId: string;
  asrWebSocket: any;
  isActive: boolean;
}
