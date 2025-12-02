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

  // WebSocket 配置（根据文档 2.1.2.1 实时语音识别WebSocket接口）
  websocket: {
    params: {
      // 语音编码方式，1：pcm
      voice_format: '1',

      // 开启 VAD（人声检测切分功能）
      needvad: '1',

      // 识别结果文本编码方式，0：UTF-8
      result_text_format: '0',

      // 是否过滤脏词，0：不过滤
      filter_dirty: '0',

      // 是否过滤语气词，0：不过滤
      filter_modal: '0',

      // 是否过滤句末的句号，0：不过滤
      filter_punc: '0',

      // 是否进行阿拉伯数字智能转换，1：智能转换
      convert_num_mode: '1',

      // 是否显示词级别时间戳，0：不显示
      word_info: '0',

      // 语音断句检测阈值，单位ms（16k引擎为390-2000）
      vad_silence_time: '1000'

      // 可选参数（需要时可以添加）：
      // hotword_id: 热词表id
      // customization_id: 自学习模型id
    }
  }
};
