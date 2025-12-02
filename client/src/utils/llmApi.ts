import { LlmConfig } from "../types";

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

// 各厂商的基础 URL 配置
const API_ENDPOINTS: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1', // 通义千问兼容 OpenAI 接口
  deepseek: 'https://api.deepseek.com',
  grok: 'https://api.x.ai/v1',
};

export const callLlmApi = async (
  config: LlmConfig, 
  prompt: string, 
  history: ChatMessage[] = []
): Promise<string> => {
  if (config.provider === 'none' || !config.apiKey) {
    throw new Error("请先在左侧配置大模型厂商及 API Key");
  }

  const baseUrl = API_ENDPOINTS[config.provider];
  if (!baseUrl) {
    throw new Error(`未知的模型提供商: ${config.provider}`);
  }

  const messages = [
    { role: 'system', content: '你是 AIOS 语音助手，请简练、准确地回答用户的问题。' },
    ...history,
    { role: 'user', content: prompt }
  ];

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model: config.model,
        messages: messages,
        temperature: 0.7,
        stream: false // 暂使用非流式，简化实现
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      let errMsg = `API Error ${response.status}`;
      try {
          const jsonErr = JSON.parse(errText);
          errMsg = jsonErr.error?.message || jsonErr.message || errMsg;
      } catch (e) {
          errMsg += `: ${errText.substring(0, 100)}`;
      }
      throw new Error(errMsg);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || "无回复内容";

  } catch (error: any) {
    console.error("LLM Call Error:", error);
    throw new Error(error.message || "请求大模型失败");
  }
};