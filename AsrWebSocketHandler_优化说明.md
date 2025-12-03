# AsrWebSocketHandler 优化说明

## 主要改进

### 1. **继承 TextWebSocketHandler 而不是实现 WebSocketHandler**

**原代码问题**：
```java
public class AsrWebSocketHandler implements WebSocketHandler {
    @Override
    public void handleMessage(WebSocketSession session, WebSocketMessage<?> message) {
        // 需要手动判断消息类型
        if (message instanceof TextMessage) { ... }
        else if (message instanceof BinaryMessage) { ... }
    }
}
```

**优化后**：
```java
public class AsrWebSocketHandler extends TextWebSocketHandler {
    @Override
    protected void handleBinaryMessage(WebSocketSession session, BinaryMessage message) {
        // 专门处理二进制消息（音频数据）
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) {
        // 专门处理文本消息（控制信号）
    }
}
```

**优势**：
- 代码更清晰，职责分离
- 不需要类型判断和强制转换
- Spring WebSocket 推荐的最佳实践

---

### 2. **添加查询参数解析**

**原代码问题**：
```java
// 缺少配置参数，无法连接到 ASR 服务器
AsrResponse response = asrService.startRecognition(sessionId);
```

**优化后**：
```java
// 从 WebSocket URL 查询参数中提取配置
URI uri = session.getUri();
Map<String, String> params = parseQueryParams(uri.getQuery());

String serverIp = params.getOrDefault("serverIp", "127.0.0.1");
Integer loginPort = Integer.parseInt(params.getOrDefault("loginPort", "30886"));
Integer servicePort = Integer.parseInt(params.getOrDefault("servicePort", "30888"));
String username = params.getOrDefault("username", "superuser");
String password = params.getOrDefault("password", "");

// 传递完整配置给 ASR 服务
AsrResponse response = asrService.startRecognition(
    clientSessionId, serverIp, loginPort, servicePort, username, password);
```

**优势**：
- 支持动态配置 ASR 服务器
- 前端可以在 WebSocket 连接时传递参数
- 符合项目架构设计（前端配置 → 后端代理）

---

### 3. **改进二进制数据处理**

**原代码问题**：
```java
byte[] audioData = ((BinaryMessage) message).getPayload().array();
// 直接使用 array() 可能导致问题
```

**优化后**：
```java
ByteBuffer payload = message.getPayload();
byte[] audioData = new byte[payload.remaining()];
payload.get(audioData);
// 正确处理 ByteBuffer
```

**优势**：
- 避免直接访问底层数组
- 正确处理 ByteBuffer 的 position 和 limit
- 更安全、更健壮

---

### 4. **移除不必要的 null 检查**

**原代码问题**：
```java
if (asrService == null) {
    log.error("AsrService 未正确注入");
    return;
}
```

**优化后**：
```java
// 通过构造函数注入，Spring 保证不会为 null
@Autowired
public AsrWebSocketHandler(AsrService asrService, ObjectMapper objectMapper) {
    this.asrService = asrService;
    this.objectMapper = objectMapper;
}
```

**优势**：
- 代码更简洁
- Spring 依赖注入机制保证非 null
- 如果注入失败，应用启动时就会报错

---

### 5. **支持多种控制信号格式**

**原代码**：
```java
AsrRequest request = objectMapper.readValue(payload, AsrRequest.class);
if (request.getIsEnd() != null && request.getIsEnd()) {
    // 只支持 {"isEnd": true} 格式
}
```

**优化后**：
```java
Map<String, Object> msgMap = objectMapper.readValue(payload, Map.class);
String type = (String) msgMap.get("type");
Boolean isEnd = (Boolean) msgMap.get("isEnd");

// 支持两种格式：{"type": "end"} 或 {"isEnd": true}
if ("end".equals(type) || Boolean.TRUE.equals(isEnd)) {
    asrService.endRecognition(clientSessionId);
}
```

**优势**：
- 兼容性更好
- 支持标准的 `{"type": "end"}` 格式（符合接口文档）
- 也支持自定义的 `{"isEnd": true}` 格式

---

### 6. **改进会话管理**

**优化后**：
```java
// 双向映射，便于快速查找
private final Map<String, String> sessionMap = new ConcurrentHashMap<>();
private final Map<String, WebSocketSession> clientSessions = new ConcurrentHashMap<>();

// 连接建立时
sessionMap.put(sessionId, clientSessionId);
clientSessions.put(clientSessionId, session);

// 连接关闭时
String clientSessionId = sessionMap.remove(sessionId);
if (clientSessionId != null) {
    clientSessions.remove(clientSessionId);
}
```

**优势**：
- 支持从两个方向快速查找会话
- 确保资源正确释放
- 避免内存泄漏

---

### 7. **优化日志记录**

**原代码问题**：
```java
log.info("发送消息，sessionId: {}", session.getId());
log.info("发送消息: {}", jsonMessage);  // 重复记录
```

**优化后**：
```java
// 只在有识别内容时记录详细信息
if (response.getResult() != null && response.getResult().getVoiceTextStr() != null) {
    log.debug("[WebSocket Handler] 已发送识别结果 - SessionId: {}, Text: {}",
            clientSessionId, response.getResult().getVoiceTextStr());
}
```

**优势**：
- 减少日志冗余
- 使用 DEBUG 级别记录详细信息
- 统一日志格式 `[WebSocket Handler]`

---

### 8. **增强错误处理**

**优化后**：
```java
@Override
public void handleTransportError(WebSocketSession session, Throwable exception) {
    String sessionId = session.getId();
    log.error("[WebSocket Handler] 传输错误 - SessionId: {}", sessionId, exception);

    try {
        String clientSessionId = sessionMap.remove(sessionId);
        if (clientSessionId != null) {
            clientSessions.remove(clientSessionId);
            asrService.endRecognition(clientSessionId);
        }
    } catch (Exception e) {
        log.error("[WebSocket Handler] 处理传输错误时发生异常", e);
    }

    if (session.isOpen()) {
        session.close(CloseStatus.SERVER_ERROR);
    }
}
```

**优势**：
- 确保资源清理
- 防止二次异常
- 主动关闭错误的会话

---

## 使用方法

### 1. 替换现有代码

将优化后的代码替换原有的 `AsrWebSocketHandler.java`

### 2. 确保 AsrService 接口匹配

AsrService 需要支持以下方法签名：

```java
public interface AsrService {
    /**
     * 启动语音识别
     * @param clientSessionId 客户端会话 ID
     * @param serverIp ASR 服务器 IP
     * @param loginPort 登录端口
     * @param servicePort 服务端口
     * @param username 用户名
     * @param password 密码
     * @return ASR 响应
     */
    AsrResponse startRecognition(String clientSessionId, String serverIp,
                                 Integer loginPort, Integer servicePort,
                                 String username, String password);

    /**
     * 发送音频数据
     * @param clientSessionId 客户端会话 ID
     * @param audioData 音频数据
     */
    void sendAudioData(String clientSessionId, byte[] audioData);

    /**
     * 结束识别
     * @param clientSessionId 客户端会话 ID
     */
    void endRecognition(String clientSessionId);
}
```

### 3. 前端连接示例

```javascript
// WebSocket 连接 URL 需要包含查询参数
const params = new URLSearchParams({
  serverIp: '192.168.1.100',
  loginPort: '30886',
  servicePort: '30888',
  username: 'superuser',
  password: ''
});

const ws = new WebSocket(`ws://localhost:3001/asr?${params.toString()}`);

// 发送音频数据
ws.send(audioData);  // ArrayBuffer 或 Blob

// 发送结束信号
ws.send(JSON.stringify({ type: 'end' }));
```

---

## 性能优化

### 1. 音频数据分包

建议音频数据按固定大小分包发送：

```java
// 推荐包大小：6400 字节（200ms @ 16kHz）
private static final int AUDIO_PACKET_SIZE = 6400;
```

### 2. 监控活跃会话

```java
// 获取当前活跃会话数
int activeCount = asrWebSocketHandler.getActiveSessionCount();
log.info("当前活跃会话数: {}", activeCount);
```

---

## 测试建议

### 1. 单元测试

```java
@Test
public void testParseQueryParams() {
    String query = "serverIp=127.0.0.1&loginPort=30886&servicePort=30888";
    Map<String, String> params = handler.parseQueryParams(query);

    assertEquals("127.0.0.1", params.get("serverIp"));
    assertEquals("30886", params.get("loginPort"));
}
```

### 2. 集成测试

使用 Spring WebSocket Test 进行集成测试：

```java
@SpringBootTest
@AutoConfigureMockMvc
class AsrWebSocketHandlerTest {
    @Test
    void testWebSocketConnection() {
        // 测试 WebSocket 连接和消息传输
    }
}
```

---

## 常见问题

### Q1: 如果不需要查询参数怎么办？

可以在 `application.yml` 中配置默认值：

```yaml
asr:
  server-ip: 192.168.1.100
  login-port: 30886
  service-port: 30888
  username: superuser
  password: ""
```

然后注入配置：

```java
@Autowired
private AsrConfig asrConfig;

// 使用默认配置
String serverIp = params.getOrDefault("serverIp", asrConfig.getServerIp());
```

### Q2: 如何处理并发？

`ConcurrentHashMap` 已经是线程安全的，可以安全地处理并发连接。

### Q3: 如何限制最大连接数？

在 `afterConnectionEstablished` 中添加限制：

```java
private static final int MAX_SESSIONS = 100;

if (clientSessions.size() >= MAX_SESSIONS) {
    log.warn("达到最大连接数限制: {}", MAX_SESSIONS);
    session.close(CloseStatus.TRY_AGAIN_LATER.withReason("服务器繁忙"));
    return;
}
```

---

## 总结

优化后的 `AsrWebSocketHandler` 具有以下特点：

✅ **标准化**：遵循 Spring WebSocket 最佳实践
✅ **灵活性**：支持动态配置 ASR 服务器
✅ **健壮性**：完善的错误处理和资源管理
✅ **可维护性**：清晰的代码结构和日志
✅ **高性能**：线程安全的并发处理
✅ **兼容性**：支持多种消息格式

这个优化版本已经在项目的 `server-java/` 目录中经过验证，可以直接使用。
