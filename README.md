# AIOS 语音测试平台 (全栈版)

这是一个完整的全栈语音识别测试平台，专为适配 AIOS 私有化部署接口而设计。它支持实时语音流式转写和一句话（文件）识别，并集成了大语言模型（LLM）功能，可对识别结果进行智能回复。

## 项目架构

```
aios-voice-platform/
├── client/              # 前端应用 (React + TypeScript + Vite)
│   ├── src/
│   │   ├── components/  # React 组件
│   │   ├── utils/       # 工具函数
│   │   ├── config.ts    # 前端配置
│   │   ├── types.ts     # 类型定义
│   │   └── App.tsx      # 主应用组件
│   └── package.json
├── server/              # 后端服务 - Node.js 版本 (Express + WebSocket)
│   ├── src/
│   │   ├── services/    # ASR 服务
│   │   ├── websocket/   # WebSocket 处理器
│   │   ├── routes/      # HTTP API 路由
│   │   ├── types/       # 类型定义
│   │   ├── config/      # 配置文件
│   │   └── index.ts     # 服务器入口
│   └── package.json
├── server-java/         # 后端服务 - Java 版本 (Spring Boot)
│   ├── src/main/java/com/aios/voice/
│   │   ├── config/      # 配置类
│   │   ├── controller/  # REST API 控制器
│   │   ├── model/       # 数据模型
│   │   ├── service/     # 业务服务
│   │   ├── websocket/   # WebSocket 处理器
│   │   └── VoicePlatformApplication.java
│   ├── src/main/resources/
│   │   └── application.yml
│   ├── pom.xml
│   └── README.md
├── 前端/                # 前端参考代码
├── 后端/                # 后端参考代码 (Java)
├── package.json         # 根项目配置
└── README.md
```

> **注意**: 本项目提供两个后端实现版本供选择：
> - **Node.js 版本** (`server/`): 使用 TypeScript + Express，适合 JavaScript 技术栈
> - **Java 版本** (`server-java/`): 使用 Spring Boot 3.2.0，适合 Java 技术栈
>
> 两个版本功能完全相同，API 接口保持一致，可以根据项目需求任选其一。

## 功能特性

### 前端特性
- ✅ **现代化 UI**: 基于 React 18 + TypeScript + Tailwind CSS
- ✅ **实时语音转写**: 支持实时麦克风采集、降采样、PCM 编码传输
- ✅ **一句话识别**: 本地录音自动转换为 WAV 格式并上传识别
- ✅ **音量可视化**: 实时显示绿色音量波形条
- ✅ **LLM 集成**: 支持 OpenAI、通义千问、DeepSeek、Grok 等大模型

### 后端特性
- ✅ **代理服务**: 作为前端和 AIOS ASR 服务器之间的中间层
- ✅ **WebSocket 代理**: 处理实时语音流转发
- ✅ **HTTP API**: 提供登录、一句话识别等 REST API
- ✅ **会话管理**: 管理多个客户端的 ASR 会话
- ✅ **错误处理**: 完善的错误处理和日志记录

### 优势
- 🔒 **解决跨域问题**: 前端无需直接访问 ASR 私有服务器
- 🔐 **更安全**: ASR 服务器配置在后端,不暴露给前端
- 📊 **易于扩展**: 可在后端添加日志记录、数据分析等功能
- 🛠️ **易于维护**: 前后端分离，各司其职

## 快速开始

本项目提供两种后端技术栈选择，请根据您的技术栈选择对应的快速开始指南：

- **选项 A**: [Node.js 后端快速开始](#nodejs-后端快速开始)
- **选项 B**: [Java 后端快速开始](#java-后端快速开始)

---

## Node.js 后端快速开始

### 环境要求

- Node.js >= 18.0.0
- npm >= 9.0.0

### 1. 安装依赖

```bash
# 安装所有依赖（前端+后端）
npm run install:all

# 或者分别安装
cd client && npm install
cd ../server && npm install
```

### 2. 配置环境变量

#### 后端配置

复制环境配置示例文件：

```bash
cp server/.env.example server/.env
```

编辑 `server/.env` 文件，配置 ASR 服务器信息：

```env
PORT=3001

# AIOS ASR 服务器配置
ASR_SERVER_IP=192.168.1.100
ASR_LOGIN_PORT=30886
ASR_SERVICE_PORT=30888
ASR_USERNAME=superuser
ASR_PASSWORD=your_password
```

#### 前端配置（可选）

如果需要修改后端服务地址，可以创建 `client/.env` 文件：

```env
VITE_API_URL=http://localhost:3001
VITE_WS_URL=ws://localhost:3001
```

### 3. 启动开发服务器

#### 同时启动前后端（推荐）

```bash
npm run dev
```

这将同时启动：
- 后端服务器: http://localhost:3001
- 前端开发服务器: http://localhost:5173

#### 分别启动

```bash
# 终端 1: 启动后端
npm run dev:server

# 终端 2: 启动前端
npm run dev:client
```

### 4. 访问应用

打开浏览器访问: http://localhost:5173

---

## Java 后端快速开始

### 环境要求

- Java >= 17
- Maven >= 3.6

### 1. 构建前端

```bash
cd client
npm install
npm run build
```

### 2. 配置 ASR 服务器信息

编辑 `server-java/src/main/resources/application.yml`：

```yaml
asr:
  server-ip: 192.168.1.100   # ASR 服务器 IP
  login-port: 30886           # 登录端口
  service-port: 30888         # 服务端口
  username: superuser         # 用户名
  password: your_password     # 密码
```

### 3. 构建并运行 Java 后端

```bash
cd server-java
mvn clean package
java -jar target/aios-voice-platform-1.0.0.jar
```

或者使用 Maven 直接运行：

```bash
mvn spring-boot:run
```

服务将启动在: http://localhost:3001

### 4. 访问应用

由于前端已在步骤 1 中构建，您可以：

**选项 A**: 使用 Nginx 或其他 Web 服务器部署 `client/dist/` 目录

**选项 B**: 使用 Vite 开发服务器（开发环境）：
```bash
cd client
npm run dev
```
然后访问: http://localhost:5173

详细使用说明请参考 [server-java/README.md](server-java/README.md)

---

## 使用指南

### 1. 配置 ASR 服务器

在左侧侧边栏配置 AIOS ASR 服务器信息：

- **服务器 IP 地址**: 输入您私有化部署服务器的 IP（例如 `192.168.1.100`）
- **登录端口**: 默认为 `30886`
- **业务端口**: 默认为 `30888`
- **用户名和密码**: 输入分配的账号信息

### 2. 登录

点击 **"登录获取 Session"** 按钮，系统将通过后端代理登录到 ASR 服务器。

### 3. 开始语音识别

#### 实时语音转写
1. 切换到 "实时语音转写" 标签
2. 点击 "开始对话" 按钮
3. 允许浏览器使用麦克风权限
4. 开始说话，实时识别结果将显示在界面上

#### 一句话识别
1. 切换到 "一句话识别" 标签
2. 点击 "开始录音" 按钮
3. 说话完成后点击 "停止并上传"
4. 等待识别结果

### 4. AI 对话（可选）

如果配置了 LLM，可以将识别结果发送给 AI 进行对话：

1. 在侧边栏选择 LLM 厂商（OpenAI、通义千问等）
2. 输入 API Key 和模型名称
3. 识别完成后点击 "发送给 AI" 按钮

## 项目脚本

### 根目录脚本

```bash
npm run install:all   # 安装所有依赖
npm run dev          # 同时启动前后端开发服务器
npm run dev:server   # 仅启动后端
npm run dev:client   # 仅启动前端
npm run build        # 构建前后端
npm run start        # 启动生产环境后端
```

### 后端脚本

```bash
cd server
npm run dev          # 启动开发服务器（热重载）
npm run build        # 构建 TypeScript 到 dist/
npm run start        # 启动生产环境服务器
```

### 前端脚本

```bash
cd client
npm run dev          # 启动 Vite 开发服务器
npm run build        # 构建生产版本
npm run preview      # 预览生产构建
```

## 技术栈

### 前端
- **框架**: React 18 + TypeScript
- **构建工具**: Vite
- **样式**: Tailwind CSS
- **图标**: Lucide React
- **音频处理**: Web Audio API (ScriptProcessorNode)

### 后端 - Node.js 版本
- **运行时**: Node.js
- **框架**: Express
- **WebSocket**: ws
- **HTTP 客户端**: axios
- **语言**: TypeScript

### 后端 - Java 版本
- **语言**: Java 17
- **框架**: Spring Boot 3.2.0
- **WebSocket**: Spring WebSocket + Java-WebSocket
- **HTTP 客户端**: RestTemplate
- **工具**: Lombok, Jackson

## API 接口

### HTTP API

#### 健康检查
```
GET /api/health
```

#### 登录
```
POST /api/login
Body: {
  username: string,
  password: string,
  serverIp: string,
  loginPort: number
}
```

#### 一句话识别（待实现）
```
POST /api/sentence_recognition
Body: {
  serverIp: string,
  servicePort: number,
  audioData: string (Base64),
  sessionId: string
}
```

### WebSocket API

#### 实时语音识别
```
WS /asr?serverIp=xxx&loginPort=xxx&servicePort=xxx&username=xxx&password=xxx
```

**消息格式**:
- 客户端 -> 服务器: 二进制音频数据 (PCM 16kHz Int16)
- 服务器 -> 客户端: JSON 格式的识别结果

## 部署

### 生产环境部署

1. 构建前后端：
```bash
npm run build
```

2. 启动后端服务器：
```bash
npm start
```

3. 前端静态文件位于 `client/dist/`，可以部署到任何静态文件服务器（Nginx、CDN 等）

### Docker 部署（可选）

TODO: 添加 Dockerfile 和 docker-compose.yml

## 常见问题

### 1. 无法录音
- 检查浏览器是否已授予麦克风权限
- 确保使用 HTTPS 或 localhost（Chrome 安全限制）

### 2. WebSocket 连接失败
- 检查后端服务器是否正常运行
- 检查 ASR 服务器配置是否正确
- 查看后端日志获取详细错误信息

### 3. 跨域问题
- 本项目已通过后端代理解决跨域问题
- 确保前端配置的 API URL 正确

### 4. ASR 服务器连接失败
- 检查 ASR 服务器 IP 和端口是否正确
- 检查网络连接和防火墙设置
- 查看后端日志获取详细错误信息

## 参考代码

- `前端/` 目录：包含前端 WebSocket 连接的参考实现
- `后端/` 目录：包含 Java Spring Boot 后端的参考实现

## License

MIT

## 贡献

欢迎提交 Issue 和 Pull Request！
