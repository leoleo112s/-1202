package com.scity.module.ai.asr;

/**
 * ASR 服务接口规范
 *
 * 此接口定义了 WebSocketHandler 所需的 AsrService 方法
 * 如果你的 AsrService 实现不同，请参考此规范进行调整
 */
public interface AsrService {

    /**
     * 启动语音识别会话
     *
     * 功能：
     * 1. 使用提供的凭证登录 ASR 服务器
     * 2. 建立到 ASR 服务器的 WebSocket 连接
     * 3. 返回初始响应（包含 voiceId）
     *
     * @param clientSessionId 客户端会话 ID（通常是 WebSocketSession.getId()）
     * @param serverIp ASR 服务器 IP 地址（例如：192.168.1.100）
     * @param loginPort ASR 登录端口（例如：30886）
     * @param servicePort ASR 服务端口（例如：30888）
     * @param username 用户名（例如：superuser）
     * @param password 密码
     * @return ASR 响应对象，包含 voiceId、code、message 等信息
     * @throws Exception 连接失败、登录失败等异常
     */
    AsrResponse startRecognition(String clientSessionId,
                                String serverIp,
                                Integer loginPort,
                                Integer servicePort,
                                String username,
                                String password) throws Exception;

    /**
     * 发送音频数据到 ASR 服务器
     *
     * 功能：
     * 1. 将音频数据转发到对应的 ASR WebSocket 连接
     * 2. 自动分包（推荐 6400 字节/包，约 200ms @ 16kHz）
     * 3. 处理发送失败的情况
     *
     * 音频格式要求：
     * - 编码：PCM
     * - 采样率：16kHz
     * - 位深度：16bit
     * - 声道：单声道（mono）
     *
     * @param clientSessionId 客户端会话 ID
     * @param audioData 音频数据字节数组
     * @throws Exception 会话不存在、发送失败等异常
     */
    void sendAudioData(String clientSessionId, byte[] audioData) throws Exception;

    /**
     * 结束语音识别会话
     *
     * 功能：
     * 1. 发送结束信号到 ASR 服务器：{"type": "end"}
     * 2. 关闭 WebSocket 连接
     * 3. 清理会话资源
     *
     * @param clientSessionId 客户端会话 ID
     * @throws Exception 会话不存在、发送失败等异常
     */
    void endRecognition(String clientSessionId) throws Exception;

    /**
     * 发送识别结果到前端（回调方法）
     *
     * 说明：
     * 当从 ASR 服务器收到识别结果时，AsrService 应该调用此方法
     * 将结果转发给前端 WebSocket 客户端
     *
     * 实现示例：
     * <pre>
     * // 在 AsrService 中接收到 ASR 服务器消息时
     * AsrResponse response = parseAsrMessage(message);
     * asrWebSocketHandler.sendRecognitionResult(clientSessionId, response);
     * </pre>
     *
     * 注意：AsrService 需要持有 AsrWebSocketHandler 的引用
     */
    // 注意：此方法应该在 AsrService 实现中调用 AsrWebSocketHandler.sendRecognitionResult()
}


/**
 * AsrResponse 数据模型规范
 *
 * 根据 AIOS 接口文档定义的响应格式
 */
class AsrResponse {
    /**
     * 响应代码
     * 0 = 成功
     * 非 0 = 错误码
     */
    private Object code;

    /**
     * 响应消息
     * 例如："success" 或错误描述
     */
    private String message;

    /**
     * 语音 ID
     * 每个识别会话的唯一标识符
     */
    private String voiceId;

    /**
     * 消息 ID（可选）
     * 用于消息追踪
     */
    private String messageId;

    /**
     * 识别结果
     * 包含识别的文本、时间戳、词列表等
     */
    private AsrResult result;

    /**
     * 是否为最终结果
     * 0 = 中间结果
     * 1 = 最终结果（整个音频流识别完成）
     */
    private Integer _final;

    // Getters and Setters...
}


/**
 * AsrResult 数据模型规范
 *
 * 识别结果的详细信息
 */
class AsrResult {
    /**
     * 分片类型
     * 0 = 开始
     * 1 = 识别中
     * 2 = 结束
     */
    private Integer sliceType;

    /**
     * 分片索引
     * 从 0 开始的序号
     */
    private Integer index;

    /**
     * 开始时间（毫秒）
     * 相对于音频流开始的时间戳
     */
    private Integer startTime;

    /**
     * 结束时间（毫秒）
     * 相对于音频流开始的时间戳
     */
    private Integer endTime;

    /**
     * 识别的文本内容
     * 这是最重要的字段，包含语音转文字的结果
     */
    private String voiceTextStr;

    /**
     * 词数量
     * voiceTextStr 中包含的词的数量
     */
    private Integer wordSize;

    /**
     * 词列表（可选）
     * 每个词的详细信息（词内容、时间戳等）
     * 需要在 WebSocket 参数中设置 word_info=1 才会返回
     */
    private java.util.List<Object> wordList;

    // Getters and Setters...
}


/**
 * AsrRequest 数据模型（前端发送的控制信号）
 *
 * 支持两种格式：
 * 1. 标准格式：{"type": "end"}
 * 2. 自定义格式：{"isEnd": true}
 */
class AsrRequest {
    /**
     * 消息类型
     * "end" = 结束信号
     */
    private String type;

    /**
     * 是否结束（自定义字段）
     * true = 结束信号
     */
    private Boolean isEnd;

    // Getters and Setters...
}


/**
 * AsrService 实现示例骨架
 */
@Service
@Slf4j
class AsrServiceImpl implements AsrService {

    @Autowired
    private AsrWebSocketHandler asrWebSocketHandler;

    // 存储每个客户端会话的 ASR WebSocket 连接
    private final Map<String, org.java_websocket.client.WebSocketClient> asrClients
        = new ConcurrentHashMap<>();

    // 存储每个客户端会话的配置信息
    private final Map<String, SessionInfo> sessions = new ConcurrentHashMap<>();

    @Override
    public AsrResponse startRecognition(String clientSessionId,
                                       String serverIp,
                                       Integer loginPort,
                                       Integer servicePort,
                                       String username,
                                       String password) throws Exception {

        log.info("[ASR Service] 启动识别 - SessionId: {}", clientSessionId);

        // 1. 登录 ASR 服务器获取 SESSION cookie
        String sessionCookie = login(username, password, serverIp, loginPort);

        // 2. 构建 WebSocket URL
        String wsUrl = buildWebSocketUrl(serverIp, servicePort, sessionCookie);

        // 3. 创建 WebSocket 客户端连接到 ASR 服务器
        org.java_websocket.client.WebSocketClient client =
            new org.java_websocket.client.WebSocketClient(new URI(wsUrl)) {

                @Override
                public void onMessage(String message) {
                    // 收到 ASR 服务器的识别结果
                    try {
                        AsrResponse response = objectMapper.readValue(message, AsrResponse.class);

                        // 转发给前端
                        asrWebSocketHandler.sendRecognitionResult(clientSessionId, response);

                    } catch (Exception e) {
                        log.error("[ASR Service] 解析 ASR 响应失败", e);
                    }
                }

                @Override
                public void onOpen(ServerHandshake handshake) {
                    log.info("[ASR Service] ASR WebSocket 连接已建立");
                }

                @Override
                public void onClose(int code, String reason, boolean remote) {
                    log.info("[ASR Service] ASR WebSocket 连接已关闭");
                }

                @Override
                public void onError(Exception ex) {
                    log.error("[ASR Service] ASR WebSocket 错误", ex);
                }
            };

        // 4. 连接到 ASR 服务器
        client.connectBlocking();

        // 5. 存储会话信息
        asrClients.put(clientSessionId, client);
        sessions.put(clientSessionId, new SessionInfo(/* ... */));

        // 6. 返回初始响应
        return AsrResponse.builder()
                .code(0)
                .message("success")
                .voiceId(generateVoiceId())
                .build();
    }

    @Override
    public void sendAudioData(String clientSessionId, byte[] audioData) throws Exception {
        org.java_websocket.client.WebSocketClient client = asrClients.get(clientSessionId);

        if (client == null || !client.isOpen()) {
            throw new IllegalStateException("ASR 连接不存在或已关闭");
        }

        // 分包发送（推荐 6400 字节/包）
        int packetSize = 6400;
        int offset = 0;

        while (offset < audioData.length) {
            int length = Math.min(packetSize, audioData.length - offset);
            byte[] packet = Arrays.copyOfRange(audioData, offset, offset + length);

            client.send(packet);
            offset += length;
        }
    }

    @Override
    public void endRecognition(String clientSessionId) throws Exception {
        org.java_websocket.client.WebSocketClient client = asrClients.remove(clientSessionId);
        sessions.remove(clientSessionId);

        if (client != null && client.isOpen()) {
            // 发送结束信号
            client.send("{\"type\": \"end\"}");

            // 关闭连接
            client.closeBlocking();
        }
    }

    // 辅助方法：登录 ASR 服务器
    private String login(String username, String password, String serverIp, Integer loginPort) {
        // 实现登录逻辑，返回 SESSION cookie
        // 参考：server-java/src/main/java/com/aios/voice/service/AsrService.java
        return "SESSION_COOKIE_VALUE";
    }

    // 辅助方法：构建 WebSocket URL
    private String buildWebSocketUrl(String serverIp, Integer servicePort, String sessionCookie) {
        // 构建 WebSocket URL，包含所有必需的查询参数
        // 参考接口文档 2.1.2.1
        return String.format("ws://%s:%d/stream_asr?voice_format=1&needvad=1...",
                           serverIp, servicePort);
    }
}
