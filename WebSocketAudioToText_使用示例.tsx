/**
 * WebSocketAudioToText 使用示例
 *
 * 展示如何在 React 组件中使用优化后的 WebSocketAudioToText 类
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { WebSocketAudioToText } from './WebSocketAudioToText';

// ASR 配置接口
interface AsrConfig {
  serverIp: string;
  loginPort: number;
  servicePort: number;
  username: string;
  password: string;
}

/**
 * 实时语音识别组件示例
 */
export function RealTimeASRExample() {
  // 状态管理
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [finalTranscripts, setFinalTranscripts] = useState<string[]>([]);
  const [status, setStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [error, setError] = useState<string | null>(null);

  // ASR 配置
  const [config, setConfig] = useState<AsrConfig>({
    serverIp: '192.168.1.100',
    loginPort: 30886,
    servicePort: 30888,
    username: 'superuser',
    password: ''
  });

  // ASR 实例引用
  const asrRef = useRef<WebSocketAudioToText | null>(null);

  // 初始化 ASR 实例
  useEffect(() => {
    // 检查浏览器支持
    if (!WebSocketAudioToText.isSupported()) {
      const supportInfo = WebSocketAudioToText.getSupportInfo();
      console.error('浏览器不支持实时语音识别:', supportInfo);
      setError('您的浏览器不支持实时语音识别功能');
      return;
    }

    // 创建 ASR 实例
    const asr = new WebSocketAudioToText();

    // 设置 ASR 配置
    asr.setAsrConfig(config);

    // 设置识别结果回调
    asr.setOnTranscriptCallback((text, isFinal) => {
      if (isFinal) {
        // 最终结果
        console.log('[示例] 最终识别结果:', text);
        setFinalTranscripts((prev) => [...prev, text]);
        setTranscript(''); // 清空临时结果
      } else {
        // 临时结果
        console.log('[示例] 临时识别结果:', text);
        setTranscript(text);
      }
    });

    // 设置错误回调
    asr.setOnErrorCallback((errorMsg) => {
      console.error('[示例] ASR 错误:', errorMsg);
      setError(errorMsg);
    });

    // 设置状态变更回调
    asr.setOnStatusChangeCallback((newStatus) => {
      console.log('[示例] 状态变更:', newStatus);
      setStatus(newStatus);
    });

    asrRef.current = asr;

    // 清理函数
    return () => {
      if (asrRef.current) {
        console.log('[示例] 组件卸载，停止 ASR');
        asrRef.current.stop();
      }
    };
  }, []); // 只在组件挂载时初始化

  // 更新 ASR 配置
  useEffect(() => {
    if (asrRef.current && !isRecording) {
      asrRef.current.setAsrConfig(config);
      console.log('[示例] ASR 配置已更新:', config);
    }
  }, [config, isRecording]);

  // 开始录音
  const handleStart = useCallback(async () => {
    if (!asrRef.current) {
      setError('ASR 实例未初始化');
      return;
    }

    try {
      setError(null);
      console.log('[示例] 开始语音识别...');
      await asrRef.current.start();
      setIsRecording(true);
    } catch (err) {
      console.error('[示例] 启动失败:', err);
      const errorMsg = err instanceof Error ? err.message : '启动失败';
      setError(errorMsg);
    }
  }, []);

  // 停止录音
  const handleStop = useCallback(() => {
    if (!asrRef.current) {
      return;
    }

    console.log('[示例] 停止语音识别...');
    asrRef.current.stop();
    setIsRecording(false);
  }, []);

  // 清空识别结果
  const handleClear = useCallback(() => {
    setTranscript('');
    setFinalTranscripts([]);
    setError(null);
  }, []);

  // 获取状态显示文本
  const getStatusText = () => {
    switch (status) {
      case 'connecting':
        return '正在连接...';
      case 'connected':
        return '已连接';
      case 'disconnected':
        return '未连接';
      default:
        return '未知';
    }
  };

  // 获取状态颜色
  const getStatusColor = () => {
    switch (status) {
      case 'connecting':
        return 'text-yellow-600';
      case 'connected':
        return 'text-green-600';
      case 'disconnected':
        return 'text-gray-600';
      default:
        return 'text-gray-600';
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">实时语音识别示例</h1>

      {/* ASR 配置 */}
      <div className="mb-6 p-4 bg-gray-50 rounded-lg">
        <h2 className="text-lg font-semibold mb-4">ASR 服务器配置</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">服务器 IP</label>
            <input
              type="text"
              value={config.serverIp}
              onChange={(e) => setConfig({ ...config, serverIp: e.target.value })}
              disabled={isRecording}
              className="w-full px-3 py-2 border rounded"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">登录端口</label>
            <input
              type="number"
              value={config.loginPort}
              onChange={(e) => setConfig({ ...config, loginPort: parseInt(e.target.value) })}
              disabled={isRecording}
              className="w-full px-3 py-2 border rounded"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">服务端口</label>
            <input
              type="number"
              value={config.servicePort}
              onChange={(e) => setConfig({ ...config, servicePort: parseInt(e.target.value) })}
              disabled={isRecording}
              className="w-full px-3 py-2 border rounded"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">用户名</label>
            <input
              type="text"
              value={config.username}
              onChange={(e) => setConfig({ ...config, username: e.target.value })}
              disabled={isRecording}
              className="w-full px-3 py-2 border rounded"
            />
          </div>
        </div>
      </div>

      {/* 状态显示 */}
      <div className="mb-6 flex items-center gap-4">
        <div>
          <span className="text-sm font-medium mr-2">连接状态:</span>
          <span className={`font-semibold ${getStatusColor()}`}>
            {getStatusText()}
          </span>
        </div>
        {isRecording && (
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-red-600 rounded-full animate-pulse"></div>
            <span className="text-sm text-red-600 font-medium">正在录音...</span>
          </div>
        )}
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-600 font-medium">错误: {error}</p>
        </div>
      )}

      {/* 控制按钮 */}
      <div className="mb-6 flex gap-4">
        <button
          onClick={isRecording ? handleStop : handleStart}
          className={`px-6 py-3 rounded-lg font-semibold text-white ${
            isRecording
              ? 'bg-red-600 hover:bg-red-700'
              : 'bg-blue-600 hover:bg-blue-700'
          }`}
        >
          {isRecording ? '停止录音' : '开始录音'}
        </button>

        <button
          onClick={handleClear}
          disabled={isRecording}
          className="px-6 py-3 rounded-lg font-semibold bg-gray-600 text-white hover:bg-gray-700 disabled:bg-gray-400"
        >
          清空结果
        </button>
      </div>

      {/* 识别结果显示 */}
      <div className="space-y-4">
        {/* 临时结果 */}
        {transcript && (
          <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-sm font-medium text-yellow-800 mb-2">临时识别结果:</p>
            <p className="text-gray-800">{transcript}</p>
          </div>
        )}

        {/* 最终结果列表 */}
        {finalTranscripts.length > 0 && (
          <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-sm font-medium text-green-800 mb-2">最终识别结果:</p>
            <div className="space-y-2">
              {finalTranscripts.map((text, index) => (
                <div key={index} className="p-2 bg-white rounded border border-green-100">
                  <span className="text-sm text-gray-500 mr-2">#{index + 1}</span>
                  <span className="text-gray-800">{text}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 空状态 */}
        {!transcript && finalTranscripts.length === 0 && (
          <div className="p-8 text-center text-gray-500">
            <p>点击"开始录音"按钮开始语音识别</p>
          </div>
        )}
      </div>

      {/* 使用说明 */}
      <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <h3 className="text-sm font-semibold text-blue-800 mb-2">使用说明:</h3>
        <ul className="text-sm text-blue-700 space-y-1">
          <li>1. 配置 ASR 服务器信息（服务器 IP、端口、用户名）</li>
          <li>2. 点击"开始录音"按钮，允许浏览器访问麦克风</li>
          <li>3. 开始说话，系统会实时显示识别结果</li>
          <li>4. 临时结果会显示在黄色区域，最终结果会显示在绿色区域</li>
          <li>5. 点击"停止录音"结束识别</li>
        </ul>
      </div>

      {/* 浏览器支持信息（开发调试用） */}
      {process.env.NODE_ENV === 'development' && (
        <div className="mt-8 p-4 bg-gray-50 border border-gray-200 rounded-lg">
          <h3 className="text-sm font-semibold text-gray-800 mb-2">浏览器支持信息（仅开发环境显示）:</h3>
          <pre className="text-xs text-gray-600 overflow-auto">
            {JSON.stringify(WebSocketAudioToText.getSupportInfo(), null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

export default RealTimeASRExample;


/**
 * 简化版示例 - 最小化使用
 */
export function MinimalASRExample() {
  const [isRecording, setIsRecording] = useState(false);
  const [result, setResult] = useState('');
  const asrRef = useRef<WebSocketAudioToText | null>(null);

  useEffect(() => {
    const asr = new WebSocketAudioToText();

    asr.setAsrConfig({
      serverIp: '192.168.1.100',
      loginPort: 30886,
      servicePort: 30888,
      username: 'superuser',
      password: ''
    });

    asr.setOnTranscriptCallback((text) => setResult(text));
    asr.setOnErrorCallback((error) => alert(error));

    asrRef.current = asr;

    return () => asr.stop();
  }, []);

  const toggle = async () => {
    if (isRecording) {
      asrRef.current?.stop();
      setIsRecording(false);
    } else {
      await asrRef.current?.start();
      setIsRecording(true);
    }
  };

  return (
    <div className="p-4">
      <button onClick={toggle} className="px-4 py-2 bg-blue-600 text-white rounded">
        {isRecording ? '停止' : '开始'}
      </button>
      <div className="mt-4">{result}</div>
    </div>
  );
}


/**
 * 自定义 Hook 示例
 */
export function useASR(config: AsrConfig) {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [status, setStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [error, setError] = useState<string | null>(null);
  const asrRef = useRef<WebSocketAudioToText | null>(null);

  useEffect(() => {
    if (!WebSocketAudioToText.isSupported()) {
      setError('浏览器不支持语音识别');
      return;
    }

    const asr = new WebSocketAudioToText();
    asr.setAsrConfig(config);
    asr.setOnTranscriptCallback((text, isFinal) => {
      setTranscript(text);
      if (isFinal) {
        setTranscript('');
      }
    });
    asr.setOnErrorCallback(setError);
    asr.setOnStatusChangeCallback(setStatus);

    asrRef.current = asr;

    return () => {
      if (asrRef.current) {
        asrRef.current.stop();
      }
    };
  }, [config]);

  const start = useCallback(async () => {
    if (asrRef.current) {
      try {
        setError(null);
        await asrRef.current.start();
        setIsRecording(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : '启动失败');
      }
    }
  }, []);

  const stop = useCallback(() => {
    if (asrRef.current) {
      asrRef.current.stop();
      setIsRecording(false);
    }
  }, []);

  return {
    isRecording,
    transcript,
    status,
    error,
    start,
    stop
  };
}

/**
 * 使用自定义 Hook 的组件示例
 */
export function ASRWithHookExample() {
  const asr = useASR({
    serverIp: '192.168.1.100',
    loginPort: 30886,
    servicePort: 30888,
    username: 'superuser',
    password: ''
  });

  return (
    <div className="p-4">
      <button
        onClick={asr.isRecording ? asr.stop : asr.start}
        className="px-4 py-2 bg-blue-600 text-white rounded"
      >
        {asr.isRecording ? '停止' : '开始'}
      </button>
      <div className="mt-2">状态: {asr.status}</div>
      {asr.error && <div className="mt-2 text-red-600">{asr.error}</div>}
      <div className="mt-4">{asr.transcript}</div>
    </div>
  );
}
