package com.aios.voice.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.java_websocket.client.WebSocketClient;

/**
 * 会话信息
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SessionInfo {
    private String sessionId;
    private String voiceId;
    private WebSocketClient asrWebSocket;
    private Boolean isActive;
}
