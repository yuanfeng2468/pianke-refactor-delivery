<template>
  <!-- 全屏沉浸式背景轮播 -->
  <view class="bg-scene">
    <!-- 当前背景 -->
    <image
      class="bg-image"
      :class="['bg-image-' + currentIndex, { 'active-scene': active }]"
      :src="scenes[currentIndex].image"
      mode="aspectFill"
      @load="onImageLoad"
    />
    
    <!-- 渐变遮罩 - 顶部 -->
    <view class="bg-overlay-top" />
    
    <!-- 渐变遮罩 - 底部 -->
    <view class="bg-overlay-bottom" />
    
    <!-- 暗角效果 -->
    <view class="bg-vignette" />
  </view>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'

const props = defineProps({
  active: {
    type: Boolean,
    default: true
  }
})

// 6套CC0场景背景
const scenes = ref([
  {
    id: 'rain',
    name: '雨夜',
    image: '/static/images/bg_rain.jpg'
  },
  {
    id: 'stars',
    name: '星空',
    image: '/static/images/bg_stars.jpg'
  },
  {
    id: 'waves',
    name: '海浪',
    image: '/static/images/bg_waves.jpg'
  },
  {
    id: 'forest',
    name: '森林',
    image: '/static/images/bg_forest.jpg'
  },
  {
    id: 'sunset',
    name: '日落',
    image: '/static/images/bg_sunset.jpg'
  },
  {
    id: 'clouds',
    name: '云卷',
    image: '/static/images/bg_clouds.jpg'
  }
])

const currentIndex = ref(0)
let switchTimer = null

const SWITCH_INTERVAL = 30000 // 30秒切换一次

const onImageLoad = () => {
  // 图片加载完成
}

// 自动切换背景
const startAutoSwitch = () => {
  switchTimer = setInterval(() => {
    currentIndex.value = (currentIndex.value + 1) % scenes.value.length
  }, SWITCH_INTERVAL)
}

const stopAutoSwitch = () => {
  if (switchTimer) {
    clearInterval(switchTimer)
    switchTimer = null
  }
}

onMounted(() => {
  startAutoSwitch()
})

onUnmounted(() => {
  stopAutoSwitch()
})
</script>

<style scoped>
.bg-scene {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 0;
  overflow: hidden;
}

.bg-image {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  transition: opacity 1000ms ease-in-out;
}

.bg-image-0,
.bg-image-1,
.bg-image-2,
.bg-image-3,
.bg-image-4,
.bg-image-5 {
  opacity: 0;
}

/* 当前场景显示 */
.bg-image-0.active-scene { opacity: 1; }
.bg-image-1.active-scene { opacity: 1; }
.bg-image-2.active-scene { opacity: 1; }
.bg-image-3.active-scene { opacity: 1; }
.bg-image-4.active-scene { opacity: 1; }
.bg-image-5.active-scene { opacity: 1; }

/* 活跃状态 */
.bg-active .bg-image-0,
.bg-active .bg-image-1,
.bg-active .bg-image-2,
.bg-active .bg-image-3,
.bg-active .bg-image-4,
.bg-active .bg-image-5 {
  /* 活跃时通过JS控制具体哪个显示 */
}

/* 顶部渐变遮罩 */
.bg-overlay-top {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 30%;
  background: linear-gradient(to bottom, rgba(0, 0, 0, 0.3), transparent);
  z-index: 1;
  pointer-events: none;
}

/* 底部渐变遮罩 */
.bg-overlay-bottom {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 35%;
  background: linear-gradient(to top, rgba(5, 8, 18, 0.6), transparent);
  z-index: 1;
  pointer-events: none;
}

/* 暗角效果 */
.bg-vignette {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: radial-gradient(ellipse at center, transparent 40%, rgba(5, 8, 18, 0.5) 100%);
  z-index: 1;
  pointer-events: none;
}

/* 背景图片激活状态 - 通过动态class控制 */
.bg-active {
  opacity: 1;
}

.bg-scene:not(.bg-active) .bg-image {
  opacity: 0.4;
}
</style>
