package com.aios.voice.service;

import com.aios.voice.config.AsrConfig;
import com.aios.voice.model.AsrResponse;
import com.aios.voice.model.LoginResponse;
import com.aios.voice.model.SessionInfo;
import com.aios.voice.websocket.AsrWebSocketHandler;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.Resource;
import lombok.extern.slf4j.Slf4j;
import org.java_websocket.client.WebSocketClient;
import org.java_websocket.handshake.ServerHandshake;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.net.URI;
import java.util.HashMap;
import java.util.Map;
import java.util.Random;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicReference;

/**
 * ASR 服务类
 * 负责与 AIOS ASR 私有化服务器通信
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

    private String sessionCookie;
    private final Map<String, SessionInfo> sessions = new ConcurrentHashMap<>();
    private final Random random = new Random();

    /**
     * 生成 voice_id（16位字符串）
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
     * 登录到 ASR 服务器
     */
    public LoginResponse login(String username, String password, String serverIp, Integer loginPort) {
        try {
            log.info("[ASR Service] 登录 ASR 服务: {}:{}", serverIp, loginPort);

            String loginUrl = String.format("http://%s:%d/login", serverIp, loginPort);

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);

            Map<String, String> body = new HashMap<>();
            body.put("username", username);
            body.put("password", password);

            HttpEntity<Map<String, String>> request = new HttpEntity<>(body, headers);

            ResponseEntity<Map> response = restTemplate.postForEntity(loginUrl, request, Map.class);

            log.info("[ASR Service] 登录响应状态: {}", response.getStatusCode());

            // 提取 SESSION Cookie
            if (response.getHeaders().containsKey("Set-Cookie")) {
                String cookieHeader = response.getHeaders().getFirst("Set-Cookie");
                if (cookieHeader != null && cookieHeader.contains("SESSION=")) {
                    sessionCookie = cookieHeader.split(";")[0];
                    log.info("[ASR Service] 登录成功，SESSION: {}...", sessionCookie.substring(0, 20));
                }
            }

            return LoginResponse.builder()
                    .status(response.getStatusCode().value())
                    .msg((String) response.getBody().get("msg"))
                    .data(LoginResponse.LoginData.builder()
                            .session(sessionCookie)
                            .build())
                    .build();

        } catch (Exception e) {
            log.error("[ASR Service] 登录失败", e);
            throw new RuntimeException("ASR 登录失败: " + e.getMessage(), e);
        }
    }

    /**
     * 构建 WebSocket URL（包含所有查询参数）
     */
    private String buildWebSocketUrl(String voiceId, String serverIp, Integer servicePort) {
        AsrConfig.WebSocketParams params = asrConfig.getWebsocketParams();

        return String.format("ws://%s:%d/websocket/realtime_asr_ws_private?" +
                        "voice_id=%s&voice_format=%s&needvad=%s&result_text_format=%s" +
                        "&filter_dirty=%s&filter_modal=%s&filter_punc=%s" +
                        "&convert_num_mode=%s&word_info=%s&vad_silence_time=%s",
                serverIp, servicePort, voiceId,
                params.getVoiceFormat(), params.getNeedvad(), params.getResultTextFormat(),
                params.getFilterDirty(), params.getFilterModal(), params.getFilterPunc(),
                params.getConvertNumMode(), params.getWordInfo(), params.getVadSilenceTime());
    }

    /**
     * 开始语音识别
     */
    public AsrResponse startRecognition(String clientSessionId, String serverIp,
                                       Integer loginPort, Integer servicePort,
                                       String username, String password) {
        try {
            log.info("[ASR Service] 开始识别会话: {}", clientSessionId);

            // 如果没有登录过，先登录
            if (sessionCookie == null) {
                login(username, password, serverIp, loginPort);
            }

            // 生成 voiceId
            String voiceId = generateVoiceId();
            log.info("[ASR Service] Voice ID: {}", voiceId);

            // 构造 WebSocket URL
            String wsUrl = buildWebSocketUrl(voiceId, serverIp, servicePort);
            log.info("[ASR Service] WebSocket URL: {}", wsUrl);

            // 创建 WebSocket 客户端
            AtomicReference<Boolean> handshakeCompleted = new AtomicReference<>(false);

            WebSocketClient client = new WebSocketClient(URI.create(wsUrl)) {
                @Override
                public void onOpen(ServerHandshake handshake) {
                    log.info("[ASR Service] WebSocket 连接已打开");
                }

                @Override
                public void onMessage(String message) {
                    try {
                        log.info("[ASR Service] 收到消息: {}", message.substring(0, Math.min(200, message.length())));

                        AsrResponse response = objectMapper.readValue(message, AsrResponse.class);

                        // 握手响应
                        if (!handshakeCompleted.get() && response.getCode().equals(0) && response.getVoiceId() != null) {
                            log.info("[ASR Service] 握手成功: {}", response.getVoiceId());
                            handshakeCompleted.set(true);
                        }

                        // 转发识别结果到前端
                        if (webSocketHandler != null) {
                            webSocketHandler.sendRecognitionResult(clientSessionId, response);
                        }

                        if (response.getResult() != null) {
                            log.info("[ASR Service] 识别结果 - sliceType: {}, text: {}",
                                    response.getResult().getSliceType(),
                                    response.getResult().getVoiceTextStr());
                        }

                    } catch (Exception e) {
                        log.error("[ASR Service] 解析消息失败", e);
                    }
                }

                @Override
                public void onClose(int code, String reason, boolean remote) {
                    log.info("[ASR Service] WebSocket 连接已关闭: {} - {}", code, reason);
                    sessions.remove(clientSessionId);
                }

                @Override
                public void onError(Exception ex) {
                    log.error("[ASR Service] WebSocket 错误", ex);
                }
            };

            // 添加请求头
            client.addHeader("Cookie", sessionCookie);
            client.addHeader("Content-Type", "application/json");

            // 连接并等待握手完成
            log.info("[ASR Service] 开始连接到 ASR 服务...");
            client.connect();

            // 等待连接建立
            int connectRetry = 0;
            while (!client.isOpen() && connectRetry < 30) {
                Thread.sleep(200);
                connectRetry++;
            }

            if (!client.isOpen()) {
                log.error("[ASR Service] 连接 ASR 服务失败");
                return AsrResponse.builder()
                        .code(500)
                        .message("连接 ASR 服务失败")
                        .build();
            }

            // 等待握手响应
            int handshakeRetry = 0;
            while (!handshakeCompleted.get() && handshakeRetry < 25) {
                Thread.sleep(200);
                handshakeRetry++;
            }

            if (!handshakeCompleted.get()) {
                log.error("[ASR Service] ASR 服务握手超时");
                client.close(1000, "Handshake timeout");
                return AsrResponse.builder()
                        .code(500)
                        .message("ASR 服务握手超时")
                        .build();
            }

            // 保存会话信息
            sessions.put(clientSessionId, SessionInfo.builder()
                    .sessionId(clientSessionId)
                    .voiceId(voiceId)
                    .asrWebSocket(client)
                    .isActive(true)
                    .build());

            return AsrResponse.builder()
                    .code(0)
                    .message("success")
                    .voiceId(voiceId)
                    .build();

        } catch (Exception e) {
            log.error("[ASR Service] 启动识别失败", e);
            return AsrResponse.builder()
                    .code(500)
                    .message("Error: " + e.getMessage())
                    .build();
        }
    }

    /**
     * 发送音频数据到 ASR 服务器
     */
    public void sendAudioData(String clientSessionId, byte[] audioData) {
        SessionInfo session = sessions.get(clientSessionId);
        if (session == null || !session.getIsActive()) {
            log.warn("[ASR Service] 会话不存在或未激活: {}", clientSessionId);
            return;
        }

        WebSocketClient client = session.getAsrWebSocket();
        if (!client.isOpen()) {
            log.warn("[ASR Service] WebSocket 未打开: {}", clientSessionId);
            return;
        }

        try {
            // 将音频数据分包发送（每包 6400 字节 = 16kHz * 200ms * 2 bytes）
            int PACKET_SIZE = 6400;
            int offset = 0;

            while (offset < audioData.length) {
                int remaining = audioData.length - offset;
                int sendSize = Math.min(remaining, PACKET_SIZE);

                byte[] packet = new byte[sendSize];
                System.arraycopy(audioData, offset, packet, 0, sendSize);

                client.send(packet);
                offset += sendSize;
            }

        } catch (Exception e) {
            log.error("[ASR Service] 发送音频数据失败", e);
        }
    }

    /**
     * 结束语音识别
     */
    public void endRecognition(String clientSessionId) {
        SessionInfo session = sessions.get(clientSessionId);
        if (session == null) {
            log.warn("[ASR Service] 会话不存在: {}", clientSessionId);
            return;
        }

        WebSocketClient client = session.getAsrWebSocket();

        try {
            if (client.isOpen()) {
                // 发送结束信号
                client.send("{\"type\": \"end\"}");
                log.info("[ASR Service] 已发送结束信号: {}", clientSessionId);

                // 延迟关闭连接，等待最终结果
                new Thread(() -> {
                    try {
                        Thread.sleep(2000);
                        if (client.isOpen()) {
                            client.close();
                        }
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                    }
                }).start();
            }
        } catch (Exception e) {
            log.error("[ASR Service] 结束识别失败", e);
        } finally {
            session.setIsActive(false);
        }
    }
}
