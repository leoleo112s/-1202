package com.aios.voice.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 登录响应
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class LoginResponse {
    private Integer status;
    private String msg;
    private LoginData data;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class LoginData {
        private String session;
    }
}
