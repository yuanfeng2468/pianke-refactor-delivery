<template>
  <view class="noise-container">
    <view class="noise-control glass" :class="{ 'noise-inactive': !active }">
      <!-- 5种音效按钮 -->
      <view class="noise-buttons">
        <view
          v-for="noise in whiteNoises"
          :key="noise.id"
          class="noise-btn"
          :class="{ 'noise-active': playing.has(noise.id) }"
          @tap="toggleNoise(noise)"
        >
          <!-- 选中态光晕环 -->
          <view v-if="playing.has(noise.id)" class="noise-glow" />
          
          <!-- 音效图标 -->
          <text class="noise-icon" :class="{ 'icon-active': playing.has(noise.id) }">
            {{ noise.icon }}
          </text>
          
          <!-- 音效名称（tooltip） -->
          <view class="noise-tooltip">
            <text class="noise-tooltip-text">{{ noise.name }}</text>
          </view>
        </view>
      </view>

      <!-- 分隔线 -->
      <view class="noise-divider" />

      <!-- 静音总控 -->
      <view class="mute-btn" @tap="toggleMute">
        <text class="mute-icon">
          {{ isMuted ? '🔇' : '🔊' }}
        </text>
      </view>
    </view>

    <!-- 混音面板：当有音效播放时显示 -->
    <view v-if="playing.size > 0 && active" class="mixer-panel glass-strong animate-fade-in">
      <view v-for="id in Array.from(playing)" :key="id" class="mixer-row">
        <text class="mixer-icon">{{ getNoiseById(id).icon }}</text>
        <slider 
          class="mixer-slider"
          :value="volumes[id] * 100" 
          @change="(e) => updateVolume(id, e.detail.value)"
          activeColor="#4a8db7" 
          backgroundColor="rgba(255,255,255,0.1)" 
          block-size="12"
        />
        <text class="mixer-percent">{{ Math.round(volumes[id] * 100) }}%</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, watch, onUnmounted, reactive } from 'vue'

const props = defineProps({
  active: {
    type: Boolean,
    default: true
  }
})

// 音频随源码交付，避免生产环境依赖不可控的第三方 CDN。
const AUDIO_BASE_URL = '/static/audio/'

// 5种白噪音定义
const whiteNoises = ref([
  { id: 'rain', name: '雨声', icon: '🌧', audioFile: AUDIO_BASE_URL + 'rain.wav' },
  { id: 'stream', name: '溪流', icon: '🌊', audioFile: AUDIO_BASE_URL + 'stream.wav' },
  { id: 'forest', name: '林风', icon: '🌲', audioFile: AUDIO_BASE_URL + 'forest.wav' },
  { id: 'fire', name: '篝火', icon: '🔥', audioFile: AUDIO_BASE_URL + 'fire.wav' },
  { id: 'night', name: '夜曲', icon: '🌙', audioFile: AUDIO_BASE_URL + 'night.wav' }
])

// 当前播放的音效集合
const playing = ref(new Set())
const isMuted = ref(false)
const audioContexts = ref(new Map())
const volumes = reactive({})

// 初始化音量
whiteNoises.value.forEach(n => {
  volumes[n.id] = 0.5
})

const getNoiseById = (id) => whiteNoises.value.find(n => n.id === id)

/**
 * 切换音效播放/暂停
 */
const toggleNoise = (noise) => {
  if (playing.value.has(noise.id)) {
    stopNoise(noise.id)
  } else {
    // 混音升级：最多支持3种音效同时播放
    if (playing.value.size >= 3) {
      uni.showToast({
        title: '最多支持3种音效混音',
        icon: 'none'
      })
      return
    }
    playNoise(noise)
  }
}

/**
 * 更新独立音量
 */
const updateVolume = (id, val) => {
  const vol = val / 100
  volumes[id] = vol
  const ctx = audioContexts.value.get(id)
  if (ctx) {
    ctx.volume = vol
  }
}

/**
 * 播放单个音效
 */
const playNoise = (noise) => {
  playing.value.add(noise.id)
  
  try {
    const ctx = uni.createInnerAudioContext()
    ctx.src = noise.audioFile
    ctx.loop = true
    ctx.volume = volumes[noise.id]
    ctx.autoplay = true
    
    if (isMuted.value) {
      ctx.muted = true
    }
    
    ctx.play()
    
    ctx.onError((err) => {
      console.error(`[Audio] ${noise.name} 播放失败:`, err)
      playing.value.delete(noise.id)
      audioContexts.value.delete(noise.id)
      uni.showToast({ title: `${noise.name}加载失败`, icon: 'none' })
    })
    
    audioContexts.value.set(noise.id, ctx)
  } catch (e) {
    playing.value.delete(noise.id)
  }
}

/**
 * 停止单个音效
 */
const stopNoise = (noiseId) => {
  playing.value.delete(noiseId)
  const ctx = audioContexts.value.get(noiseId)
  if (ctx) {
    try {
      ctx.stop()
      ctx.destroy?.()
    } catch (error) { console.warn('[WhiteNoiseControl] audio operation failed', { user_id: '', trace_id: '', error_stack: String(error?.stack || error?.message || error) }) }
    audioContexts.value.delete(noiseId)
  }
}

/**
 * 停止所有音效
 */
const stopAllNoises = async () => {
  const noiseIds = Array.from(playing.value)
  noiseIds.forEach(id => stopNoise(id))
}

/**
 * 切换静音
 */
const toggleMute = () => {
  isMuted.value = !isMuted.value
  audioContexts.value.forEach((ctx) => {
    ctx.muted = isMuted.value
  })
}

watch(() => props.active, (newActive) => {
  if (!newActive && playing.value.size > 0) {
    stopAllNoises()
  }
})

onUnmounted(() => {
  audioContexts.value.forEach((ctx) => {
    try {
      ctx.stop()
      ctx.destroy?.()
    } catch (error) { console.warn('[WhiteNoiseControl] audio operation failed', { user_id: '', trace_id: '', error_stack: String(error?.stack || error?.message || error) }) }
  })
  audioContexts.value.clear()
  playing.value.clear()
})
</script>

<style scoped>
.noise-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20rpx;
}

.noise-control {
  display: flex;
  flex-direction: row;
  align-items: center;
  padding: 16rpx 24rpx;
  border-radius: 999rpx;
  gap: 8rpx;
}

.noise-inactive {
  opacity: 0.3;
}

.noise-buttons {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8rpx;
}

.noise-btn {
  position: relative;
  width: 80rpx;
  height: 80rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: all 300ms ease;
}

.noise-active {
  background-color: rgba(74, 141, 183, 0.15);
}

.noise-glow {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  border-radius: 50%;
  border: 2rpx solid rgba(74, 141, 183, 0.4);
  animation: noisePulse 2s infinite alternate ease-in-out;
}

@keyframes noisePulse {
  0% { transform: scale(1); opacity: 0.6; }
  100% { transform: scale(1.15); opacity: 0.2; }
}

.noise-icon {
  font-size: 36rpx;
  color: rgba(255, 255, 255, 0.4);
}

.icon-active {
  color: #4a8db7;
}

.noise-tooltip {
  position: absolute;
  bottom: -50rpx;
  left: 50%;
  transform: translateX(-50%);
  opacity: 0;
  pointer-events: none;
}

.noise-btn:active .noise-tooltip,
.noise-active .noise-tooltip {
  opacity: 1;
}

.noise-tooltip-text {
  font-size: 20rpx;
  color: rgba(255, 255, 255, 0.6);
  white-space: nowrap;
  background: rgba(0, 0, 0, 0.6);
  padding: 4rpx 12rpx;
  border-radius: 8rpx;
}

.noise-divider {
  width: 2rpx;
  height: 48rpx;
  background-color: rgba(255, 255, 255, 0.15);
  margin: 0 16rpx;
}

.mute-icon {
  font-size: 32rpx;
  color: rgba(255, 255, 255, 0.5);
}

/* 混音面板样式 */
.mixer-panel {
  width: 500rpx;
  padding: 24rpx;
  border-radius: 32rpx;
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.mixer-row {
  display: flex;
  align-items: center;
  gap: 20rpx;
}

.mixer-icon {
  font-size: 32rpx;
  width: 40rpx;
}

.mixer-slider {
  flex: 1;
  margin: 0;
}

.mixer-percent {
  font-size: 20rpx;
  color: rgba(255, 255, 255, 0.4);
  width: 60rpx;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.animate-fade-in {
  animation: fadeIn 400ms ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10rpx); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
