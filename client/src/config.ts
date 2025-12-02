/**
 * 前端配置
 */
export const config = {
  // API 基础 URL
  apiUrl: import.meta.env.VITE_API_URL || 'http://localhost:3001',

  // WebSocket URL
  wsUrl: import.meta.env.VITE_WS_URL || 'ws://localhost:3001',
};
