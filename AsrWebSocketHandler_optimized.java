package com.scity.module.ai.asr;

import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.*;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.io.IOException;
import java.net.URI;
import java.nio.ByteBuffer;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * WebSocket 处理器 - 处理前端实时语音流式传输
 *
 * 功能：
 * 1. 接收前端 WebSocket 连接
 * 2. 从查询参数中提取 ASR 配置
 * 3. 转发音频流到 ASR 服务器
 * 4. 将识别结果实时返回给前端
 */
@Slf4j
@Component
public class AsrWebSocketHandler extends TextWebSocketHandler {

    private final AsrService asrService;
    private final ObjectMapper objectMapper;

    // 存储 WebSocketSession ID 和客户端会话 ID 的映射
    private final Map<String, String> sessionMap = new ConcurrentHashMap<>();
    // 存储客户端会话 ID 和 WebSocketSession 的映射
    private final Map<String, WebSocketSession> clientSessions = new ConcurrentHashMap<>();

    @Autowired
    public AsrWebSocketHandler(AsrService asrService, ObjectMapper objectMapper) {
        this.asrService = asrService;
        this.objectMapper = objectMapper;
        log.info("[ASR WebSocket Handler] 初始化完成");
    }

    /**
     * 连接建立时的处理
     * 1. 解析查询参数获取 ASR 配置
     * 2. 启动 ASR 识别会话
     * 3. 发送初始响应给前端
     */
    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws Exception {
        String sessionId = session.getId();
        log.info("[WebSocket Handler] 前端连接建立: {}", sessionId);

        try {
            // 从查询参数中提取 ASR 配置
            URI uri = session.getUri();
            if (uri == null) {
                log.error("[WebSocket Handler] URI 为空");
                session.close(CloseStatus.BAD_DATA.withReason("缺少连接参数"));
                return;
            }

            Map<String, String> params = parseQueryParams(uri.getQuery());

            // 提取 ASR 服务器配置
            String serverIp = params.getOrDefault("serverIp", "127.0.0.1");
            Integer loginPort = Integer.parseInt(params.getOrDefault("loginPort", "30886"));
            Integer servicePort = Integer.parseInt(params.getOrDefault("servicePort", "30888"));
            String username = params.getOrDefault("username", "superuser");
            String password = params.getOrDefault("password", "");

            log.info("[WebSocket Handler] ASR 配置 - IP: {}, LoginPort: {}, ServicePort: {}, Username: {}",
                    serverIp, loginPort, servicePort, username);

            // 使用 WebSocketSession ID 作为客户端会话 ID
            String clientSessionId = sessionId;
            sessionMap.put(sessionId, clientSessionId);
            clientSessions.put(clientSessionId, session);

            // 启动 ASR 识别，传递完整配置
            AsrResponse response = asrService.startRecognition(
                    clientSessionId, serverIp, loginPort, servicePort, username, password);

            log.info("[WebSocket Handler] 语音识别启动成功 - VoiceId: {}", response.getVoiceId());

            // 发送启动响应给前端
            sendMessage(session, response);

        } catch (NumberFormatException e) {
            log.error("[WebSocket Handler] 端口参数格式错误", e);
            session.close(CloseStatus.BAD_DATA.withReason("端口参数格式错误"));
        } catch (Exception e) {
            log.error("[WebSocket Handler] 连接建立失败", e);
            if (session.isOpen()) {
                session.close(CloseStatus.SERVER_ERROR.withReason("服务器内部错误"));
            }
        }
    }

    /**
     * 处理二进制消息（音频数据）
     * 前端发送的 PCM 音频数据
     */
    @Override
    protected void handleBinaryMessage(WebSocketSession session, BinaryMessage message) throws Exception {
        String sessionId = session.getId();
        String clientSessionId = sessionMap.get(sessionId);

        if (clientSessionId == null) {
            log.warn("[WebSocket Handler] 会话 ID 不存在: {}", sessionId);
            return;
        }

        try {
            ByteBuffer payload = message.getPayload();
            byte[] audioData = new byte[payload.remaining()];
            payload.get(audioData);

            log.debug("[WebSocket Handler] 收到音频数据 - SessionId: {}, Size: {} bytes",
                    clientSessionId, audioData.length);

            // 转发音频数据到 ASR 服务
            asrService.sendAudioData(clientSessionId, audioData);

        } catch (Exception e) {
            log.error("[WebSocket Handler] 处理音频数据失败 - SessionId: {}", clientSessionId, e);
        }
    }

    /**
     * 处理文本消息（控制信号）
     * 例如：{"type": "end"} 或 {"isEnd": true}
     */
    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
        String sessionId = session.getId();
        String clientSessionId = sessionMap.get(sessionId);

        if (clientSessionId == null) {
            log.warn("[WebSocket Handler] 会话 ID 不存在: {}", sessionId);
            return;
        }

        try {
            String payload = message.getPayload();
            log.info("[WebSocket Handler] 收到文本消息 - SessionId: {}, Payload: {}",
                    clientSessionId, payload);

            // 尝试解析为控制信号
            Map<String, Object> msgMap = objectMapper.readValue(payload, Map.class);

            // 支持两种格式：{"type": "end"} 或 {"isEnd": true}
            String type = (String) msgMap.get("type");
            Boolean isEnd = (Boolean) msgMap.get("isEnd");

            if ("end".equals(type) || Boolean.TRUE.equals(isEnd)) {
                log.info("[WebSocket Handler] 收到结束信号 - SessionId: {}", clientSessionId);
                asrService.endRecognition(clientSessionId);
            }

        } catch (Exception e) {
            log.error("[WebSocket Handler] 处理文本消息失败 - SessionId: {}", clientSessionId, e);
        }
    }

    /**
     * 连接关闭时的处理
     */
    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) throws Exception {
        String sessionId = session.getId();
        log.info("[WebSocket Handler] 前端连接关闭 - SessionId: {}, Status: {}", sessionId, status);

        try {
            String clientSessionId = sessionMap.remove(sessionId);
            if (clientSessionId != null) {
                clientSessions.remove(clientSessionId);
                asrService.endRecognition(clientSessionId);
            }
        } catch (Exception e) {
            log.error("[WebSocket Handler] 关闭连接时出错 - SessionId: {}", sessionId, e);
        }
    }

    /**
     * 处理传输错误
     */
    @Override
    public void handleTransportError(WebSocketSession session, Throwable exception) throws Exception {
        String sessionId = session.getId();
        log.error("[WebSocket Handler] 传输错误 - SessionId: {}", sessionId, exception);

        try {
            String clientSessionId = sessionMap.remove(sessionId);
            if (clientSessionId != null) {
                clientSessions.remove(clientSessionId);
                asrService.endRecognition(clientSessionId);
            }
        } catch (Exception e) {
            log.error("[WebSocket Handler] 处理传输错误时发生异常 - SessionId: {}", sessionId, e);
        }

        if (session.isOpen()) {
            session.close(CloseStatus.SERVER_ERROR);
        }
    }

    /**
     * 发送识别结果到前端
     * 由 AsrService 回调此方法
     *
     * @param clientSessionId 客户端会话 ID
     * @param response ASR 识别结果
     */
    public void sendRecognitionResult(String clientSessionId, AsrResponse response) {
        try {
            WebSocketSession session = clientSessions.get(clientSessionId);
            if (session == null) {
                log.warn("[WebSocket Handler] 客户端会话不存在 - SessionId: {}", clientSessionId);
                return;
            }

            if (!session.isOpen()) {
                log.warn("[WebSocket Handler] 客户端会话已关闭 - SessionId: {}", clientSessionId);
                return;
            }

            sendMessage(session, response);

            // 记录识别结果（仅在有内容时）
            if (response.getResult() != null && response.getResult().getVoiceTextStr() != null) {
                log.debug("[WebSocket Handler] 已发送识别结果 - SessionId: {}, Text: {}",
                        clientSessionId, response.getResult().getVoiceTextStr());
            }

        } catch (Exception e) {
            log.error("[WebSocket Handler] 发送识别结果失败 - SessionId: {}", clientSessionId, e);
        }
    }

    /**
     * 发送消息到前端
     */
    private void sendMessage(WebSocketSession session, Object message) {
        try {
            if (!session.isOpen()) {
                log.warn("[WebSocket Handler] 会话已关闭，无法发送消息 - SessionId: {}", session.getId());
                return;
            }

            String jsonMessage = objectMapper.writeValueAsString(message);
            session.sendMessage(new TextMessage(jsonMessage));

        } catch (IOException e) {
            log.error("[WebSocket Handler] 发送消息失败 - SessionId: {}", session.getId(), e);
        }
    }

    /**
     * 解析查询参数
     *
     * @param query 查询字符串，例如：serverIp=127.0.0.1&loginPort=30886
     * @return 参数 Map
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

    /**
     * 获取当前活跃会话数
     * 可用于监控
     */
    public int getActiveSessionCount() {
        return clientSessions.size();
    }
}
