import { Router, Request, Response } from 'express';
import { AsrService } from '../services/AsrService';

export function createApiRouter(asrService: AsrService): Router {
  const router = Router();

  /**
   * 健康检查
   */
  router.get('/health', (req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  /**
   * 登录到 ASR 服务器
   */
  router.post('/login', async (req: Request, res: Response) => {
    try {
      const { username, password, serverIp, loginPort } = req.body;

      if (!username || !password || !serverIp) {
        return res.status(400).json({
          status: 400,
          msg: '缺少必要参数'
        });
      }

      const result = await asrService.login(
        username,
        password,
        serverIp,
        loginPort || 30886
      );

      res.json(result);
    } catch (error: any) {
      console.error('[API] 登录失败:', error);
      res.status(500).json({
        status: 500,
        msg: error.message || '登录失败'
      });
    }
  });

  /**
   * 一句话识别（代理接口）
   * 将前端的请求转发到 ASR 服务器
   */
  router.post('/sentence_recognition', async (req: Request, res: Response) => {
    try {
      const { serverIp, servicePort, audioData, sessionId } = req.body;

      if (!serverIp || !audioData) {
        return res.status(400).json({
          RequestId: '',
          Result: '',
          AudioDuration: 0,
          error: '缺少必要参数'
        });
      }

      // TODO: 实现一句话识别的代理逻辑
      // 这里需要将 audioData 转发到 ASR 服务器的一句话识别接口
      res.json({
        RequestId: `req_${Date.now()}`,
        Result: '一句话识别功能待实现',
        AudioDuration: 0
      });
    } catch (error: any) {
      console.error('[API] 一句话识别失败:', error);
      res.status(500).json({
        RequestId: '',
        Result: '',
        AudioDuration: 0,
        error: error.message
      });
    }
  });

  return router;
}
