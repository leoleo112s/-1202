package com.scity.module.ai.asr;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 会话信息
 * 用于存储每个客户端会话的配置和状态
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SessionInfo {
    /**
     * 客户端会话 ID
     * 通常是 WebSocketSession.getId()
     */
    private String clientSessionId;

    /**
     * 语音 ID
     * ASR 服务器识别会话的唯一标识符
     */
    private String voiceId;

    /**
     * ASR 服务器 IP
     */
    private String serverIp;

    /**
     * ASR 服务端口
     */
    private Integer servicePort;

    /**
     * SESSION cookie
     * 用于认证
     */
    private String sessionCookie;

    /**
     * 会话创建时间
     */
    private Long createTime = System.currentTimeMillis();

    /**
     * 最后活跃时间
     */
    private Long lastActiveTime = System.currentTimeMillis();

    /**
     * 发送的音频包数量
     */
    private Integer audioPacketCount = 0;

    /**
     * 接收的识别结果数量
     */
    private Integer resultCount = 0;

    /**
     * 会话状态
     * INIT, CONNECTED, ACTIVE, CLOSING, CLOSED
     */
    private String status = "INIT";
}
