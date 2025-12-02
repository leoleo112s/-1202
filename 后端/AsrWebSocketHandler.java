package com.scity.module.ai.asr;

import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.*;

import java.io.IOException;
import java.util.concurrent.ConcurrentHashMap;

@Slf4j
@Component
public class AsrWebSocketHandler implements WebSocketHandler {

    private final AsrService asrService;
    private final ObjectMapper objectMapper;
    private final ConcurrentHashMap<String, WebSocketSession> sessions = new ConcurrentHashMap<>();

    // 使用构造函数注入，确保依赖不为null
    @Autowired
    public AsrWebSocketHandler(AsrService asrService, ObjectMapper objectMapper) {
        log.info("初始化 AsrWebSocketHandler，注入 AsrService: {}", asrService != null ? "成功" : "失败");
        this.asrService = asrService;
        this.objectMapper = objectMapper;
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws Exception {
        String sessionId = session.getId();
        sessions.put(sessionId, session);
        log.info("WebSocket连接已建立: {}", sessionId);

        try {
            // 检查依赖是否已注入
            if (asrService == null) {
                log.error("AsrService 未正确注入，无法开始语音识别");
                session.close(CloseStatus.SERVER_ERROR.withReason("服务器配置错误"));
                return;
            }

            // 开始语音识别
            AsrResponse response = asrService.startRecognition(sessionId);
            log.info("语音识别开始，voiceId: {}", response.getVoiceId());

            // 发送响应给前端
            sendMessage(session, response);
        } catch (Exception e) {
            log.error("WebSocket连接建立后处理失败", e);
            session.close(CloseStatus.SERVER_ERROR.withReason("处理失败: " + e.getMessage()));
        }
    }

    @Override
    public void handleMessage(WebSocketSession session, WebSocketMessage<?> message) throws Exception {
        String sessionId = session.getId();
        log.info("收到消息，sessionId: {}, 消息类型: {}", sessionId, message.getClass().getSimpleName());

        try {
            if (asrService == null) {
                log.error("AsrService 未正确注入，无法处理消息");
                session.close(CloseStatus.SERVER_ERROR.withReason("服务器配置错误"));
                return;
            }

            if (message instanceof TextMessage) {
                // 处理文本消息（如结束信号）
                String payload = ((TextMessage) message).getPayload();
                log.info("收到文本消息: {}", payload);

                try {
                    AsrRequest request = objectMapper.readValue(payload, AsrRequest.class);
                    if (request.getIsEnd() != null && request.getIsEnd()) {
                        log.info("收到结束信号，结束语音识别");
                        asrService.endRecognition(sessionId);
                    }
                } catch (Exception e) {
                    log.warn("解析文本消息失败，可能不是JSON格式: {}", payload);
                }
            } else if (message instanceof BinaryMessage) {
                // 处理音频数据
                byte[] audioData = ((BinaryMessage) message).getPayload().array();
                log.info("收到二进制消息: {} bytes", audioData.length);
                asrService.sendAudioData(sessionId, audioData);
            }
        } catch (Exception e) {
            log.error("处理WebSocket消息失败", e);
            throw e;
        }
    }

    @Override
    public void handleTransportError(WebSocketSession session, Throwable exception) throws Exception {
        log.error("WebSocket传输错误", exception);
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus closeStatus) throws Exception {
        String sessionId = session.getId();
        log.info("WebSocket连接已关闭: {}, 关闭状态: {}", sessionId, closeStatus);

        try {
            if (asrService != null) {
                asrService.endRecognition(sessionId);
            }
        } catch (Exception e) {
            log.error("结束语音识别时发生错误", e);
        } finally {
            sessions.remove(sessionId);
        }
    }

    @Override
    public boolean supportsPartialMessages() {
        return false;
    }
    public void sendRecognitionResult(String sessionId, AsrResponse response) {
        log.info("发送识别结果，sessionId: {}, 语音识别结果: {}", sessionId, response);
        WebSocketSession session = sessions.get(sessionId);
        if (session != null && session.isOpen()) {
            sendMessage(session, response);
        }
    }
    private void sendMessage(WebSocketSession session, Object message) {
        log.info("发送消息，sessionId: {}", session.getId());
        try {
            if (session.isOpen()) {
                String jsonMessage = objectMapper.writeValueAsString(message);
                session.sendMessage(new TextMessage(jsonMessage));
                log.info("发送消息: {}", jsonMessage);
            }
        } catch (IOException e) {
            log.error("发送WebSocket消息失败", e);
        }
    }
}