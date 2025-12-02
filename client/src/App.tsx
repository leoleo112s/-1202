import React, { useState } from 'react';
import { ApiConfig, LlmConfig, LlmProvider } from './types';
import { RealTimeASR } from './components/RealTimeASR';
import { OneSentenceASR } from './components/OneSentenceASR';
import { Settings, LogIn, LayoutDashboard, Key, AlertCircle, CheckCircle, Bot } from 'lucide-react';
import { config } from './config';

const App: React.FC = () => {
  // 私有化接口配置
  const [apiConfig, setApiConfig] = useState<ApiConfig>({
    serverIp: '127.0.0.1',
    loginPort: '30886',
    servicePort: '30888',
    username: 'superuser',
    password: '',
    sessionId: ''
  });

  // LLM 配置
  const [llmConfig, setLlmConfig] = useState<LlmConfig>({
    provider: 'none',
    apiKey: '',
    model: ''
  });

  const [activeTab, setActiveTab] = useState<'realtime' | 'oneshot'>('realtime');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginSuccess, setLoginSuccess] = useState(false);

  // 处理配置变更
  const handleApiConfigChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setApiConfig({ ...apiConfig, [e.target.name]: e.target.value });
    if (['serverIp', 'username', 'password'].includes(e.target.name)) {
        setLoginError(null);
        setLoginSuccess(false);
    }
  };

  // 处理 LLM 配置变更
  const handleLlmConfigChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    
    if (name === 'provider') {
        let defaultModel = '';
        switch (value) {
            case 'openai': defaultModel = 'gpt-4o'; break;
            case 'qwen': defaultModel = 'qwen-plus'; break;
            case 'deepseek': defaultModel = 'deepseek-chat'; break;
            case 'grok': defaultModel = 'grok-beta'; break;
        }
        setLlmConfig({ ...llmConfig, provider: value as LlmProvider, model: defaultModel });
    } else {
        setLlmConfig({ ...llmConfig, [name]: value });
    }
  };

  // 登录接口实现 - 通过本地后端代理
  const handleLogin = async () => {
    if (!apiConfig.serverIp || !apiConfig.username || !apiConfig.password) {
      setLoginError("请输入 IP、账号和密码");
      return;
    }

    setLoginLoading(true);
    setLoginError(null);
    setLoginSuccess(false);

    try {
      // 调用本地后端的登录接口
      const url = `${config.apiUrl}/api/login`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            username: apiConfig.username,
            password: apiConfig.password,
            serverIp: apiConfig.serverIp,
            loginPort: apiConfig.loginPort
        })
      });

      if (!response.ok) {
          throw new Error(`登录失败: ${response.status}`);
      }

      const data = await response.json();

      if (data.status === 200) {
          setLoginSuccess(true);
          if (data.data && data.data.session) {
              setApiConfig(prev => ({...prev, sessionId: data.data.session}));
          } else {
              setLoginSuccess(true);
          }
      } else {
          throw new Error(data.msg || "登录失败");
      }

    } catch (e: any) {
      setLoginError(e.message || "连接后端服务失败");
    } finally {
      setLoginLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col md:flex-row">
      
      {/* 侧边栏 */}
      <aside className="w-full md:w-80 bg-slate-800 border-r border-slate-700 flex-shrink-0 flex flex-col h-screen">
        <div className="p-6 border-b border-slate-700 flex-shrink-0">
          <h1 className="text-xl font-bold flex items-center gap-2 text-white">
            <LayoutDashboard className="text-blue-500" />
            语音测试平台
          </h1>
          <p className="text-slate-400 text-xs mt-1">私有化接口版 (Private ASR)</p>
        </div>

        <div className="p-6 space-y-8 overflow-y-auto flex-1 scrollbar-hide">
          
          {/* 服务器设置 */}
          <section>
             <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider mb-4 flex items-center gap-2 border-b border-slate-700 pb-2">
              <Settings size={14} className="text-blue-400" /> 服务器配置
            </h3>

            <div className="space-y-4">
                <div>
                    <label className="text-xs text-slate-500 block mb-1">服务器 IP 地址</label>
                    <input
                        type="text"
                        name="serverIp"
                        value={apiConfig.serverIp}
                        onChange={handleApiConfigChange}
                        placeholder="例如：192.168.1.100"
                        className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm font-mono text-white"
                    />
                </div>
                <div className="grid grid-cols-2 gap-2">
                    <div>
                        <label className="text-xs text-slate-500 block mb-1">登录端口</label>
                        <input
                            type="text"
                            name="loginPort"
                            value={apiConfig.loginPort}
                            onChange={handleApiConfigChange}
                            className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm font-mono text-slate-300"
                        />
                    </div>
                    <div>
                        <label className="text-xs text-slate-500 block mb-1">业务端口</label>
                        <input
                            type="text"
                            name="servicePort"
                            value={apiConfig.servicePort}
                            onChange={handleApiConfigChange}
                            className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm font-mono text-slate-300"
                        />
                    </div>
                </div>

                {/* 登录区域 */}
                <div className="p-3 bg-slate-700/30 rounded-lg border border-slate-700/50 space-y-3">
                    <p className="text-xs font-medium text-slate-300">账号鉴权</p>
                    <div>
                        <input
                        type="text"
                        name="username"
                        value={apiConfig.username}
                        onChange={handleApiConfigChange}
                        placeholder="用户名"
                        className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs"
                        />
                    </div>
                    <div>
                        <input
                        type="password"
                        name="password"
                        value={apiConfig.password}
                        onChange={handleApiConfigChange}
                        placeholder="密码"
                        className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs"
                        />
                    </div>
                    
                    <button
                        onClick={handleLogin}
                        disabled={loginLoading}
                        className={`w-full py-2 rounded text-xs flex items-center justify-center gap-2 transition-colors ${
                            loginLoading ? 'bg-slate-600' : 'bg-blue-600 hover:bg-blue-500'
                        }`}
                    >
                        {loginLoading ? <div className="animate-spin w-3 h-3 border-2 border-white/30 border-t-white rounded-full"/> : <LogIn size={12} />}
                        登录获取 Session
                    </button>

                    {loginError && <div className="text-[10px] text-red-400 leading-tight flex gap-1"><AlertCircle size={10} className="mt-0.5 flex-shrink-0"/><span>{loginError}</span></div>}
                    {loginSuccess && <div className="text-[10px] text-green-400 leading-tight flex gap-1"><CheckCircle size={10} className="mt-0.5"/>登录成功</div>}
                </div>

                <div>
                    <label className="text-xs text-slate-500 block mb-1">SESSION ID (Cookie)</label>
                    <input
                    type="text"
                    name="sessionId"
                    value={apiConfig.sessionId}
                    onChange={handleApiConfigChange}
                    placeholder="如自动获取失败请手动输入"
                    className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm font-mono text-green-300 break-all"
                    />
                    <p className="text-[10px] text-slate-500 mt-1">
                        注：WebSocket 请求头需要携带 Cookie: SESSION=...
                    </p>
                </div>
            </div>
          </section>

          {/* LLM 设置 */}
          <section>
            <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider mb-4 flex items-center gap-2 border-b border-slate-700 pb-2">
              <Bot size={14} className="text-purple-400" /> 大模型设置
            </h3>
            
            <div className="space-y-4">
                <div>
                    <label className="text-xs text-slate-500 block mb-1">选择厂商</label>
                    <select
                        name="provider"
                        value={llmConfig.provider}
                        onChange={handleLlmConfigChange}
                        className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-purple-500 transition-colors"
                    >
                        <option value="none">-- 仅语音识别 --</option>
                        <option value="qwen">通义千问</option>
                        <option value="openai">OpenAI</option>
                        <option value="deepseek">DeepSeek</option>
                        <option value="grok">Grok</option>
                    </select>
                </div>

                {llmConfig.provider !== 'none' && (
                    <>
                        <div>
                            <label className="text-xs text-slate-500 block mb-1">API Key</label>
                            <input
                                type="password"
                                name="apiKey"
                                value={llmConfig.apiKey}
                                onChange={handleLlmConfigChange}
                                placeholder="API Key"
                                className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm font-mono text-white"
                            />
                        </div>

                        <div>
                            <label className="text-xs text-slate-500 block mb-1">Model Name</label>
                            <input
                                type="text"
                                name="model"
                                value={llmConfig.model}
                                onChange={handleLlmConfigChange}
                                className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm font-mono"
                            />
                        </div>
                    </>
                )}
            </div>
          </section>

        </div>
      </aside>

      {/* 主内容区 */}
      <main className="flex-1 p-8 overflow-y-auto h-screen">
        <header className="mb-8">
          <h2 className="text-2xl font-bold text-white mb-2 flex items-center gap-3">
             私有化语音识别测试
          </h2>
          <p className="text-slate-400">
            支持 实时语音流 (WebSocket / 端口 {apiConfig.servicePort}) 与 一句话识别 (HTTP / 端口 {apiConfig.servicePort})
          </p>
        </header>

        {/* 标签页 */}
        <div className="flex gap-4 mb-8 border-b border-slate-700 pb-1">
          <button
            onClick={() => setActiveTab('realtime')}
            className={`pb-3 px-2 text-sm font-medium transition-colors border-b-2 ${
              activeTab === 'realtime' 
                ? 'border-blue-500 text-blue-400' 
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            实时语音转写
          </button>
          <button
            onClick={() => setActiveTab('oneshot')}
            className={`pb-3 px-2 text-sm font-medium transition-colors border-b-2 ${
              activeTab === 'oneshot' 
                ? 'border-purple-500 text-purple-400' 
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            一句话识别
          </button>
        </div>

        <div className="max-w-4xl mx-auto md:mx-0">
          {activeTab === 'realtime' ? (
            <RealTimeASR config={apiConfig} llmConfig={llmConfig} />
          ) : (
            <OneSentenceASR config={apiConfig} llmConfig={llmConfig} />
          )}
        </div>
      </main>
    </div>
  );
};

export default App;