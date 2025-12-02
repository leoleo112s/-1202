import React, { useState, useRef } from 'react';
import { ApiConfig, LlmConfig, OneSentenceResponse } from '../types';
import { downsampleBuffer, floatTo16BitPCM, encodeWAV, blobToBase64 } from '../utils/audioUtils';
import { callLlmApi } from '../utils/llmApi';
import { Mic, Send, Loader2, AlertTriangle, Bot, FileAudio } from 'lucide-react';

interface OneSentenceASRProps {
  config: ApiConfig;
  llmConfig: LlmConfig;
}

export const OneSentenceASR: React.FC<OneSentenceASRProps> = ({ config, llmConfig }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<string>('');
  const [debugInfo, setDebugInfo] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  // AI State
  const [aiResponse, setAiResponse] = useState<string>('');
  const [isAiLoading, setIsAiLoading] = useState(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const audioChunksRef = useRef<Float32Array[]>([]);

  const startRecording = async () => {
    try {
      setError(null);
      setResult('');
      setAiResponse('');
      setDebugInfo('');
      audioChunksRef.current = [];

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = audioContext;

      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }

      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        const chunk = new Float32Array(inputData);
        audioChunksRef.current.push(chunk);
      };

      const gainNode = audioContext.createGain();
      gainNode.gain.value = 0;
      
      source.connect(processor);
      processor.connect(gainNode);
      gainNode.connect(audioContext.destination);

      setIsRecording(true);
    } catch (e: any) {
      setError(`无法访问麦克风：${e.message}`);
    }
  };

  const stopAndProcess = async () => {
    if (!isRecording) return;
    
    // Stop recording
    if (processorRef.current) { processorRef.current.disconnect(); processorRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach(track => track.stop()); streamRef.current = null; }
    if (audioContextRef.current) { audioContextRef.current.close(); audioContextRef.current = null; }

    setIsRecording(false);
    setIsProcessing(true);

    try {
      if (audioChunksRef.current.length === 0) throw new Error("未录制到音频");

      // 1. Merge & Convert
      const totalLength = audioChunksRef.current.reduce((acc, chunk) => acc + chunk.length, 0);
      const fullBuffer = new Float32Array(totalLength);
      let offset = 0;
      for (const chunk of audioChunksRef.current) {
        fullBuffer.set(chunk, offset);
        offset += chunk.length;
      }

      // 2. Resample (文档可选 16k/8k, 这里统一 16k)
      const resampled = downsampleBuffer(fullBuffer, 48000, 16000); 
      
      // 3. Create WAV Blob & Base64
      const wavBlob = encodeWAV(resampled, 16000);
      const base64Data = await blobToBase64(wavBlob);

      setDebugInfo(`Audio prepared: ${(base64Data.length / 1024).toFixed(2)} KB (Base64). Sending to API...`);

      // 4. Call API (2.2 一句话识别)
      await sendToHttpApi(base64Data, wavBlob.size);

    } catch (e: any) {
      setError(`处理失败：${e.message}`);
      setDebugInfo(prev => prev + `\nError: ${e.message}`);
      setIsProcessing(false);
    }
  };

  const sendToHttpApi = async (base64Data: string, dataLen: number) => {
    const url = `http://${config.serverIp}:${config.servicePort}/iapp/general/call/sentence_recognition`; // URL 路径根据文档 2.2 推断
    
    // 文档 2.2.1 参数
    const payload = {
        SourceType: 1, // 本地数据
        VoiceFormat: 'wav',
        UsrAudioKey: `audio_${Date.now()}`,
        Data: base64Data,
        DataLen: dataLen,
        FilterDirty: 0,
        ConvertNumMode: 1
    };

    try {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json'
        };
        // 尝试手动携带 SESSION，虽然浏览器 fetch 可能不支持手动 Set Cookie，
        // 但对于某些非标准浏览器环境或代理，这是必要的。
        if (config.sessionId) {
            headers['Cookie'] = `SESSION=${config.sessionId}`;
        }

        const response = await fetch(url, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data: OneSentenceResponse = await response.json();
        setDebugInfo(prev => prev + `\nResponse: ${JSON.stringify(data, null, 2)}`);

        if (data.Result) {
            setResult(data.Result);
        } else {
            setResult("(无识别结果)");
        }

    } catch (e: any) {
        console.error(e);
        setError(`请求失败: ${e.message}`);
        setDebugInfo(prev => prev + `\nRequest Failed: ${e.message} (Is CORS enabled on server?)`);
    } finally {
        setIsProcessing(false);
    }
  };

  const handleAskAI = async () => {
    if (!result) return;
    
    setIsAiLoading(true);
    setAiResponse('');
    try {
        const response = await callLlmApi(llmConfig, result);
        setAiResponse(response);
    } catch (e: any) {
        setAiResponse(`Error: ${e.message}`);
    } finally {
        setIsAiLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="bg-slate-800 p-6 rounded-xl shadow-lg border border-slate-700">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <FileAudio className="text-purple-400" />
            一句话识别 (HTTP POST)
          </h2>
          <div className="text-xs text-slate-400 bg-slate-900 px-2 py-1 rounded border border-slate-700">
             Doc 2.2
          </div>
        </div>

        <div className="flex flex-col items-center justify-center p-8 bg-slate-900/50 rounded-lg border-2 border-dashed border-slate-700 mb-6">
          {!isRecording && !isProcessing && (
            <button
              onClick={startRecording}
              className="w-20 h-20 rounded-full flex items-center justify-center transition-all bg-purple-600 hover:bg-purple-500 shadow-lg shadow-purple-900/50"
            >
              <Mic size={32} className="text-white" />
            </button>
          )}

          {isRecording && (
            <div className="flex flex-col items-center animate-pulse">
              <button
                onClick={stopAndProcess}
                className="w-20 h-20 rounded-full bg-red-500 flex items-center justify-center shadow-lg shadow-red-900/50 mb-2"
              >
                <div className="w-8 h-8 bg-white rounded-sm" />
              </button>
              <span className="text-red-400 font-medium">正在录音... 点击识别</span>
            </div>
          )}

          {isProcessing && (
            <div className="flex flex-col items-center">
              <Loader2 className="animate-spin text-purple-400 mb-2" size={40} />
              <span className="text-slate-400">正在上传与识别...</span>
            </div>
          )}

          {!isRecording && !isProcessing && (
            <p className="mt-4 text-slate-400 text-sm">
              点击麦克风录音，停止后发送 HTTP POST 请求。
              <br/>
              <span className="text-xs text-slate-500">Target: {config.serverIp}:{config.servicePort}</span>
            </p>
          )}
        </div>

        {error && (
          <div className="p-3 bg-red-500/10 text-red-400 rounded-lg text-sm mb-4">
            <div className="flex items-center gap-2 font-bold mb-1">
              <AlertTriangle size={14} /> 错误
            </div>
            {error}
          </div>
        )}

        {result && (
          <div className="bg-slate-900 rounded-lg p-4 border border-slate-700">
            <div className="flex items-start gap-3">
              <div className="bg-green-500/20 p-2 rounded">
                 <Send className="text-green-400" size={16} />
              </div>
              <div>
                <p className="text-slate-200 text-lg font-medium">{result}</p>
              </div>
            </div>
          </div>
        )}
        
        {debugInfo && (
          <details className="mt-4">
              <summary className="text-xs text-slate-500 cursor-pointer">调试信息</summary>
              <pre className="mt-2 p-2 bg-black/30 rounded text-[10px] text-slate-500 overflow-x-auto whitespace-pre-wrap">
                {debugInfo}
              </pre>
          </details>
        )}
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
                        disabled={isAiLoading || !result}
                        className={`px-4 py-1.5 rounded-lg text-sm flex items-center gap-2 transition-colors ${
                            isAiLoading || !result
                            ? 'bg-slate-700 text-slate-500' 
                            : 'bg-purple-600 hover:bg-purple-500 text-white'
                        }`}
                    >
                        {isAiLoading ? '思考中...' : <><Send size={14}/> 发送给 AI</>}
                    </button>
                </div>
                <div className="bg-slate-900 rounded-lg p-4 min-h-[100px] border border-slate-700 text-slate-300 leading-relaxed whitespace-pre-wrap">
                    {aiResponse || <span className="text-slate-600 italic">等待识别结果...</span>}
                </div>
            </div>
        )}
    </div>
  );
};