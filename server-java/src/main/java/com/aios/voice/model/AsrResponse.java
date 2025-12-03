package com.aios.voice.model;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * ASR 响应
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AsrResponse {

    /**
     * 状态码，0代表正常
     */
    @JsonProperty("code")
    private Object code;  // 可能是 int 或 String

    /**
     * 错误说明
     */
    @JsonProperty("message")
    private String message;

    /**
     * 音频流唯一 ID
     */
    @JsonProperty("voice_id")
    private String voiceId;

    /**
     * 消息唯一 ID
     */
    @JsonProperty("message_id")
    private String messageId;

    /**
     * 识别结果
     */
    @JsonProperty("result")
    private AsrResult result;

    /**
     * 是否为最后一个包（1表示音频流全部识别结束）
     */
    @JsonProperty("final")
    private Integer _final;
}
