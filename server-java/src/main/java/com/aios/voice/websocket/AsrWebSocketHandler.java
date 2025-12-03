package com.aios.voice.websocket;

import com.aios.voice.model.AsrResponse;
import com.aios.voice.service.AsrService;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.Resource;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.*;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.net.URI;
import java.nio.ByteBuffer;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * WebSocket Handler - 处理前端 WebSocket 连接
 */
@Slf4j
@Component
public class AsrWebSocketHandler extends TextWebSocketHandler {

    @Resource
    private AsrService asrService;

    @Resource
    private ObjectMapper objectMapper;

    // 存储 WebSocketSession 和客户端会话 ID 的映射
    private final Map<String, String> sessionMap = new ConcurrentHashMap<>();
    private final Map<String, WebSocketSession> clientSessions = new ConcurrentHashMap<>();

    /**
     * 连接建立时
     */
    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws Exception {
        try {
            log.info("[WebSocket Handler] 前端连接建立: {}", session.getId());

            // 从查询参数中提取 ASR 配置
            URI uri = session.getUri();
            if (uri == null) {
                log.error("[WebSocket Handler] URI 为空");
                session.close(CloseStatus.BAD_DATA);
                return;
            }

            Map<String, String> params = parseQueryParams(uri.getQuery());

            String serverIp = params.getOrDefault("serverIp", "127.0.0.1");
            Integer loginPort = Integer.parseInt(params.getOrDefault("loginPort", "30886"));
            Integer servicePort = Integer.parseInt(params.getOrDefault("servicePort", "30888"));
            String username = params.getOrDefault("username", "superuser");
            String password = params.getOrDefault("password", "");

            log.info("[WebSocket Handler] ASR 配置 - IP: {}, LoginPort: {}, ServicePort: {}, Username: {}",
                    serverIp, loginPort, servicePort, username);

            // 使用 WebSocketSession ID 作为客户端会话 ID
            String clientSessionId = session.getId();
            sessionMap.put(session.getId(), clientSessionId);
            clientSessions.put(clientSessionId, session);

            // 启动 ASR 识别
            AsrResponse response = asrService.startRecognition(
                    clientSessionId, serverIp, loginPort, servicePort, username, password);

            // 将响应发送给前端
            if (session.isOpen()) {
                String responseJson = objectMapper.writeValueAsString(response);
                session.sendMessage(new TextMessage(responseJson));
                log.info("[WebSocket Handler] 已发送启动响应: {}", responseJson);
            }

        } catch (Exception e) {
            log.error("[WebSocket Handler] 连接建立失败", e);
            if (session.isOpen()) {
                session.close(CloseStatus.SERVER_ERROR);
            }
        }
    }

    /**
     * 接收二进制消息（音频数据）
     */
    @Override
    protected void handleBinaryMessage(WebSocketSession session, BinaryMessage message) throws Exception {
        try {
            String clientSessionId = sessionMap.get(session.getId());
            if (clientSessionId == null) {
                log.warn("[WebSocket Handler] 会话 ID 不存在: {}", session.getId());
                return;
            }

            ByteBuffer payload = message.getPayload();
            byte[] audioData = new byte[payload.remaining()];
            payload.get(audioData);

            log.debug("[WebSocket Handler] 收到音频数据: {} bytes", audioData.length);

            // 转发音频数据到 ASR 服务
            asrService.sendAudioData(clientSessionId, audioData);

        } catch (Exception e) {
            log.error("[WebSocket Handler] 处理音频数据失败", e);
        }
    }

    /**
     * 接收文本消息（控制信号）
     */
    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
        try {
            String clientSessionId = sessionMap.get(session.getId());
            if (clientSessionId == null) {
                log.warn("[WebSocket Handler] 会话 ID 不存在: {}", session.getId());
                return;
            }

            String payload = message.getPayload();
            log.info("[WebSocket Handler] 收到文本消息: {}", payload);

            // 解析消息
            Map<String, Object> msgMap = objectMapper.readValue(payload, Map.class);
            String type = (String) msgMap.get("type");

            if ("end".equals(type)) {
                log.info("[WebSocket Handler] 收到结束信号");
                asrService.endRecognition(clientSessionId);
            }

        } catch (Exception e) {
            log.error("[WebSocket Handler] 处理文本消息失败", e);
        }
    }

    /**
     * 连接关闭时
     */
    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) throws Exception {
        try {
            log.info("[WebSocket Handler] 前端连接关闭: {}, 状态: {}", session.getId(), status);

            String clientSessionId = sessionMap.remove(session.getId());
            if (clientSessionId != null) {
                clientSessions.remove(clientSessionId);
                asrService.endRecognition(clientSessionId);
            }

        } catch (Exception e) {
            log.error("[WebSocket Handler] 关闭连接时出错", e);
        }
    }

    /**
     * 处理传输错误
     */
    @Override
    public void handleTransportError(WebSocketSession session, Throwable exception) throws Exception {
        log.error("[WebSocket Handler] 传输错误: {}", session.getId(), exception);

        String clientSessionId = sessionMap.remove(session.getId());
        if (clientSessionId != null) {
            clientSessions.remove(clientSessionId);
            asrService.endRecognition(clientSessionId);
        }

        if (session.isOpen()) {
            session.close(CloseStatus.SERVER_ERROR);
        }
    }

    /**
     * 发送识别结果到前端
     */
    public void sendRecognitionResult(String clientSessionId, AsrResponse response) {
        try {
            WebSocketSession session = clientSessions.get(clientSessionId);
            if (session == null || !session.isOpen()) {
                log.warn("[WebSocket Handler] 客户端会话不存在或已关闭: {}", clientSessionId);
                return;
            }

            String responseJson = objectMapper.writeValueAsString(response);
            session.sendMessage(new TextMessage(responseJson));

            if (response.getResult() != null) {
                log.debug("[WebSocket Handler] 已发送识别结果: {}",
                        response.getResult().getVoiceTextStr());
            }

        } catch (Exception e) {
            log.error("[WebSocket Handler] 发送识别结果失败", e);
        }
    }

    /**
     * 解析查询参数
     */
    private Map<String, String> parseQueryParams(String query) {
        Map<String, String> params = new ConcurrentHashMap<>();
        if (query == null || query.isEmpty()) {
            return params;
        }

        String[] pairs = query.split("&");
        for (String pair : pairs) {
            String[] keyValue = pair.split("=");
            if (keyValue.length == 2) {
                params.put(keyValue[0], keyValue[1]);
            }
        }

        return params;
    }
}
