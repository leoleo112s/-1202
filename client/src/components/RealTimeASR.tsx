import React, { useState, useRef, useEffect } from 'react';
import { ApiConfig, RealTimeResponse, LlmConfig } from '../types';
import { downsampleBuffer, floatTo16BitPCM } from '../utils/audioUtils';
import { callLlmApi } from '../utils/llmApi';
import { Mic, MicOff, Activity, Bot, Send } from 'lucide-react';
import { config as appConfig } from '../config';

interface RealTimeASRProps {
  config: ApiConfig;
  llmConfig: LlmConfig;
}

const SAMPLE_RATE = 16000;
const BUFFER_SIZE = 4096;

export const RealTimeASR: React.FC<RealTimeASRProps> = ({ config, llmConfig }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [status, setStatus] = useState<string>('就绪');
  const [logs, setLogs] = useState<string[]>([]);
  const [finalText, setFinalText] = useState<string>('');
  const [currentText, setCurrentText] = useState<string>('');
  
  // LLM State
  const [aiResponse, setAiResponse] = useState<string>('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number>(0);
  
  const isTranscribingRef = useRef<boolean>(false);
  const packetCountRef = useRef<number>(0);

  const addLog = (msg: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [`[${timestamp}] ${msg}`, ...prev.slice(0, 49)]);
  };

  const generateVoiceId = () => {
    return 'xxxxxxxxxxxxxxxx'.replace(/[x]/g, function(c) {
      var r = Math.random() * 16 | 0;
      return r.toString(16);
    });
  };

  const cleanup = () => {
    isTranscribingRef.current = false;

    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    if (processorRef.current) { processorRef.current.disconnect(); processorRef.current = null; }
    if (gainNodeRef.current) { gainNodeRef.current.disconnect(); gainNodeRef.current = null; }
    if (analyserRef.current) { analyserRef.current.disconnect(); analyserRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach(track => track.stop()); streamRef.current = null; }
    if (audioContextRef.current) { audioContextRef.current.close(); audioContextRef.current = null; }
    
    if (wsRef.current) {
      if (wsRef.current.readyState === WebSocket.OPEN) {
        // 2.1.2.3 结束阶段：发送 {"type": "end"}
        try {
          wsRef.current.send(JSON.stringify({ type: 'end' }));
        } catch(e) { /* ignore */ }
      }
      wsRef.current.close();
      wsRef.current = null;
    }
  };

  // Draw Volume Meter
  const drawVolume = () => {
    if (!analyserRef.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyserRef.current.getByteFrequencyData(dataArray);

    let sum = 0;
    for(let i = 0; i < bufferLength; i++) sum += dataArray[i];
    const average = sum / bufferLength;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const barWidth = (average / 255) * canvas.width;
    
    ctx.fillStyle = '#22c55e';
    if (average > 10) ctx.fillRect(0, 0, barWidth, canvas.height);
    
    animationFrameRef.current = requestAnimationFrame(drawVolume);
  };

  const startRecording = async () => {
    if (!config.sessionId) {
      addLog("警告：未配置 SESSION ID，可能会导致连接失败（请先登录）");
    }
    
    try {
        setStatus('正在初始化...');
        
        // 1. Audio Context
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        audioContextRef.current = audioContext;

        // 2. Microphone
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;

        // 3. Audio Node Graph
        const source = audioContext.createMediaStreamSource(stream);
        const processor = audioContext.createScriptProcessor(BUFFER_SIZE, 1, 1);
        const gainNode = audioContext.createGain();
        const analyser = audioContext.createAnalyser();
        
        gainNode.gain.value = 0;
        analyser.fftSize = 256;

        processorRef.current = processor;
        gainNodeRef.current = gainNode;
        analyserRef.current = analyser;
        packetCountRef.current = 0;

        processor.onaudioprocess = (e) => {
            if (!isTranscribingRef.current || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

            const inputData = e.inputBuffer.getChannelData(0);
            const downsampled = downsampleBuffer(inputData, audioContext.sampleRate, SAMPLE_RATE);
            const pcmData = floatTo16BitPCM(downsampled);
            
            try {
                // 2.1.2.2 识别阶段：发送二进制音频流
                wsRef.current.send(pcmData.buffer); 
                packetCountRef.current++;
                if (packetCountRef.current % 50 === 0) { // Log occasionally
                    // addLog(`已发送 ${packetCountRef.current} 个音频包`);
                }
            } catch (err) {
                console.error("发送失败:", err);
            }
        };

        source.connect(analyser);
        analyser.connect(processor);
        processor.connect(gainNode);
        gainNode.connect(audioContext.destination);

        drawVolume();

        if (audioContext.state === 'suspended') {
            await audioContext.resume();
        }

        addLog('麦克风已就绪，正在连接服务器...');
        connectWebSocket();

    } catch (e) {
        addLog(`无法启动录音: ${e}`);
        setStatus('错误');
        cleanup();
    }
  };

  const connectWebSocket = () => {
    // 连接到本地后端的 WebSocket 服务
    // 将 ASR 配置作为查询参数传递给后端
    const params = new URLSearchParams({
        serverIp: config.serverIp,
        loginPort: config.loginPort,
        servicePort: config.servicePort,
        username: config.username,
        password: config.password
    });

    const wsUrl = `${appConfig.wsUrl}/asr?${params.toString()}`;

    try {
      addLog(`连接本地后端 WebSocket...`);
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      ws.binaryType = 'arraybuffer';

      ws.onopen = () => {
        addLog('WebSocket 已连接，等待握手响应...');
        // 握手阶段只需建立连接，服务端会返回 code: 0
      };

      ws.onmessage = (event) => {
        // 响应结果为 json 序列化字符串
        try {
            const msgStr = typeof event.data === 'string' 
                ? event.data 
                : new TextDecoder().decode(event.data);
            
            const data: RealTimeResponse = JSON.parse(msgStr);

            // 握手响应
            if (data.code === 0 && !isTranscribingRef.current && !data.result) {
                 addLog(`握手成功 (VoiceID: ${data.voice_id})`);
                 setStatus('正在识别中...');
                 setIsRecording(true);
                 isTranscribingRef.current = true;
                 return;
            }

            // 识别结果
            if (data.result) {
                const res = data.result;
                // slice_type: 0:开始, 1:识别中, 2:稳态结束
                if (res.slice_type === 1) {
                    setCurrentText(res.voice_text_str);
                } else if (res.slice_type === 2) {
                    setFinalText(prev => prev + res.voice_text_str);
                    setCurrentText('');
                    addLog(`识别: ${res.voice_text_str}`);
                }
            }

            // 结束响应 (final=1)
            if (data.final === 1) {
                addLog("识别结束 (Final)");
                stopRecording();
            }

        } catch (e) {
            console.error("Parse Error:", e);
        }
      };

      ws.onerror = (e) => {
        addLog('WebSocket 连接错误 (请检查 SESSION 是否过期或跨域问题)');
        setStatus('错误');
        stopRecording();
      };

      ws.onclose = () => {
        addLog('WebSocket 已关闭');
        if (isRecording) stopRecording();
      };

    } catch (e) {
      addLog(`连接失败：${e}`);
      setStatus('错误');
    }
  };

  const stopRecording = () => {
    setIsRecording(false);
    setStatus('就绪');
    cleanup();
  };

  const handleAskAI = async () => {
    if (!finalText && !currentText) return;
    const prompt = finalText + currentText;
    
    setIsAiLoading(true);
    setAiResponse('');
    try {
        const response = await callLlmApi(llmConfig, prompt);
        setAiResponse(response);
    } catch (e: any) {
        setAiResponse(`Error: ${e.message}`);
    } finally {
        setIsAiLoading(false);
    }
  };

  useEffect(() => {
    return () => cleanup();
  }, []);

  return (
    <div className="grid grid-cols-1 gap-6">
        <div className="bg-slate-800 p-6 rounded-xl shadow-lg border border-slate-700">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                <Activity className="text-blue-400" />
                实时转写 (WS Private)
                </h2>
                <div className="flex items-center gap-4">
                    <div className="w-20 h-4 bg-slate-900 rounded-full overflow-hidden border border-slate-700 relative">
                        <canvas ref={canvasRef} width={80} height={16} className="absolute top-0 left-0 w-full h-full" />
                    </div>
                    <div className={`px-3 py-1 rounded-full text-xs font-medium ${
                        status === '正在识别中...' ? 'bg-red-500/20 text-red-400 animate-pulse' : 
                        status === '就绪' ? 'bg-green-500/20 text-green-400' : 'bg-slate-700 text-slate-300'
                    }`}>
                    {status}
                    </div>
                </div>
            </div>

            <div className="mb-6 space-y-4">
                <div className="bg-slate-900 rounded-lg p-4 min-h-[120px] border border-slate-700 relative">
                <p className="text-slate-500 text-xs mb-2 uppercase tracking-wide">Transcript</p>
                <div className="text-lg text-slate-200 leading-relaxed">
                    {finalText}
                    <span className="text-blue-400 italic">{currentText}</span>
                    <span className={`inline-block w-2 h-4 ml-1 bg-blue-500 ${isRecording ? 'animate-blink' : 'hidden'}`}></span>
                </div>
                </div>
            </div>

            <div className="flex gap-4 mb-4">
                {!isRecording ? (
                <button
                    onClick={startRecording}
                    disabled={!config.serverIp}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg font-medium transition-colors ${
                    !config.serverIp ? 'bg-slate-700 text-slate-500 cursor-not-allowed' :
                    'bg-blue-600 hover:bg-blue-500 text-white'
                    }`}
                >
                    <Mic size={20} />
                    开始对话
                </button>
                ) : (
                <button
                    onClick={stopRecording}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-lg font-medium bg-red-600 hover:bg-red-500 text-white transition-colors"
                >
                    <MicOff size={20} />
                    结束对话
                </button>
                )}
                <button 
                    onClick={() => { setFinalText(''); setCurrentText(''); setLogs([]); setAiResponse(''); }}
                    className="px-4 py-3 rounded-lg border border-slate-600 hover:bg-slate-700 text-slate-300 transition-colors"
                >
                    清空
                </button>
            </div>
            
            <div className="bg-black/30 rounded-lg p-3 h-32 overflow-y-auto scrollbar-hide text-xs font-mono text-slate-500">
                {logs.map((log, i) => (
                <div key={i}>{log}</div>
                ))}
            </div>
        </div>

        {llmConfig.provider !== 'none' && (
            <div className="bg-slate-800 p-6 rounded-xl shadow-lg border border-purple-500/30">
                 <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                        <Bot className="text-purple-400" />
                        AI 回复 ({llmConfig.provider})
                    </h2>
                    <button
                        onClick={handleAskAI}
                        disabled={isAiLoading || (!finalText && !currentText)}
                        className={`px-4 py-1.5 rounded-lg text-sm flex items-center gap-2 transition-colors ${
                            isAiLoading || (!finalText && !currentText)
                            ? 'bg-slate-700 text-slate-500' 
                            : 'bg-purple-600 hover:bg-purple-500 text-white'
                        }`}
                    >
                        {isAiLoading ? '思考中...' : <><Send size={14}/> 发送给 AI</>}
                    </button>
                </div>
                <div className="bg-slate-900 rounded-lg p-4 min-h-[100px] border border-slate-700 text-slate-300 leading-relaxed whitespace-pre-wrap">
                    {aiResponse || <span className="text-slate-600 italic">等待语音输入并发送...</span>}
                </div>
            </div>
        )}
    </div>
  );
};