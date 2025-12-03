package com.scity.module.ai.asr;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.Resource;
import lombok.extern.slf4j.Slf4j;
import org.java_websocket.client.WebSocketClient;
import org.java_websocket.handshake.ServerHandshake;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.net.URI;
import java.util.HashMap;
import java.util.Map;
import java.util.Random;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

/**
 * ASR 服务类 - 优化版
 *
 * 主要改进：
 * 1. 支持动态配置 ASR 服务器参数
 * 2. 使用 CountDownLatch 替代阻塞等待
 * 3. 严格遵循接口文档的参数规范
 * 4. 完善的会话管理和错误处理
 * 5. 移除不必要的音频发送延迟
 */
@Slf4j
@Service
public class AsrService {

    @Resource
    private AsrConfig asrConfig;

    @Resource
    private RestTemplate restTemplate;

    @Resource
    private ObjectMapper objectMapper;

    @Resource
    private AsrWebSocketHandler webSocketHandler;

    private final Random random = new Random();

    // 存储每个客户端会话的 ASR WebSocket 连接
    private final Map<String, WebSocketClient> clientMap = new ConcurrentHashMap<>();

    // 存储每个客户端会话的配置信息
    private final Map<String, SessionInfo> sessionInfoMap = new ConcurrentHashMap<>();

    // 音频数据包大小：6400 字节 = 16kHz * 200ms * 2 bytes
    private static final int AUDIO_PACKET_SIZE = 6400;

    /**
     * 登录 ASR 服务器
     *
     * @param username 用户名
     * @param password 密码
     * @param serverIp ASR 服务器 IP
     * @param loginPort 登录端口
     * @return SESSION cookie
     */
    public String login(String username, String password, String serverIp, Integer loginPort) {
        log.info("[ASR Service] 开始登录 - ServerIp: {}, LoginPort: {}, Username: {}",
                serverIp, loginPort, username);

        try {
            // 构建登录 URL
            String loginUrl = String.format("http://%s:%d/api/asr/v1/login", serverIp, loginPort);
            log.debug("[ASR Service] 登录 URL: {}", loginUrl);

            // 构建请求
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);

            Map<String, String> loginBody = new HashMap<>();
            loginBody.put("username", username);
            loginBody.put("password", password);

            HttpEntity<Map<String, String>> requestEntity = new HttpEntity<>(loginBody, headers);

            // 发送登录请求
            ResponseEntity<String> response = restTemplate.postForEntity(
                    loginUrl, requestEntity, String.class);

            log.info("[ASR Service] 登录响应状态: {}", response.getStatusCode());

            // 提取 SESSION cookie
            if (response.getHeaders().containsKey("Set-Cookie")) {
                String cookieHeader = response.getHeaders().getFirst("Set-Cookie");
                if (cookieHeader != null && cookieHeader.contains("SESSION=")) {
                    String sessionCookie = cookieHeader.split(";")[0];
                    log.info("[ASR Service] 登录成功 - SESSION: {}...",
                            sessionCookie.substring(0, Math.min(30, sessionCookie.length())));
                    return sessionCookie;
                }
            }

            throw new RuntimeException("登录失败: 响应头中不包含有效的 SESSION cookie");

        } catch (Exception e) {
            log.error("[ASR Service] 登录失败 - ServerIp: {}, LoginPort: {}",
                    serverIp, loginPort, e);
            throw new RuntimeException("ASR 登录失败: " + e.getMessage(), e);
        }
    }

    /**
     * 启动语音识别
     *
     * @param clientSessionId 客户端会话 ID
     * @param serverIp ASR 服务器 IP
     * @param loginPort 登录端口
     * @param servicePort 服务端口
     * @param username 用户名
     * @param password 密码
     * @return ASR 响应
     */
    public AsrResponse startRecognition(String clientSessionId,
                                       String serverIp,
                                       Integer loginPort,
                                       Integer servicePort,
                                       String username,
                                       String password) {
        log.info("[ASR Service] 启动识别 - ClientSessionId: {}, ServerIp: {}, ServicePort: {}",
                clientSessionId, serverIp, servicePort);

        try {
            // 1. 登录获取 SESSION cookie
            String sessionCookie = login(username, password, serverIp, loginPort);

            // 2. 生成 voiceId
            String voiceId = generateVoiceId();

            // 3. 构建 WebSocket URL（严格按照接口文档 2.1.2.1）
            String wsUrl = buildWebSocketUrl(serverIp, servicePort, voiceId);
            log.info("[ASR Service] WebSocket URL: {}", wsUrl);

            // 4. 创建 CountDownLatch 用于等待连接和握手
            CountDownLatch connectionLatch = new CountDownLatch(1);
            CountDownLatch handshakeLatch = new CountDownLatch(1);

            // 5. 构建请求头
            Map<String, String> headers = buildRequestHeaders(sessionCookie);

            // 6. 创建 WebSocket 客户端
            WebSocketClient client = createWebSocketClient(
                    clientSessionId, wsUrl, connectionLatch, handshakeLatch);

            // 7. 添加请求头
            headers.forEach(client::addHeader);

            // 8. 连接到 ASR 服务器
            log.info("[ASR Service] 正在连接到 ASR 服务器...");
            client.connect();

            // 9. 等待连接建立（最多 10 秒）
            boolean connected = connectionLatch.await(10, TimeUnit.SECONDS);
            if (!connected) {
                log.error("[ASR Service] 连接 ASR 服务器超时");
                return AsrResponse.builder()
                        .code(500)
                        .message("连接 ASR 服务器超时")
                        .build();
            }

            if (!client.isOpen()) {
                log.error("[ASR Service] 连接 ASR 服务器失败");
                return AsrResponse.builder()
                        .code(500)
                        .message("连接 ASR 服务器失败")
                        .build();
            }

            // 10. 等待握手完成（最多 5 秒）
            boolean handshakeCompleted = handshakeLatch.await(5, TimeUnit.SECONDS);
            if (!handshakeCompleted) {
                log.error("[ASR Service] ASR 服务器握手超时");
                client.close(1000, "Handshake timeout");
                return AsrResponse.builder()
                        .code(500)
                        .message("ASR 服务器握手超时")
                        .build();
            }

            // 11. 保存会话信息
            clientMap.put(clientSessionId, client);
            SessionInfo sessionInfo = SessionInfo.builder()
                    .clientSessionId(clientSessionId)
                    .voiceId(voiceId)
                    .serverIp(serverIp)
                    .servicePort(servicePort)
                    .sessionCookie(sessionCookie)
                    .build();
            sessionInfoMap.put(clientSessionId, sessionInfo);

            log.info("[ASR Service] 识别启动成功 - ClientSessionId: {}, VoiceId: {}",
                    clientSessionId, voiceId);

            // 12. 返回成功响应
            return AsrResponse.builder()
                    .code(0)
                    .message("success")
                    .voiceId(voiceId)
                    .build();

        } catch (Exception e) {
            log.error("[ASR Service] 启动识别失败 - ClientSessionId: {}",
                    clientSessionId, e);
            return AsrResponse.builder()
                    .code(500)
                    .message("启动识别失败: " + e.getMessage())
                    .build();
        }
    }

    /**
     * 发送音频数据
     *
     * @param clientSessionId 客户端会话 ID
     * @param audioData 音频数据（PCM 格式，16kHz，16bit，单声道）
     */
    public void sendAudioData(String clientSessionId, byte[] audioData) {
        if (audioData == null || audioData.length == 0) {
            log.warn("[ASR Service] 音频数据为空 - ClientSessionId: {}", clientSessionId);
            return;
        }

        WebSocketClient client = clientMap.get(clientSessionId);
        if (client == null) {
            log.error("[ASR Service] 找不到 WebSocket 客户端 - ClientSessionId: {}",
                    clientSessionId);
            return;
        }

        if (!client.isOpen()) {
            log.error("[ASR Service] WebSocket 连接未打开 - ClientSessionId: {}",
                    clientSessionId);
            return;
        }

        try {
            log.debug("[ASR Service] 发送音频数据 - ClientSessionId: {}, Size: {} bytes",
                    clientSessionId, audioData.length);

            // 按照 6400 字节分包发送（对应 200ms @ 16kHz）
            int offset = 0;
            int packetCount = 0;

            while (offset < audioData.length) {
                int remaining = audioData.length - offset;
                int sendSize = Math.min(remaining, AUDIO_PACKET_SIZE);

                // 创建数据包
                byte[] packet = new byte[sendSize];
                System.arraycopy(audioData, offset, packet, 0, sendSize);

                // 发送数据包
                client.send(packet);
                packetCount++;

                log.debug("[ASR Service] 已发送音频包 #{} - ClientSessionId: {}, Size: {} bytes",
                        packetCount, clientSessionId, sendSize);

                offset += sendSize;
            }

            log.debug("[ASR Service] 音频数据发送完成 - ClientSessionId: {}, 总包数: {}",
                    clientSessionId, packetCount);

        } catch (Exception e) {
            log.error("[ASR Service] 发送音频数据失败 - ClientSessionId: {}",
                    clientSessionId, e);

            // 发送失败时清理资源
            cleanupSession(clientSessionId);
        }
    }

    /**
     * 结束语音识别
     *
     * @param clientSessionId 客户端会话 ID
     */
    public void endRecognition(String clientSessionId) {
        log.info("[ASR Service] 结束识别 - ClientSessionId: {}", clientSessionId);

        WebSocketClient client = clientMap.get(clientSessionId);
        if (client == null) {
            log.warn("[ASR Service] 找不到客户端，可能已关闭 - ClientSessionId: {}",
                    clientSessionId);
            return;
        }

        try {
            // 发送结束信号（根据接口文档要求）
            if (client.isOpen()) {
                String endMessage = "{\"type\": \"end\"}";
                client.send(endMessage);
                log.info("[ASR Service] 已发送结束信号 - ClientSessionId: {}",
                        clientSessionId);

                // 等待最终结果（最多 3 秒）
                Thread.sleep(3000);
            }

            // 关闭连接
            if (client.isOpen()) {
                client.close(1000, "Normal closure");
                log.info("[ASR Service] 已关闭 WebSocket 连接 - ClientSessionId: {}",
                        clientSessionId);
            }

        } catch (Exception e) {
            log.error("[ASR Service] 结束识别时发生错误 - ClientSessionId: {}",
                    clientSessionId, e);
        } finally {
            // 清理资源
            cleanupSession(clientSessionId);
        }
    }

    /**
     * 创建 WebSocket 客户端
     */
    private WebSocketClient createWebSocketClient(String clientSessionId,
                                                  String wsUrl,
                                                  CountDownLatch connectionLatch,
                                                  CountDownLatch handshakeLatch) {
        return new WebSocketClient(URI.create(wsUrl)) {
            @Override
            public void onOpen(ServerHandshake handshake) {
                log.info("[ASR Service] WebSocket 连接已建立 - ClientSessionId: {}, Status: {}",
                        clientSessionId, handshake.getHttpStatus());
                connectionLatch.countDown();
            }

            @Override
            public void onMessage(String message) {
                log.debug("[ASR Service] 收到 ASR 消息 - ClientSessionId: {}, Length: {} chars",
                        clientSessionId, message.length());

                try {
                    AsrResponse response = objectMapper.readValue(message, AsrResponse.class);

                    // 检查是否是握手响应
                    if (response.getCode() != null && response.getCode().equals(0)
                            && response.getVoiceId() != null) {
                        log.info("[ASR Service] 握手成功 - ClientSessionId: {}, VoiceId: {}",
                                clientSessionId, response.getVoiceId());
                        handshakeLatch.countDown();
                    }

                    // 转发识别结果给前端
                    if (webSocketHandler != null) {
                        webSocketHandler.sendRecognitionResult(clientSessionId, response);
                    }

                    // 记录识别结果
                    if (response.getResult() != null && response.getResult().getVoiceTextStr() != null) {
                        log.info("[ASR Service] 识别结果 - ClientSessionId: {}, Text: {}",
                                clientSessionId, response.getResult().getVoiceTextStr());
                    }

                } catch (Exception e) {
                    log.error("[ASR Service] 解析 ASR 响应失败 - ClientSessionId: {}",
                            clientSessionId, e);
                }
            }

            @Override
            public void onClose(int code, String reason, boolean remote) {
                log.info("[ASR Service] WebSocket 连接已关闭 - ClientSessionId: {}, Code: {}, Reason: {}, Remote: {}",
                        clientSessionId, code, reason, remote);
                cleanupSession(clientSessionId);
            }

            @Override
            public void onError(Exception ex) {
                log.error("[ASR Service] WebSocket 错误 - ClientSessionId: {}",
                        clientSessionId, ex);
                connectionLatch.countDown(); // 确保不会永久阻塞
            }
        };
    }

    /**
     * 构建 WebSocket URL（严格遵循接口文档 2.1.2.1）
     */
    private String buildWebSocketUrl(String serverIp, Integer servicePort, String voiceId) {
        StringBuilder urlBuilder = new StringBuilder();
        urlBuilder.append("ws://").append(serverIp).append(":").append(servicePort);
        urlBuilder.append("/stream_asr");

        // 添加查询参数（严格按照接口文档）
        urlBuilder.append("?voice_id=").append(voiceId);
        urlBuilder.append("&voice_format=").append(asrConfig.getVoiceFormat());
        urlBuilder.append("&needvad=").append(asrConfig.getNeedVad());
        urlBuilder.append("&result_text_format=").append(asrConfig.getResultTextFormat());
        urlBuilder.append("&filter_dirty=").append(asrConfig.getFilterDirty());
        urlBuilder.append("&filter_modal=").append(asrConfig.getFilterModal());
        urlBuilder.append("&filter_punc=").append(asrConfig.getFilterPunc());
        urlBuilder.append("&convert_num_mode=").append(asrConfig.getConvertNumMode());
        urlBuilder.append("&word_info=").append(asrConfig.getWordInfo());
        urlBuilder.append("&vad_silence_time=").append(asrConfig.getVadSilenceTime());

        // 可选参数
        if (asrConfig.getHotwordId() != null && !asrConfig.getHotwordId().isEmpty()) {
            urlBuilder.append("&hotword_id=").append(asrConfig.getHotwordId());
        }
        if (asrConfig.getCustomizationId() != null && !asrConfig.getCustomizationId().isEmpty()) {
            urlBuilder.append("&customization_id=").append(asrConfig.getCustomizationId());
        }

        return urlBuilder.toString();
    }

    /**
     * 构建请求头
     */
    private Map<String, String> buildRequestHeaders(String sessionCookie) {
        Map<String, String> headers = new HashMap<>();
        headers.put("Cookie", sessionCookie);
        headers.put("X-TC-Service", asrConfig.getService());
        headers.put("X-TC-Action", "/realtime_asr_ws_private");
        headers.put("X-TC-Timestamp", String.valueOf(System.currentTimeMillis() / 1000));
        headers.put("X-TC-Version", asrConfig.getVersion());
        headers.put("X-TC-Project", "1");
        headers.put("Content-Type", "application/json");
        return headers;
    }

    /**
     * 清理会话资源
     */
    private void cleanupSession(String clientSessionId) {
        clientMap.remove(clientSessionId);
        sessionInfoMap.remove(clientSessionId);
        log.debug("[ASR Service] 已清理会话资源 - ClientSessionId: {}", clientSessionId);
    }

    /**
     * 生成随机 voiceId（16位字符）
     */
    private String generateVoiceId() {
        String chars = "1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
        StringBuilder sb = new StringBuilder(16);
        for (int i = 0; i < 16; i++) {
            sb.append(chars.charAt(random.nextInt(chars.length())));
        }
        return sb.toString();
    }

    /**
     * 获取活跃会话数（用于监控）
     */
    public int getActiveSessionCount() {
        return clientMap.size();
    }

    /**
     * 获取会话信息（用于调试）
     */
    public SessionInfo getSessionInfo(String clientSessionId) {
        return sessionInfoMap.get(clientSessionId);
    }
}
