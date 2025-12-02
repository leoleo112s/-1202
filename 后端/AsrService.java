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
import java.util.concurrent.atomic.AtomicReference;

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
    private final Map<String, WebSocketClient> clientMap = new ConcurrentHashMap<>();
    private final Random random = new Random();
    private final Map<String, String> voiceIdMap = new ConcurrentHashMap<>();

    private void login() {
        String username = asrConfig.getUsername();
        String password = asrConfig.getPassword();
        log.info("开始登录ASR服务，用户名: {}", username);

        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);

            String jsonBody = String.format("{\"username\":\"%s\", \"password\":\"%s\"}",
                    username, password);
            HttpEntity<String> requestEntity = new HttpEntity<>(jsonBody, headers);

            ResponseEntity<String> response = restTemplate.postForEntity(
                    asrConfig.getLoginUrl(),
                    requestEntity,
                    String.class
            );

            log.info("登录响应状态: {}", response.getStatusCode());

            if (response.getHeaders().containsKey("Set-Cookie")) {
                String cookieHeader = response.getHeaders().getFirst("Set-Cookie");
                if (cookieHeader != null && cookieHeader.contains("SESSION=")) {
                    sessionCookie = cookieHeader.split(";")[0];
                    log.info("ASR登录成功，SESSION: {}", sessionCookie.substring(0, 20) + "...");
                } else {
                    throw new RuntimeException("登录失败: 响应头中不包含有效的SESSION");
                }
            } else {
                log.warn("登录响应头中不包含Set-Cookie: {}", response.getHeaders());
                throw new RuntimeException("登录失败: 响应头中不包含Set-Cookie");
            }
        } catch (Exception e) {
            log.error("ASR登录失败", e);
            throw new RuntimeException("ASR登录失败: " + e.getMessage(), e);
        }
    }

    public AsrResponse startRecognition(String sessionId) {
        try {
            if (sessionCookie == null) {
                login();
            }
            log.info("startRecognition-Start: {}", sessionId);

            // 1. 生成voiceId
            String voiceId = generateVoiceId();
            voiceIdMap.put(sessionId, voiceId);

            // 2. 构造WebSocket URL（包含所有查询参数）
            String wsUrlWithParams = buildWebSocketUrlWithParams(voiceId);
            log.info("WebSocket URL with params: {}", wsUrlWithParams);

            // 3. 构造请求头
            Map<String, Object> headers = new HashMap<>();
            headers.put("Cookie", sessionCookie);
            headers.put("X-TC-Service", asrConfig.getService());
            headers.put("X-TC-Action", "/realtime_asr_ws_private");
            headers.put("X-TC-Timestamp", String.valueOf(System.currentTimeMillis() / 1000));
            headers.put("X-TC-Version", asrConfig.getVersion());
            headers.put("X-TC-Project", "1");
            headers.put("Content-Type", "application/json");

            // 4. 创建WebSocketClient
            AtomicReference<Boolean> handshakeCompleted = new AtomicReference<>(false);
            WebSocketClient client = new WebSocketClient(URI.create(wsUrlWithParams)) {
                @Override
                public void onOpen(ServerHandshake handshake) {
                    log.info("WebSocket connection opened, status: {}", handshake.getHttpStatus());
                    log.info("Handshake headers: {}", handshake.getHttpStatusMessage());

                    // 打印所有响应头
                    handshake.iterateHttpFields().forEachRemaining(field -> {
                        String value = handshake.getFieldValue(field);
                        log.info("Header - {}: {}", field, value);
                    });
                }

                @Override
                public void onMessage(String message) {
                    // 强制打印到控制台
                    System.out.println("【ASR服务响应】消息内容: " + message);
                    System.err.println("【ASR调试】收到消息: " + message.substring(0, Math.min(200, message.length())));

                    log.info("═══════════════════════════════════════════════════");
                    log.info("收到ASR服务消息: {}", message);
                    log.info("═══════════════════════════════════════════════════");

                    try {
                        AsrResponse response = objectMapper.readValue(message, AsrResponse.class);

                        // 检查是否是握手响应
                        if (!handshakeCompleted.get() && response.getCode() == 0 && response.getVoiceId() != null) {
                            log.info("握手成功，voiceId: {}", response.getVoiceId());
                            handshakeCompleted.set(true);
                        }

                        // 发送给前端
                        if (webSocketHandler != null) {
                            webSocketHandler.sendRecognitionResult(sessionId, response);
                        }

                        if (response.getResult() != null) {
                            log.info("识别结果 - sliceType: {}, text: {}",
                                    response.getResult().getSliceType(),
                                    response.getResult().getVoiceTextStr());
                        }

                    } catch (Exception e) {
                        log.error("解析ASR响应失败", e);
                        log.error("原始消息: {}", message);
                    }
                }

                @Override
                public void onClose(int code, String reason, boolean remote) {
                    log.info("WebSocket connection closed: {} - {} (remote: {})", code, reason, remote);
                    clientMap.remove(sessionId);
                    voiceIdMap.remove(sessionId);
                }

                @Override
                public void onError(Exception ex) {
                    log.error("WebSocket error", ex);
                }
            };

            // 5. 添加headers
            for (Map.Entry<String, Object> header : headers.entrySet()) {
                client.addHeader(header.getKey(), header.getValue().toString());
            }

            // 6. 连接并等待握手完成
            log.info("开始连接到ASR服务: {}", wsUrlWithParams);
            client.connect();

            // 等待连接建立
            int connectRetry = 0;
            while (!client.isOpen() && connectRetry < 30) { // 最多等待6秒
                Thread.sleep(200);
                connectRetry++;
            }

            if (!client.isOpen()) {
                log.error("连接ASR服务失败");
                return AsrResponse.builder()
                        .code(500)
                        .message("连接ASR服务失败")
                        .build();
            }

            // 等待握手响应（最多等待5秒）
            int handshakeRetry = 0;
            while (!handshakeCompleted.get() && handshakeRetry < 25) {
                Thread.sleep(200);
                handshakeRetry++;
            }

            if (!handshakeCompleted.get()) {
                log.error("ASR服务握手超时");
                client.close(1000, "Handshake timeout");
                return AsrResponse.builder()
                        .code(500)
                        .message("ASR服务握手超时")
                        .build();
            }

            // 7. 保存客户端连接
            clientMap.put(sessionId, client);

            return AsrResponse.builder()
                    .code(0)
                    .message("success")
                    .voiceId(voiceId)
                    .build();

        } catch (Exception e) {
            log.error("Error starting recognition", e);
            return AsrResponse.builder()
                    .code(500)
                    .message("Error: " + e.getMessage())
                    .build();
        }
    }

    private String buildWebSocketUrlWithParams(String voiceId) {
        StringBuilder urlBuilder = new StringBuilder(asrConfig.getWsUrl());
        urlBuilder.append("?voice_id=").append(voiceId);
        urlBuilder.append("&res_type=").append(asrConfig.getResType());
        urlBuilder.append("&result_text_format=").append(asrConfig.getResultTextFormat());
        urlBuilder.append("&needvad=").append(asrConfig.getNeedVad());
        urlBuilder.append("&filter_dirty=").append(asrConfig.getFilterDirty());
        urlBuilder.append("&filter_modal=").append(asrConfig.getFilterModal());
        urlBuilder.append("&filter_punc=").append(asrConfig.getFilterPunc());
        urlBuilder.append("&convert_num_mode=").append(asrConfig.getConvertNumMode());
        urlBuilder.append("&word_info=").append(asrConfig.getWordInfo());
        urlBuilder.append("&voice_format=").append(asrConfig.getVoiceFormat());
        urlBuilder.append("&vad_silence_time=").append(asrConfig.getVadSilenceTime());
        urlBuilder.append("&use_text_split=").append(asrConfig.getUseTextSplit());
        urlBuilder.append("&hotword_id=").append(asrConfig.getHotwordId() != null ? asrConfig.getHotwordId() : "");
        urlBuilder.append("&customization_id=").append(asrConfig.getCustomizationId() != null ? asrConfig.getCustomizationId() : "");
        urlBuilder.append("&reinforce_hotword=").append(asrConfig.getReinforceHotword());
        urlBuilder.append("&noise_threshold=").append(asrConfig.getNoiseThreshold());
        urlBuilder.append("&sample_rate=16000");
        urlBuilder.append("&channel_num=1");

        return urlBuilder.toString();
    }

    public void sendAudioData(String sessionId, byte[] audioData) {
        if (audioData == null || audioData.length == 0) {
            log.warn("音频数据为空，sessionId: {}", sessionId);
            return;
        }

        WebSocketClient client = clientMap.get(sessionId);
        if (client == null) {
            log.error("找不到WebSocket客户端，sessionId: {}", sessionId);
            return;
        }

        if (!client.isOpen()) {
            log.error("WebSocket连接未打开，sessionId: {}", sessionId);
            return;
        }

        try {
            // 检查数据包大小（应该是6400字节对应200ms）
            log.info("准备发送音频数据，原始长度: {} bytes", audioData.length);

            // 如果数据包太大，需要分割
            int targetPacketSize = 6400; // 16k采样率，200ms的数据量
            int offset = 0;
            int packetCount = 0;

            while (offset < audioData.length) {
                int remaining = audioData.length - offset;
                int sendSize = Math.min(remaining, targetPacketSize);

                // 发送数据包
                byte[] packet = new byte[sendSize];
                System.arraycopy(audioData, offset, packet, 0, sendSize);
                client.send(packet);

                packetCount++;
                log.info("已发送音频数据包 #{}, sessionId: {}, 包大小: {} bytes",
                        packetCount, sessionId, packet.length);

                offset += sendSize;

                // 控制发送速率：每200ms发送200ms的数据
                // 如果发送的是200ms的数据，就等待200ms
                if (sendSize == targetPacketSize) {
                    Thread.sleep(200); // 精确控制200ms间隔
                }
            }

        } catch (Exception e) {
            log.error("发送音频数据失败，sessionId: {}", sessionId, e);
            if (client.isOpen()) {
                try {
                    client.close(1002, "Audio send error");
                } catch (Exception ex) {
                    log.error("关闭连接失败", ex);
                }
            }
            clientMap.remove(sessionId);
        }
    }

    public void endRecognition(String sessionId) {
        WebSocketClient client = clientMap.get(sessionId);
        if (client != null) {
            try {
                log.info("准备结束语音识别，sessionId: {}", sessionId);

                // 发送结束信号（根据文档要求）
                if (client.isOpen()) {
                    String endMessage = "{\"type\": \"end\"}";
                    client.send(endMessage);
                    log.info("已发送结束信号: {}", endMessage);
                }

                // 等待ASR服务返回最终结果
                log.info("等待ASR服务返回最终结果...");
                Thread.sleep(2000);

                // 关闭连接
                if (client.isOpen()) {
                    log.info("正在关闭ASR WebSocket连接...");
                    client.close(1000, "Audio stream completed");
                    Thread.sleep(500);
                }

            } catch (Exception e) {
                log.error("结束语音识别时发生错误", e);
            } finally {
                clientMap.remove(sessionId);
                voiceIdMap.remove(sessionId);
                log.info("已移除客户端，sessionId: {}", sessionId);
            }
        } else {
            log.warn("找不到客户端，可能已关闭，sessionId: {}", sessionId);
        }
    }

    private String generateVoiceId() {
        String chars = "1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
        StringBuilder sb = new StringBuilder(16);
        for (int i = 0; i < 16; i++) {
            sb.append(chars.charAt(random.nextInt(chars.length())));
        }
        return sb.toString();
    }
}