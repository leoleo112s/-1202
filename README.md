# AIOS 语音测试平台 (私有化版)

这是一个基于 React 的语音识别测试工具，专为适配 AIOS 私有化部署接口而设计。它支持实时语音流式转写和一句话（文件）识别，并集成了大语言模型（LLM）功能，可对识别结果进行智能回复。

## 功能特性

*   **私有化接口适配**: 
    *   支持配置私有服务器 IP。
    *   登录服务端口 (默认 30886)。
    *   语音业务端口 (默认 30888)。
*   **用户鉴权**: 
    *   实现基于账号密码的登录流程 (`POST /login`)。
    *   支持 Session ID 鉴权 (适配 WebSocket 和 HTTP 请求)。
*   **实时语音转写**:
    *   基于 WebSocket (`/websocket/realtime_asr_ws_private`)。
    *   支持实时麦克风采集、降采样 (48k->16k)、PCM 编码传输。
    *   实时展示中间结果 (流式) 与稳态结果。
    *   可视化绿色音量波形条。
*   **一句话识别**:
    *   基于 HTTP POST (`/iapp/general/call/sentence_recognition`)。
    *   本地录音自动转换为 WAV 格式并 Base64 编码上传。
    *   支持手动触发上传识别。
*   **LLM 集成**:
    *   支持配置 OpenAI、通义千问 (Qwen)、DeepSeek、Grok 等大模型。
    *   支持将识别结果直接发送给 AI 进行对话。

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 启动开发服务器

```bash
npm start
```

## 配置指南

启动应用后，请在左侧侧边栏进行如下配置：

### 1. 服务器连接配置

*   **服务器 IP 地址**: 输入您私有化部署服务器的 IP（例如 `192.168.1.100`）。
*   **端口设置**: 
    *   登录端口：默认为 `30886`。
    *   业务端口：默认为 `30888`。
*   **账号鉴权**:
    *   输入分配的 `username` 和 `password`。
    *   点击 **“登录获取 Session”** 按钮。
    *   *注意*：如果因浏览器跨域 (CORS) 限制导致无法自动获取 Cookie，请手动在 **SESSION ID** 输入框中填入 Cookie 值（可通过 F12 -> Application -> Cookies 查看）。

### 2. 大模型设置 (可选)

如果您希望测试“语音对话”场景，可以配置 LLM：
*   选择厂商 (如 OpenAI, DeepSeek 等)。
*   输入对应的 `API Key`。
*   指定模型名称 (如 `gpt-4o`, `deepseek-chat`)。

## 接口协议说明

本项目实现了以下私有化接口协议：

| 功能 | 方法 | 路径 | 说明 |
| :--- | :--- | :--- | :--- |
| **用户登录** | POST | `http://{ip}:30886/login` | 获取 SESSION Cookie |
| **实时识别** | WS | `ws://{ip}:30888/websocket/realtime_asr_ws_private` | 参数: `voice_id`, `needvad=1` |
| **一句话识别** | POST | `http://{ip}:30888/iapp/general/call/sentence_recognition` | Body: Base64 编码的 WAV 数据 |

## 技术栈

*   **前端框架**: React 18, TypeScript
*   **构建工具**: Webpack / Parcel (视具体脚手架而定)
*   **样式库**: Tailwind CSS
*   **图标库**: Lucide React
*   **音频处理**: Web Audio API (ScriptProcessorNode), Float32 to Int16 PCM Conversion

## 常见问题排查

1.  **无法录音**: 
    *   请检查浏览器是否已授予麦克风权限。
    *   如果是 HTTP 环境（非 localhost），浏览器可能会阻止 `getUserMedia`，请尝试使用 `localhost` 或配置 HTTPS。
2.  **WebSocket 连接失败**:
    *   检查 SESSION ID 是否已过期。
    *   检查服务器 IP 和端口是否可以 Ping 通。
3.  **一句话识别报错 Failed to fetch**:
    *   通常是 CORS 跨域问题。请确保服务器端允许跨域，或者在开发环境配置代理。

## License

MIT
