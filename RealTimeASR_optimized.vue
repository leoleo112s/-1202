<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { WebSocketAudioToText } from '@/utils/webSocketAudioToText';

// ASR 配置接口
interface AsrConfig {
  serverIp: string;
  loginPort: number;
  servicePort: number;
  username: string;
  password: string;
}

// 创建 WebSocketAudioToText 实例
const audioToText = new WebSocketAudioToText();

// 响应式数据
const isRecording = ref(false);
const transcriptText = ref(''); // 实时识别结果
const finalTranscripts = ref<string[]>([]); // 最终识别结果列表
const connectionStatus = ref<'connecting' | 'connected' | 'disconnected'>('disconnected');
const errorMessage = ref('');
const showConfig = ref(true); // 是否显示配置面板
const browserSupported = ref(true); // 浏览器是否支持

// ASR 配置（从 localStorage 加载或使用默认值）
const asrConfig = ref<AsrConfig>({
  serverIp: localStorage.getItem('asr_serverIp') || '192.168.1.100',
  loginPort: parseInt(localStorage.getItem('asr_loginPort') || '30886'),
  servicePort: parseInt(localStorage.getItem('asr_servicePort') || '30888'),
  username: localStorage.getItem('asr_username') || 'superuser',
  password: localStorage.getItem('asr_password') || ''
});

// 计算属性：是否可以开始录音
const canStartRecording = computed(() => {
  return !isRecording.value &&
         connectionStatus.value !== 'connecting' &&
         browserSupported.value &&
         asrConfig.value.serverIp.trim() !== '';
});

// 计算属性：状态文本
const statusText = computed(() => {
  switch (connectionStatus.value) {
    case 'connecting':
      return '正在连接...';
    case 'connected':
      return '已连接';
    case 'disconnected':
      return '未连接';
    default:
      return '未知';
  }
});

// 组件挂载时的初始化
onMounted(() => {
  // 检查浏览器支持
  if (!WebSocketAudioToText.isSupported()) {
    browserSupported.value = false;
    const supportInfo = WebSocketAudioToText.getSupportInfo();
    errorMessage.value = '当前浏览器不支持实时语音识别功能';
    console.error('[ASR Component] 浏览器支持情况:', supportInfo);
    return;
  }

  console.log('[ASR Component] 浏览器支持检查通过');

  // 设置 ASR 配置
  updateAsrConfig();

  // 设置回调函数
  setupCallbacks();
});

// 设置回调函数
const setupCallbacks = () => {
  // 识别结果回调
  audioToText.setOnTranscriptCallback((text: string, isFinal: boolean) => {
    console.log('[ASR Component] 识别结果:', text, isFinal ? '(最终)' : '(临时)');

    if (isFinal) {
      // 最终结果：添加到列表
      if (text.trim()) {
        finalTranscripts.value.push(text);
      }
      transcriptText.value = '';
    } else {
      // 临时结果：更新当前文本
      transcriptText.value = text;
    }
  });

  // 错误回调
  audioToText.setOnErrorCallback((error: string) => {
    console.error('[ASR Component] 错误:', error);
    errorMessage.value = error;
    isRecording.value = false;
  });

  // 状态变更回调
  audioToText.setOnStatusChangeCallback((status) => {
    console.log('[ASR Component] 状态变更:', status);
    connectionStatus.value = status;

    if (status === 'disconnected') {
      isRecording.value = false;
    } else if (status === 'connected') {
      errorMessage.value = ''; // 连接成功时清除错误
    }
  });
};

// 更新 ASR 配置
const updateAsrConfig = () => {
  try {
    audioToText.setAsrConfig({
      serverIp: asrConfig.value.serverIp,
      loginPort: asrConfig.value.loginPort,
      servicePort: asrConfig.value.servicePort,
      username: asrConfig.value.username,
      password: asrConfig.value.password
    });

    // 保存到 localStorage
    localStorage.setItem('asr_serverIp', asrConfig.value.serverIp);
    localStorage.setItem('asr_loginPort', asrConfig.value.loginPort.toString());
    localStorage.setItem('asr_servicePort', asrConfig.value.servicePort.toString());
    localStorage.setItem('asr_username', asrConfig.value.username);
    localStorage.setItem('asr_password', asrConfig.value.password);

    console.log('[ASR Component] ASR 配置已更新:', asrConfig.value);
  } catch (error) {
    console.error('[ASR Component] 更新配置失败:', error);
    errorMessage.value = '配置更新失败';
  }
};

// 开始录音
const startRecording = async () => {
  if (!canStartRecording.value) {
    return;
  }

  try {
    console.log('[ASR Component] 开始录音...');
    errorMessage.value = '';

    // 确保配置是最新的
    updateAsrConfig();

    // 启动录音
    await audioToText.start();
    isRecording.value = true;

    // 清空之前的临时结果
    transcriptText.value = '';

    console.log('[ASR Component] 录音已启动');
  } catch (error) {
    console.error('[ASR Component] 启动录音失败:', error);
    errorMessage.value = error instanceof Error ? error.message : '启动录音失败';
    isRecording.value = false;
  }
};

// 停止录音
const stopRecording = () => {
  if (!isRecording.value) {
    return;
  }

  console.log('[ASR Component] 停止录音...');
  audioToText.stop();
  isRecording.value = false;
};

// 清空文本
const clearText = () => {
  transcriptText.value = '';
  finalTranscripts.value = [];
  errorMessage.value = '';
  console.log('[ASR Component] 已清空识别结果');
};

// 切换配置面板
const toggleConfig = () => {
  showConfig.value = !showConfig.value;
};

// 复制全部文本到剪贴板
const copyAllText = async () => {
  const allText = finalTranscripts.value.join(' ') + (transcriptText.value ? ' ' + transcriptText.value : '');

  if (!allText.trim()) {
    errorMessage.value = '没有可复制的文本';
    setTimeout(() => {
      errorMessage.value = '';
    }, 2000);
    return;
  }

  try {
    await navigator.clipboard.writeText(allText);
    console.log('[ASR Component] 文本已复制到剪贴板');

    // 显示成功提示（临时修改错误消息）
    const originalError = errorMessage.value;
    errorMessage.value = '✓ 文本已复制到剪贴板';
    setTimeout(() => {
      errorMessage.value = originalError;
    }, 2000);
  } catch (error) {
    console.error('[ASR Component] 复制失败:', error);
    errorMessage.value = '复制失败，请手动复制';
  }
};

// 获取识别结果总数
const getTotalResultCount = computed(() => {
  return finalTranscripts.value.length + (transcriptText.value ? 1 : 0);
});

// 组件卸载时停止录音
onUnmounted(() => {
  console.log('[ASR Component] 组件卸载');
  if (isRecording.value) {
    stopRecording();
  }
});
</script>

<template>
  <div class="websocket-asr">
    <!-- 头部 -->
    <div class="header">
      <h2>🎙️ 实时语音识别</h2>
      <p class="subtitle">基于 AIOS 语音识别服务</p>
    </div>

    <!-- 浏览器不支持警告 -->
    <div v-if="!browserSupported" class="warning-banner">
      <div class="warning-icon">⚠️</div>
      <div class="warning-content">
        <h3>浏览器不支持</h3>
        <p>您的浏览器不支持实时语音识别功能，请使用以下浏览器：</p>
        <ul>
          <li>Chrome / Edge (推荐)</li>
          <li>Firefox</li>
          <li>Safari 14.1+</li>
        </ul>
      </div>
    </div>

    <!-- ASR 配置面板 -->
    <div class="config-panel" v-if="browserSupported">
      <div class="config-header" @click="toggleConfig">
        <h3>⚙️ ASR 服务器配置</h3>
        <button class="toggle-button">
          {{ showConfig ? '▼' : '▶' }}
        </button>
      </div>

      <div v-show="showConfig" class="config-content">
        <div class="config-grid">
          <div class="config-item">
            <label>服务器 IP</label>
            <input
              v-model="asrConfig.serverIp"
              type="text"
              placeholder="192.168.1.100"
              :disabled="isRecording"
              @change="updateAsrConfig"
            />
          </div>

          <div class="config-item">
            <label>登录端口</label>
            <input
              v-model.number="asrConfig.loginPort"
              type="number"
              placeholder="30886"
              :disabled="isRecording"
              @change="updateAsrConfig"
            />
          </div>

          <div class="config-item">
            <label>服务端口</label>
            <input
              v-model.number="asrConfig.servicePort"
              type="number"
              placeholder="30888"
              :disabled="isRecording"
              @change="updateAsrConfig"
            />
          </div>

          <div class="config-item">
            <label>用户名</label>
            <input
              v-model="asrConfig.username"
              type="text"
              placeholder="superuser"
              :disabled="isRecording"
              @change="updateAsrConfig"
            />
          </div>

          <div class="config-item full-width">
            <label>密码</label>
            <input
              v-model="asrConfig.password"
              type="password"
              placeholder="密码（可选）"
              :disabled="isRecording"
              @change="updateAsrConfig"
            />
          </div>
        </div>

        <div class="config-hint">
          <span>💡</span>
          <span>配置会自动保存到浏览器本地存储</span>
        </div>
      </div>
    </div>

    <!-- 状态指示 -->
    <div class="status-section" v-if="browserSupported">
      <div class="status-indicator">
        <span
          class="status-dot"
          :class="{
            'connecting': connectionStatus === 'connecting',
            'connected': connectionStatus === 'connected',
            'disconnected': connectionStatus === 'disconnected'
          }"
        ></span>
        <span class="status-text">{{ statusText }}</span>

        <!-- 录音指示 -->
        <div v-if="isRecording" class="recording-indicator">
          <span class="recording-dot"></span>
          <span class="recording-text">正在录音...</span>
        </div>
      </div>

      <!-- 错误消息 -->
      <div v-if="errorMessage" class="error-message" :class="{ 'success-message': errorMessage.startsWith('✓') }">
        {{ errorMessage }}
      </div>

      <!-- 结果统计 -->
      <div v-if="getTotalResultCount > 0" class="result-count">
        已识别 {{ getTotalResultCount }} 段语音
      </div>
    </div>

    <!-- 控制按钮 -->
    <div class="control-section" v-if="browserSupported">
      <button
        @click="startRecording"
        :disabled="!canStartRecording"
        class="control-button start-button"
      >
        <span class="button-icon">🎙️</span>
        <span>{{ connectionStatus === 'connecting' ? '连接中...' : '开始录音' }}</span>
      </button>

      <button
        @click="stopRecording"
        :disabled="!isRecording"
        class="control-button stop-button"
      >
        <span class="button-icon">⏹️</span>
        <span>停止录音</span>
      </button>

      <button
        @click="clearText"
        :disabled="isRecording || getTotalResultCount === 0"
        class="control-button clear-button"
      >
        <span class="button-icon">🗑️</span>
        <span>清空结果</span>
      </button>

      <button
        @click="copyAllText"
        :disabled="getTotalResultCount === 0"
        class="control-button copy-button"
      >
        <span class="button-icon">📋</span>
        <span>复制文本</span>
      </button>
    </div>

    <!-- 识别结果 -->
    <div class="transcript-section" v-if="browserSupported">
      <!-- 最终识别结果 -->
      <div class="final-transcript" v-if="finalTranscripts.length > 0">
        <h3>📝 识别结果 ({{ finalTranscripts.length }})</h3>
        <div class="transcript-list">
          <div
            v-for="(text, index) in finalTranscripts"
            :key="index"
            class="transcript-item"
          >
            <span class="item-number">#{{ index + 1 }}</span>
            <span class="item-text">{{ text }}</span>
          </div>
        </div>
      </div>

      <!-- 实时识别结果 -->
      <div class="current-transcript" v-if="transcriptText || isRecording">
        <h3>⚡ 实时识别</h3>
        <div class="transcript-content">
          {{ transcriptText || (isRecording ? '等待语音输入...' : '') }}
        </div>
      </div>

      <!-- 空状态 -->
      <div v-if="finalTranscripts.length === 0 && !transcriptText && !isRecording" class="empty-state">
        <div class="empty-icon">🎤</div>
        <p>点击"开始录音"按钮开始语音识别</p>
        <p class="empty-hint">请确保已配置 ASR 服务器并允许麦克风权限</p>
      </div>
    </div>

    <!-- 使用提示 -->
    <div class="tips-section" v-if="browserSupported && !isRecording">
      <h4>💡 使用提示</h4>
      <ul>
        <li>请在安静的环境中使用，以获得最佳识别效果</li>
        <li>识别结果会实时显示，最终结果以绿色卡片展示</li>
        <li>支持自动重连，网络波动时会自动恢复连接</li>
        <li>如遇问题，请检查麦克风权限和 ASR 服务器配置</li>
      </ul>
    </div>
  </div>
</template>

<style scoped lang="less">
.websocket-asr {
  padding: 24px;
  max-width: 900px;
  margin: 0 auto;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
}

// 头部
.header {
  text-align: center;
  margin-bottom: 32px;

  h2 {
    margin: 0 0 8px 0;
    font-size: 28px;
    color: #1a1a1a;
    font-weight: 600;
  }

  .subtitle {
    margin: 0;
    color: #666;
    font-size: 14px;
  }
}

// 警告横幅
.warning-banner {
  display: flex;
  gap: 16px;
  padding: 20px;
  margin-bottom: 24px;
  background-color: #fff3cd;
  border: 1px solid #ffc107;
  border-radius: 8px;

  .warning-icon {
    font-size: 32px;
  }

  .warning-content {
    flex: 1;

    h3 {
      margin: 0 0 8px 0;
      color: #856404;
    }

    p {
      margin: 0 0 8px 0;
      color: #856404;
    }

    ul {
      margin: 0;
      padding-left: 20px;
      color: #856404;
    }
  }
}

// 配置面板
.config-panel {
  margin-bottom: 24px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  overflow: hidden;

  .config-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 20px;
    background-color: #f5f5f5;
    cursor: pointer;
    user-select: none;

    &:hover {
      background-color: #eeeeee;
    }

    h3 {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
      color: #333;
    }

    .toggle-button {
      background: none;
      border: none;
      font-size: 14px;
      cursor: pointer;
      padding: 4px 8px;
      color: #666;
    }
  }

  .config-content {
    padding: 20px;
    background-color: #fafafa;
  }

  .config-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 16px;
    margin-bottom: 16px;
  }

  .config-item {
    display: flex;
    flex-direction: column;

    &.full-width {
      grid-column: 1 / -1;
    }

    label {
      margin-bottom: 6px;
      font-size: 14px;
      font-weight: 500;
      color: #555;
    }

    input {
      padding: 10px 12px;
      border: 1px solid #ddd;
      border-radius: 6px;
      font-size: 14px;
      transition: border-color 0.2s;

      &:focus {
        outline: none;
        border-color: #2196f3;
      }

      &:disabled {
        background-color: #f5f5f5;
        cursor: not-allowed;
      }
    }
  }

  .config-hint {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px;
    background-color: #e3f2fd;
    border-radius: 6px;
    font-size: 13px;
    color: #1976d2;
  }
}

// 状态区域
.status-section {
  margin-bottom: 24px;
  text-align: center;

  .status-indicator {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    margin-bottom: 12px;
    flex-wrap: wrap;
  }

  .status-dot {
    display: inline-block;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    transition: background-color 0.3s;

    &.connecting {
      background-color: #ff9800;
      animation: pulse 1.5s ease-in-out infinite;
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
    color: #333;
  }

  .recording-indicator {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    background-color: #ffebee;
    border-radius: 20px;

    .recording-dot {
      width: 8px;
      height: 8px;
      background-color: #f44336;
      border-radius: 50%;
      animation: pulse 1s ease-in-out infinite;
    }

    .recording-text {
      font-size: 14px;
      color: #f44336;
      font-weight: 500;
    }
  }

  .error-message {
    padding: 12px 16px;
    background-color: #ffebee;
    border: 1px solid #ef5350;
    border-radius: 6px;
    color: #c62828;
    font-size: 14px;
    margin-bottom: 12px;

    &.success-message {
      background-color: #e8f5e9;
      border-color: #66bb6a;
      color: #2e7d32;
    }
  }

  .result-count {
    font-size: 14px;
    color: #666;
  }
}

// 控制按钮
.control-section {
  display: flex;
  justify-content: center;
  gap: 12px;
  margin-bottom: 32px;
  flex-wrap: wrap;

  .control-button {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 24px;
    border: none;
    border-radius: 8px;
    font-size: 15px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    min-width: 140px;
    justify-content: center;

    .button-icon {
      font-size: 18px;
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    &:not(:disabled):hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
    }

    &:not(:disabled):active {
      transform: translateY(0);
    }

    &.start-button {
      background-color: #4caf50;
      color: white;

      &:not(:disabled):hover {
        background-color: #45a049;
      }
    }

    &.stop-button {
      background-color: #f44336;
      color: white;

      &:not(:disabled):hover {
        background-color: #d32f2f;
      }
    }

    &.clear-button {
      background-color: #9e9e9e;
      color: white;

      &:not(:disabled):hover {
        background-color: #757575;
      }
    }

    &.copy-button {
      background-color: #2196f3;
      color: white;

      &:not(:disabled):hover {
        background-color: #1976d2;
      }
    }
  }
}

// 识别结果区域
.transcript-section {
  .final-transcript {
    margin-bottom: 24px;

    h3 {
      margin: 0 0 16px 0;
      font-size: 18px;
      font-weight: 600;
      color: #333;
    }

    .transcript-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .transcript-item {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 16px;
      background-color: #e8f5e9;
      border: 1px solid #a5d6a7;
      border-radius: 8px;
      transition: transform 0.2s;

      &:hover {
        transform: translateX(4px);
      }

      .item-number {
        flex-shrink: 0;
        padding: 4px 8px;
        background-color: #4caf50;
        color: white;
        border-radius: 4px;
        font-size: 12px;
        font-weight: 600;
      }

      .item-text {
        flex: 1;
        line-height: 1.6;
        color: #1b5e20;
        word-break: break-word;
      }
    }
  }

  .current-transcript {
    margin-bottom: 24px;

    h3 {
      margin: 0 0 16px 0;
      font-size: 18px;
      font-weight: 600;
      color: #333;
    }

    .transcript-content {
      min-height: 80px;
      padding: 16px;
      background-color: #fffde7;
      border: 2px solid #fff59d;
      border-radius: 8px;
      font-size: 16px;
      line-height: 1.6;
      color: #f57f17;
      white-space: pre-wrap;
      word-wrap: break-word;
    }
  }

  .empty-state {
    text-align: center;
    padding: 48px 24px;
    color: #999;

    .empty-icon {
      font-size: 64px;
      margin-bottom: 16px;
    }

    p {
      margin: 8px 0;
      font-size: 16px;
    }

    .empty-hint {
      font-size: 14px;
      color: #bbb;
    }
  }
}

// 使用提示
.tips-section {
  margin-top: 32px;
  padding: 20px;
  background-color: #f5f5f5;
  border-radius: 8px;

  h4 {
    margin: 0 0 12px 0;
    font-size: 16px;
    color: #333;
  }

  ul {
    margin: 0;
    padding-left: 24px;

    li {
      margin: 8px 0;
      color: #666;
      font-size: 14px;
      line-height: 1.6;
    }
  }
}

// 动画
@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

// 响应式设计
@media (max-width: 768px) {
  .websocket-asr {
    padding: 16px;
  }

  .header h2 {
    font-size: 24px;
  }

  .config-grid {
    grid-template-columns: 1fr;
  }

  .control-section {
    flex-direction: column;
    align-items: stretch;

    .control-button {
      width: 100%;
      min-width: auto;
    }
  }

  .transcript-item {
    flex-direction: column;
    align-items: stretch;

    .item-number {
      align-self: flex-start;
    }
  }
}

@media (max-width: 480px) {
  .header h2 {
    font-size: 20px;
  }

  .status-indicator {
    flex-direction: column;
    gap: 8px;
  }
}
</style>
