<template>
  <view class="sentence-card glass" :class="{ 'sentence-inactive': !active }">
    <view class="sentence-content">
      <!-- 金句正文 -->
      <text class="sentence-text" :class="{ 'sentence-fade-out': isFading }">
        {{ currentSentence.text }}
      </text>
      
      <!-- 作者 -->
      <text class="sentence-author" :class="{ 'sentence-fade-out': isFading }">
        —— {{ currentSentence.author }}
      </text>
    </view>
  </view>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useUserStore } from '@/store/user'

const userStore = useUserStore()

const props = defineProps({
  active: {
    type: Boolean,
    default: true
  }
})

// 文档库文案列表（支持云端异步加载与随机抽取）
const sentencesList = ref([
  { text: '心之所向，素履以往。', author: '《诗经》' },
  { text: '面朝大海，春暖花开。', author: '海子' },
  { text: '愿你被这世界温柔以待。', author: '佚名' }
])

const currentIndex = ref(0)
const isFading = ref(false)

const currentSentence = computed(() => {
  if (sentencesList.value.length === 0) return { text: '静心安神，享受当下。', author: '心灵疗愈' }
  return sentencesList.value[currentIndex.value]
})

let rotateTimer = null
let fadeTimer = null

const ROTATE_INTERVAL = 8000 // 8秒切换
const FADE_DURATION = 400    // 400ms淡出

// 从云端异步获取文案库并随机化
const fetchCloudSentences = async () => {
  try {
    const res = await userStore.invoke('getRelaxSentences')
    if (Array.isArray(res.data?.sentences) && res.data.sentences.length > 0) {
      sentencesList.value = res.data.sentences
      currentIndex.value = 0
    }
  } catch (e) {
    console.error('[GoldenSentence] 获取云端文案库异常，使用默认库:', e)
  }
}

// 切换下一条
const switchNext = () => {
  isFading.value = true
  
  fadeTimer = setTimeout(() => {
    if (sentencesList.value.length > 0) {
      currentIndex.value = (currentIndex.value + 1) % sentencesList.value.length
    }
    isFading.value = false
  }, FADE_DURATION)
}

// 启动轮播
const startRotation = () => {
  rotateTimer = setInterval(switchNext, ROTATE_INTERVAL)
}

// 停止轮播
const stopRotation = () => {
  if (rotateTimer) {
    clearInterval(rotateTimer)
    rotateTimer = null
  }
  if (fadeTimer) {
    clearTimeout(fadeTimer)
    fadeTimer = null
  }
}

onMounted(async () => {
  await fetchCloudSentences()
  startRotation()
})

onUnmounted(() => {
  stopRotation()
})
</script>

<style scoped>
.sentence-card {
  padding: 30rpx 48rpx;
  border-radius: 24rpx;
  max-width: 680rpx;
  width: 100%;
  transition: opacity 1000ms ease-in-out;
}

.sentence-inactive {
  opacity: 0.25;
}

.sentence-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.sentence-text {
  font-size: 32rpx;
  color: #ffffff;
  line-height: 1.6;
  font-weight: 500;
  margin-bottom: 16rpx;
  transition: opacity 0.4s ease;
}

.sentence-author {
  font-size: 24rpx;
  color: rgba(255, 255, 255, 0.6);
  letter-spacing: 2rpx;
  transition: opacity 0.4s ease;
}

.sentence-fade-out {
  opacity: 0;
}
</style>
