# AIOS Voice Platform - Java Backend

基于 Spring Boot 3.2.0 的 AIOS 语音识别平台后端服务。

## 技术栈

- **Java**: 17
- **Spring Boot**: 3.2.0
- **Spring WebSocket**: WebSocket 支持
- **Java-WebSocket**: WebSocket 客户端库
- **Lombok**: 简化代码
- **Jackson**: JSON 序列化

## 项目结构

```
server-java/
├── src/main/java/com/aios/voice/
│   ├── VoicePlatformApplication.java  # 主应用入口
│   ├── config/
│   │   ├── AsrConfig.java             # ASR 配置
│   │   ├── WebSocketConfig.java       # WebSocket 配置
│   │   └── CorsConfig.java            # CORS 配置
│   ├── controller/
│   │   └── ApiController.java         # REST API 控制器
│   ├── model/
│   │   ├── AsrResponse.java           # ASR 响应模型
│   │   ├── AsrResult.java             # ASR 识别结果模型
│   │   ├── LoginRequest.java          # 登录请求模型
│   │   ├── LoginResponse.java         # 登录响应模型
│   │   └── SessionInfo.java           # 会话信息模型
│   ├── service/
│   │   └── AsrService.java            # ASR 服务类
│   └── websocket/
│       └── AsrWebSocketHandler.java   # WebSocket 处理器
└── src/main/resources/
    └── application.yml                # 应用配置
```

## 快速开始

### 1. 环境要求

- Java 17 或更高版本
- Maven 3.6+

### 2. 配置 ASR 服务器信息

编辑 `src/main/resources/application.yml`：

```yaml
asr:
  server-ip: 127.0.0.1    # ASR 服务器 IP
  login-port: 30886        # 登录端口
  service-port: 30888      # 服务端口
  username: superuser      # 用户名
  password: ""             # 密码
```

### 3. 构建项目

```bash
cd server-java
mvn clean package
```

### 4. 运行服务

```bash
java -jar target/aios-voice-platform-1.0.0.jar
```

或者使用 Maven 运行：

```bash
mvn spring-boot:run
```

服务将启动在 `http://localhost:3001`

## API 接口

### 1. 健康检查

```bash
GET http://localhost:3001/api/health
```

响应：
```json
{
  "status": "ok",
  "service": "AIOS Voice Platform",
  "timestamp": 1234567890
}
```

### 2. 登录接口（可选）

```bash
POST http://localhost:3001/api/login
Content-Type: application/json

{
  "username": "superuser",
  "password": "",
  "serverIp": "127.0.0.1",
  "loginPort": 30886
}
```

### 3. WebSocket 连接

前端通过以下 URL 连接到 WebSocket 服务：

```
ws://localhost:3001/asr?serverIp=127.0.0.1&loginPort=30886&servicePort=30888&username=superuser&password=
```

## WebSocket 通信协议

### 前端 → 后端

1. **音频数据**（二进制消息）
   - 发送 PCM 格式音频数据
   - 采样率：16kHz
   - 位深度：16bit
   - 声道：单声道

2. **结束信号**（文本消息）
   ```json
   {
     "type": "end"
   }
   ```

### 后端 → 前端

**识别结果**（文本消息）：

```json
{
  "code": 0,
  "message": "success",
  "voice_id": "abc123def456",
  "message_id": "msg001",
  "result": {
    "slice_type": 2,
    "index": 0,
    "start_time": 0,
    "end_time": 1500,
    "voice_text_str": "你好世界",
    "word_size": 4,
    "word_list": []
  },
  "final": 0
}
```

字段说明：
- `slice_type`: 0=开始, 1=识别中, 2=结束
- `final`: 1=音频流全部识别结束

## 配置说明

### WebSocket 参数（application.yml）

所有参数严格遵循 AIOS 接口文档 2.1.2.1：

```yaml
websocket-params:
  voice-format: "1"           # 音频格式：1=PCM
  needvad: "1"                # 是否需要VAD：1=需要
  result-text-format: "0"     # 文本格式：0=UTF-8, 1=GB2312
  filter-dirty: "0"           # 是否过滤脏字：0=不过滤, 1=过滤
  filter-modal: "0"           # 是否过滤语气词：0=不过滤, 1=过滤
  filter-punc: "0"            # 是否过滤标点：0=不过滤, 1=过滤
  convert-num-mode: "1"       # 数字转换模式：0=不转换, 1=纯数字, 2=完全转换
  word-info: "0"              # 是否返回词信息：0=不返回, 1=返回
  vad-silence-time: "1000"    # VAD 静音时长（ms）
```

## 日志查看

应用启动后会输出详细的日志信息，包括：

- WebSocket 连接状态
- ASR 服务器通信状态
- 音频数据接收情况
- 识别结果

日志级别配置在 `application.yml` 中：

```yaml
logging:
  level:
    root: INFO
    com.aios.voice: DEBUG
```

## 开发说明

### 核心组件

1. **AsrService**: 负责与 AIOS ASR 服务器通信
   - 登录认证
   - WebSocket 连接管理
   - 音频数据转发
   - 识别结果处理

2. **AsrWebSocketHandler**: 处理前端 WebSocket 连接
   - 连接建立
   - 音频数据接收
   - 结果转发
   - 连接关闭

3. **ApiController**: REST API 接口
   - 健康检查
   - 登录接口

### 音频数据处理

音频数据以 6400 字节为一个包进行发送：
```
6400 bytes = 16kHz × 200ms × 2 bytes
```

这样可以确保每个数据包包含 200ms 的音频数据。

## 故障排查

### 1. 无法连接到 ASR 服务器

检查：
- ASR 服务器 IP 和端口是否正确
- 网络连接是否正常
- 用户名和密码是否正确

### 2. WebSocket 连接失败

检查：
- 前端 WebSocket URL 是否正确
- 查询参数是否完整
- CORS 配置是否正确

### 3. 没有识别结果

检查：
- 音频格式是否正确（PCM, 16kHz, 16bit, mono）
- WebSocket 是否正常连接
- ASR 服务器是否正常工作

## License

MIT
