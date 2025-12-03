package com.aios.voice;

import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.ConfigurableApplicationContext;

/**
 * AIOS 语音平台主应用
 */
@Slf4j
@SpringBootApplication
public class VoicePlatformApplication {

    public static void main(String[] args) {
        ConfigurableApplicationContext context = SpringApplication.run(VoicePlatformApplication.class, args);

        String port = context.getEnvironment().getProperty("server.port", "3001");
        log.info("========================================");
        log.info("AIOS Voice Platform Started Successfully!");
        log.info("Server running on port: {}", port);
        log.info("WebSocket endpoint: ws://localhost:{}/asr", port);
        log.info("Health check: http://localhost:{}/api/health", port);
        log.info("========================================");
    }
}
