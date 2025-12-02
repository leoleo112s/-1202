<script setup lang="ts">
import { ref, onUnmounted } from 'vue';
import { WebSocketAudioToText } from '@/utils/webSocketAudioToText';

// 创建WebSocketAudioToText实例
const audioToText = new WebSocketAudioToText();

// 响应式数据
const isRecording = ref(false);
const transcriptText = ref(''); // 实时识别结果
const finalTranscript = ref(''); // 最终识别结果
const connectionStatus = ref<'connecting' | 'connected' | 'disconnected'>('disconnected');
const errorMessage = ref('');

// 设置回调函数
audioToText.setOnTranscriptCallback((text: string, isFinal: boolean) => {
  if (isFinal) {
    finalTranscript.value += text + ' ';
    transcriptText.value = '';
  } else {
    transcriptText.value = text;
  }
});

audioToText.setOnErrorCallback((error: string) => {
  errorMessage.value = error;
  isRecording.value = false;
});

audioToText.setOnStatusChangeCallback((status) => {
  connectionStatus.value = status;
  if (status === 'disconnected') {
    isRecording.value = false;
  }
});

// 开始录音
const startRecording = async () => {
  if (!WebSocketAudioToText.isSupported()) {
    errorMessage.value = '当前浏览器不支持实时语音转文字功能';
    return;
  }
  
  try {
    await audioToText.start();
    isRecording.value = true;
    errorMessage.value = '';
    // 清空之前的识别结果
    transcriptText.value = '';
    finalTranscript.value = '';
  } catch (error) {
    errorMessage.value = '启动录音失败';
    isRecording.value = false;
  }
};

// 停止录音
const stopRecording = () => {
  audioToText.stop();
  isRecording.value = false;
};

// 清空文本
const clearText = () => {
  transcriptText.value = '';
  finalTranscript.value = '';
};

// 组件卸载时停止录音
onUnmounted(() => {
  if (isRecording.value) {
    stopRecording();
  }
});
</script>

<template>
  <div class="websocket-test">
    <div class="header">
      <h2>实时语音转文字测试</h2>
    </div>
    
    <div class="status-section">
      <div class="status-indicator">
        <span 
          class="status-dot" 
          :class="{
            'connecting': connectionStatus === 'connecting',
            'connected': connectionStatus === 'connected',
            'disconnected': connectionStatus === 'disconnected'
          }"
        ></span>
        <span class="status-text">
          状态: {{ 
            connectionStatus === 'connecting' ? '连接中...' : 
            connectionStatus === 'connected' ? '已连接' : 
            '未连接' 
          }}
        </span>
      </div>
      
      <div v-if="errorMessage" class="error-message">
        {{ errorMessage }}
      </div>
    </div>
    
    <div class="control-section">
      <button 
        @click="startRecording" 
        :disabled="isRecording || connectionStatus === 'connecting'"
        class="record-button start-button"
      >
        {{ connectionStatus === 'connecting' ? '连接中...' : '开始录音' }}
      </button>
      
      <button 
        @click="stopRecording" 
        :disabled="!isRecording"
        class="record-button stop-button"
      >
        停止录音
      </button>
      
      <button 
        @click="clearText"
        class="clear-button"
      >
        清空文本
      </button>
    </div>
    
    <div class="transcript-section">
      <div class="final-transcript">
        <h3>识别结果:</h3>
        <div class="transcript-content">
          {{ finalTranscript }}
        </div>
      </div>
      
      <div class="current-transcript">
        <h3>实时识别:</h3>
        <div class="transcript-content">
          {{ transcriptText }}
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="less">
.websocket-test {
  padding: 20px;
  max-width: 800px;
  margin: 0 auto;
  font-family: Arial, sans-serif;
}

.header {
  text-align: center;
  margin-bottom: 30px;
  
  h2 {
    margin: 0;
    color: #333;
  }
}

.status-section {
  margin-bottom: 30px;
  text-align: center;
  
  .status-indicator {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    margin-bottom: 10px;
  }
  
  .status-dot {
    display: inline-block;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    
    &.connecting {
      background-color: #ff9800;
    }
    
    &.connected {
      background-color: #4caf50;
    }
    
    &.disconnected {
      background-color: #f44336;
    }
  }
  
  .status-text {
    font-weight: 500;
  }
  
  .error-message {
    color: #f44336;
    font-size: 14px;
    margin-top: 10px;
  }
}

.control-section {
  display: flex;
  justify-content: center;
  gap: 15px;
  margin-bottom: 30px;
  flex-wrap: wrap;
  
  .record-button, .clear-button {
    padding: 12px 24px;
    border: none;
    border-radius: 6px;
    font-size: 16px;
    cursor: pointer;
    transition: all 0.3s ease;
    
    &:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
  }
  
  .record-button {
    min-width: 120px;
    
    &.start-button {
      background-color: #4caf50;
      color: white;
      
      &:hover:not(:disabled) {
        background-color: #45a049;
      }
    }
    
    &.stop-button {
      background-color: #f44336;
      color: white;
      
      &:hover:not(:disabled) {
        background-color: #d32f2f;
      }
    }
  }
  
  .clear-button {
    background-color: #2196f3;
    color: white;
    
    &:hover:not(:disabled) {
      background-color: #1976d2;
    }
  }
}

.transcript-section {
  .final-transcript, .current-transcript {
    margin-bottom: 25px;
    
    h3 {
      margin-top: 0;
      margin-bottom: 10px;
      color: #333;
    }
    
    .transcript-content {
      min-height: 80px;
      padding: 15px;
      border: 1px solid #ddd;
      border-radius: 6px;
      background-color: #f9f9f9;
      font-size: 16px;
      line-height: 1.5;
      white-space: pre-wrap;
      word-wrap: break-word;
    }
  }
  
  .current-transcript .transcript-content {
    background-color: #fffbe6;
    border-color: #ffe58f;
  }
}

@media (max-width: 600px) {
  .control-section {
    flex-direction: column;
    align-items: center;
    
    .record-button, .clear-button {
      width: 100%;
      max-width: 250px;
    }
  }
}
</style>