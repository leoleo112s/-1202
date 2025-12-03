package com.aios.voice.model;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * ASR 识别结果
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AsrResult {

    /**
     * 识别结果类型
     * 0: 一段话开始识别
     * 1: 一段话识别中（非稳态结果）
     * 2: 一段话识别结束（稳态结果）
     */
    @JsonProperty("slice_type")
    private Integer sliceType;

    /**
     * 当前一段话结果在整个音频流中的序号
     */
    @JsonProperty("index")
    private Integer index;

    /**
     * 当前一段话结果在整个音频流中的起始时间（ms）
     */
    @JsonProperty("start_time")
    private Integer startTime;

    /**
     * 当前一段话结果在整个音频流中的结束时间（ms）
     */
    @JsonProperty("end_time")
    private Integer endTime;

    /**
     * 当前一段话文本结果
     */
    @JsonProperty("voice_text_str")
    private String voiceTextStr;

    /**
     * 当前一段话的词结果个数
     */
    @JsonProperty("word_size")
    private Integer wordSize;

    /**
     * 当前一段话的词时间戳列表
     */
    @JsonProperty("word_list")
    private List<Object> wordList;
}
