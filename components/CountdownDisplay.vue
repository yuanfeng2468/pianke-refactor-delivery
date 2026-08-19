<template>
  <view class="countdown" :class="{ 'countdown-inactive': !active }">
    <!-- 大号倒计时数字 -->
    <text class="countdown-time" :class="timeClass">
      {{ formattedTime }}
    </text>
    
    <!-- 副标题 -->
    <text class="countdown-subtitle" :class="{ 'countdown-subtitle-hidden': !active }">
      {{ subtitleText }}
    </text>
  </view>
</template>

<script setup>
import { computed } from 'vue'
import { formatTime } from '@/utils/index.js'

const props = defineProps({
  seconds: {
    type: Number,
    default: 0
  },
  active: {
    type: Boolean,
    default: true
  }
})

const formattedTime = computed(() => {
  return formatTime(Math.max(0, props.seconds))
})

const isLow = computed(() => props.seconds <= 30 && props.seconds > 0)
const isZero = computed(() => props.seconds <= 0)

const timeClass = computed(() => {
  if (isZero.value) return 'countdown-zero'
  if (isLow.value) return 'countdown-low'
  return 'countdown-normal'
})

const subtitleText = computed(() => {
  return isZero.value ? '放松时间已耗尽' : '你的专属宁静时刻'
})
</script>

<style scoped>
.countdown {
  display: flex;
  flex-direction: column;
  align-items: center;
  transition: opacity 1000ms ease-in-out;
}

.countdown-inactive {
  opacity: 0.3;
}

.countdown-time {
  font-size: 160rpx;
  font-weight: 200;
  letter-spacing: 8rpx;
  text-shadow: 0 4rpx 20rpx rgba(0, 0, 0, 0.5);
  transition: color 500ms ease;
}

.countdown-normal {
  color: rgba(255, 255, 255, 0.95);
}

.countdown-low {
  color: #e6c040;
}

.countdown-zero {
  color: #e74c3c;
  animation: pulse 1.5s infinite;
}

.countdown-subtitle {
  font-size: 28rpx;
  color: rgba(255, 255, 255, 0.4);
  margin-top: 16rpx;
  font-family: 'STSongti-SC-Regular', 'Songti SC', serif;
  transition: opacity 1000ms ease-in-out;
}

.countdown-subtitle-hidden {
  opacity: 0.3;
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}
</style>
