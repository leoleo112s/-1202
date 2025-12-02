import express from 'express';
import http from 'http';
import WebSocket from 'ws';
import cors from 'cors';
import { config } from './config';
import { AsrService } from './services/AsrService';
import { WebSocketHandler } from './websocket/WebSocketHandler';
import { createApiRouter } from './routes/api';

// 创建 Express 应用
const app = express();
const server = http.createServer(app);

// 中间件
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// 日志中间件
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// 创建服务实例
const asrService = new AsrService();
const wsHandler = new WebSocketHandler(asrService);

// 注册 API 路由
app.use('/api', createApiRouter(asrService));

// 创建 WebSocket 服务器
const wss = new WebSocket.Server({
  server,
  path: '/asr'
});

// WebSocket 连接处理
wss.on('connection', (ws: WebSocket, request) => {
  wsHandler.handleConnection(ws, request);
});

// 启动服务器
server.listen(config.port, () => {
  console.log('╔═══════════════════════════════════════════════════════╗');
  console.log('║   AIOS Voice Platform Server                          ║');
  console.log('╠═══════════════════════════════════════════════════════╣');
  console.log(`║   HTTP Server: http://localhost:${config.port.toString().padEnd(25)} ║`);
  console.log(`║   WebSocket:   ws://localhost:${config.port}/asr${' '.repeat(14)} ║`);
  console.log('╠═══════════════════════════════════════════════════════╣');
  console.log(`║   ASR Server:  ${config.asr.serverIp}:${config.asr.servicePort}${' '.repeat(25 - config.asr.serverIp.length - config.asr.servicePort.toString().length)} ║`);
  console.log('╚═══════════════════════════════════════════════════════╝');
});

// 错误处理
process.on('uncaughtException', (error) => {
  console.error('[Server] Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Server] Unhandled Rejection at:', promise, 'reason:', reason);
});

// 优雅关闭
process.on('SIGTERM', () => {
  console.log('[Server] SIGTERM 信号接收,正在关闭服务器...');
  server.close(() => {
    console.log('[Server] 服务器已关闭');
    process.exit(0);
  });
});
