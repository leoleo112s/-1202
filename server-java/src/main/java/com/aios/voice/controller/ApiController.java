package com.aios.voice.controller;

import com.aios.voice.model.LoginRequest;
import com.aios.voice.model.LoginResponse;
import com.aios.voice.service.AsrService;
import jakarta.annotation.Resource;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;

/**
 * REST API 控制器
 */
@Slf4j
@RestController
@RequestMapping("/api")
@CrossOrigin(origins = "*")
public class ApiController {

    @Resource
    private AsrService asrService;

    /**
     * 健康检查
     */
    @GetMapping("/health")
    public ResponseEntity<Map<String, Object>> health() {
        Map<String, Object> response = new HashMap<>();
        response.put("status", "ok");
        response.put("service", "AIOS Voice Platform");
        response.put("timestamp", System.currentTimeMillis());
        return ResponseEntity.ok(response);
    }

    /**
     * 登录接口（可选，用于测试）
     */
    @PostMapping("/login")
    public ResponseEntity<LoginResponse> login(@RequestBody LoginRequest request) {
        try {
            log.info("[API Controller] 收到登录请求 - IP: {}, Port: {}, Username: {}",
                    request.getServerIp(), request.getLoginPort(), request.getUsername());

            LoginResponse response = asrService.login(
                    request.getUsername(),
                    request.getPassword(),
                    request.getServerIp(),
                    request.getLoginPort()
            );

            return ResponseEntity.ok(response);

        } catch (Exception e) {
            log.error("[API Controller] 登录失败", e);
            return ResponseEntity.status(500).body(
                    LoginResponse.builder()
                            .status(500)
                            .msg("登录失败: " + e.getMessage())
                            .build()
            );
        }
    }
}
