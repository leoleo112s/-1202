package com.aios.voice.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

/**
 * ASR 服务器配置
 */
@Data
@Configuration
@ConfigurationProperties(prefix = "asr")
public class AsrConfig {

    /**
     * ASR 服务器 IP
     */
    private String serverIp = "127.0.0.1";

    /**
     * 登录端口
     */
    private Integer loginPort = 30886;

    /**
     * 业务端口
     */
    private Integer servicePort = 30888;

    /**
     * 用户名
     */
    private String username = "superuser";

    /**
     * 密码
     */
    private String password = "";

    /**
     * WebSocket 参数配置
     */
    private WebSocketParams websocketParams = new WebSocketParams();

    @Data
    public static class WebSocketParams {
        private String voiceFormat = "1";           // 语音编码方式，1：pcm
        private String needvad = "1";               // 开启 VAD
        private String resultTextFormat = "0";      // UTF-8 编码
        private String filterDirty = "0";           // 不过滤脏词
        private String filterModal = "0";           // 不过滤语气词
        private String filterPunc = "0";            // 不过滤句末句号
        private String convertNumMode = "1";        // 智能转换阿拉伯数字
        private String wordInfo = "0";              // 不显示词级别时间戳
        private String vadSilenceTime = "1000";     // 断句检测阈值
    }

    /**
     * 获取登录 URL
     */
    public String getLoginUrl() {
        return String.format("http://%s:%d/login", serverIp, loginPort);
    }

    /**
     * 获取 WebSocket URL
     */
    public String getWsUrl() {
        return String.format("ws://%s:%d/websocket/realtime_asr_ws_private", serverIp, servicePort);
    }
}
