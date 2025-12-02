import dotenv from 'dotenv';

dotenv.config();

export const config = {
  // 服务器配置
  port: parseInt(process.env.PORT || '3001'),

  // AIOS ASR 服务器配置
  asr: {
    serverIp: process.env.ASR_SERVER_IP || '127.0.0.1',
    loginPort: parseInt(process.env.ASR_LOGIN_PORT || '30886'),
    servicePort: parseInt(process.env.ASR_SERVICE_PORT || '30888'),
    username: process.env.ASR_USERNAME || 'superuser',
    password: process.env.ASR_PASSWORD || '',
  },

  // WebSocket 配置
  websocket: {
    params: {
      voice_format: '1',  // PCM
      needvad: '1',       // 开启 VAD
      result_text_format: '0',  // UTF-8
      res_type: '1',
      filter_dirty: '0',
      filter_modal: '0',
      filter_punc: '0',
      convert_num_mode: '1',
      word_info: '0',
      vad_silence_time: '1000',
      use_text_split: '1',
      reinforce_hotword: '0',
      noise_threshold: '-40',
      sample_rate: '16000',
      channel_num: '1'
    }
  }
};
