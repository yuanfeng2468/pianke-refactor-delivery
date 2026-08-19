<template>
  <view
    class="ad-btn"
    :class="buttonClass"
    @tap="handleClick"
  >
    <!-- 加载态 -->
    <view v-if="isLoading" class="ad-loading">
      <view class="loading-spinner" />
      <text class="ad-text-loading">正在准备...</text>
    </view>
    
    <!-- 达上限态 -->
    <text v-else-if="dailyAdCount >= dailyAdLimit" class="ad-text-disabled">
      今日广告已达上限
    </text>

    <!-- 已禁用态 -->
    <text v-else-if="!isAdEnabled(userStore, 'rewarded')" class="ad-text-disabled">
      当前功能暂未开启
    </text>

    <!-- 未配置态 -->
    <text v-else-if="!isAdConfigured" class="ad-text-disabled">
      广告位未配置
    </text>
    
    <!-- 正常态：时间>0 显示服务端配置的默认奖励 -->
    <view v-else-if="remainingTime > 0" class="ad-content">
      <text class="ad-text-primary">观看广告获得奖励</text>
      <text class="ad-text-hint">完整观看后由云端发放</text>
    </view>
    
    <!-- 正常态：时间<=0 显示 "看广告继续放松" -->
    <text v-else class="ad-text-primary">
      看广告继续放松
    </text>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useUserStore } from '@/store/user.js'
import { playRewardedAd, getAdpid, isAdEnabled } from '@/utils/ad.js'

const props = defineProps({
  adpid: { type: String, default: '' },
  scene: { type: String, default: 'relax' },
  remainingTime: { type: Number, default: 0 },
  dailyAdCount: { type: Number, default: 0 },
  dailyAdLimit: { type: Number, default: 100 }
})

const emit = defineEmits(['reward'])
const userStore = useUserStore()
const isLoading = ref(false)
const flashAmber = ref(false)
const isAdConfigured = computed(() => Boolean(getAdpid(userStore, 'rewarded')))
const buttonClass = computed(() => {
  const classes = ['glass']
  if (isLoading.value) classes.push('ad-btn-loading')
  else if (props.dailyAdCount >= props.dailyAdLimit) classes.push('ad-btn-disabled')
  else classes.push('breathing-light')
  if (flashAmber.value) classes.push('flash-amber')
  return classes
})

async function handleClick() {
  if (isLoading.value || props.dailyAdCount >= props.dailyAdLimit || !isAdConfigured.value || !isAdEnabled(userStore, 'rewarded')) return
  
  // 增加反馈
  try { uni.vibrateShort({ type: 'medium' }) } catch (error) { console.warn('[RewardedAd] vibration failed', { user_id: '', trace_id: '', error_stack: String(error?.stack || error?.message || error) }) }
  
  isLoading.value = true
  try {
    const data = await playRewardedAd({
      // 广告位由数据库 operation_config.adpid_rewarded 注入 Store，组件不接受外部覆盖。
      store: userStore,
      scene: props.scene,
      onRewarded: (reward, meta = {}) => {
        emit('reward', reward, meta)
        if (!meta.late) return
        flashAmber.value = true
        setTimeout(() => { flashAmber.value = false }, 1200)
        try { uni.vibrateShort({ type: 'success' }) } catch (error) { console.warn('[RewardedAd] vibration failed', { user_id: '', trace_id: '', error_stack: String(error?.stack || error?.message || error) }) }
        void userStore.getUserInfo({ force: true })
        uni.showToast({ title: '奖励已到账', icon: 'success' })
      }
    })

    if (data?.pending) {
      uni.showToast({ title: '广告已完成，奖励正在核验，请稍后刷新', icon: 'none', duration: 2500 })
      return data
    }

    // 成功动效
    flashAmber.value = true
    setTimeout(() => { flashAmber.value = false }, 1200)
    
    try { uni.vibrateShort({ type: 'success' }) } catch (error) { console.warn('[RewardedAd] vibration failed', { user_id: '', trace_id: '', error_stack: String(error?.stack || error?.message || error) }) }
    
    // 成功后刷新用户信息
    void userStore.getUserInfo({ force: true })
    
    return data
  } catch (error) {
    uni.showToast({ title: error.message || '广告未完成，请稍后重试', icon: 'none', duration: 2000 })
  } finally {
    isLoading.value = false
  }
}
</script>

<style scoped>
.ad-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 440rpx;
  padding: 28rpx 64rpx;
  border-radius: 999rpx;
  transition: all 300ms ease-in-out;
}

.ad-btn:active {
  transform: scale(0.97);
}

.ad-btn-loading {
  opacity: 0.5;
}

.ad-btn-disabled {
  opacity: 0.3;
}

.ad-loading {
  display: flex;
  align-items: center;
  gap: 16rpx;
}

.loading-spinner {
  width: 32rpx;
  height: 32rpx;
  border: 3rpx solid rgba(255, 255, 255, 0.2);
  border-top-color: rgba(255, 255, 255, 0.6);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.ad-text-loading {
  font-size: 28rpx;
  color: rgba(255, 255, 255, 0.6);
}

.ad-text-disabled {
  font-size: 28rpx;
  color: rgba(255, 255, 255, 0.4);
}

.ad-content {
  display: flex;
  align-items: center;
  gap: 16rpx;
}

.ad-text-primary {
  font-size: 32rpx;
  font-weight: 500;
  color: #d9b450;
}

.ad-text-hint {
  font-size: 24rpx;
  color: rgba(255, 255, 255, 0.4);
}

.breathing-light {
  animation: breathe 3s ease-in-out infinite;
}

@keyframes breathe {
  0%, 100% {
    box-shadow: 0 0 20rpx rgba(217, 180, 80, 0.3);
  }
  50% {
    box-shadow: 0 0 40rpx rgba(217, 180, 80, 0.6);
  }
}

.flash-amber {
  animation: flash 1.2s ease-out;
}

@keyframes flash {
  0% {
    background-color: rgba(217, 180, 80, 0.4);
  }
  100% {
    background-color: rgba(255, 255, 255, 0.08);
  }
}
</style>
