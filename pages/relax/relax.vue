<template>
  <view class="relax-page">
    <BackgroundScene :active="isActive" />
    <view class="content-layer">
      <view class="top-section">
        <CountdownDisplay :seconds="remainingSeconds" :active="isActive" />
        <text class="sync-label">云端计时 · 自动同步</text>
      </view>
      <view class="middle-section">
        <GoldenSentence :active="isActive" />
      </view>
      <view class="bottom-section">
        <WhiteNoiseControl :active="isActive" />
        <view
          class="relax-ad-btn breathing-light"
          :class="{ disabled: rewardLoading || user.activation_status !== 'activated' }"
          @click="handleRelaxRewardedAd"
        >
          <text class="relax-ad-icon">▶</text>
          <text class="relax-ad-text">{{ rewardLoading ? '广告处理中…' : '观看激励视频，获得云端配置放松时长' }}</text>
        </view>
        <text v-if="user.activation_status !== 'activated'" class="activation-hint">请先完成账户激活后领取奖励</text>
      </view>
    </view>
    <view v-if="!isActive && remainingSeconds <= 0" class="exhausted-overlay">
      <view class="exhausted-card glass-strong" @click="handleRelaxRewardedAd">
        <text class="exhausted-title">本轮放松已结束</text>
        <text class="exhausted-desc">完整观看激励视频，可继续获得服务端发放的放松时长。</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { useUserStore } from '@/store/user.js'
import { playRewardedAd } from '@/utils/ad.js'
import BackgroundScene from '@/components/BackgroundScene.vue'
import CountdownDisplay from '@/components/CountdownDisplay.vue'
import GoldenSentence from '@/components/GoldenSentence.vue'
import WhiteNoiseControl from '@/components/WhiteNoiseControl.vue'

const userStore = useUserStore()
const user = computed(() => userStore.user || {})
const remainingSeconds = computed(() => userStore.remainingSeconds)
const isActive = computed(() => userStore.isActive)
const rewardLoading = ref(false)

onShow(() => {
  void userStore.getUserInfo()
})

async function handleRelaxRewardedAd() {
  if (rewardLoading.value) return
  if (user.value.activation_status !== 'activated') {
    uni.showToast({ title: '请先完成账户激活', icon: 'none' })
    return
  }

  // 增加触感反馈
  try { uni.vibrateShort({ type: 'medium' }) } catch (error) { console.warn('[relax] vibration failed', { user_id: '', trace_id: '', error_stack: String(error?.stack || error?.message || error) }) }

  rewardLoading.value = true
  try {
    const result = await playRewardedAd({
      store: userStore,
      scene: 'relax',
      onRewarded: (_reward, meta = {}) => {
        if (!meta.late) return
        void userStore.getUserInfo({ force: true })
      }
    })
    if (result?.pending) {
      uni.showToast({ title: '广告已完成，时长正在核验，请稍后刷新', icon: 'none', duration: 2500 })
      return
    }
    uni.showToast({ title: '奖励已到账', icon: 'success' })
    // 成功后主动刷新一次状态
    void userStore.getUserInfo({ force: true })
  } catch (error) {
    uni.showToast({ title: error.message || '广告未完成，请重试', icon: 'none' })
  } finally {
    rewardLoading.value = false
  }
}
</script>

<style scoped>
.relax-page { position: relative; width: 100vw; height: 100vh; overflow: hidden; background: #0d0d1a; }
.content-layer { position: relative; z-index: 10; display: flex; flex-direction: column; justify-content: center; height: 100%; padding: calc(20rpx + env(safe-area-inset-top)) 32rpx calc(20rpx + env(safe-area-inset-bottom)); box-sizing: border-box; gap: 40rpx; }
.top-section { display: flex; flex-direction: column; justify-content: center; align-items: center; gap: 10rpx; }
.sync-label { color: rgba(255,255,255,.46); font-size: 22rpx; letter-spacing: 2rpx; }
.middle-section { display: flex; justify-content: center; align-items: center; }
.bottom-section { display: flex; flex-direction: column; gap: 18rpx; align-items: center; }
.relax-ad-btn { width: 100%; max-width: 600rpx; background: linear-gradient(135deg, #d9b450 0%, #e6c66d 100%); border-radius: 999rpx; padding: 24rpx 0; display: flex; justify-content: center; align-items: center; gap: 12rpx; box-shadow: 0 8rpx 24rpx rgba(217,180,80,.4); transition: opacity .2s; }
.relax-ad-btn.disabled { opacity: .48; }
.relax-ad-icon { width: 36rpx; height: 36rpx; line-height: 36rpx; text-align: center; border-radius: 50%; background: #0d0d1a; color: #e6c66d; font-size: 20rpx; }
.relax-ad-text { font-size: 29rpx; font-weight: 700; color: #0d0d1a; letter-spacing: 1rpx; }
.activation-hint { color: rgba(255,255,255,.56); font-size: 22rpx; }
.exhausted-overlay { position: absolute; inset: 0; background: rgba(13,13,26,.85); backdrop-filter: blur(20px); z-index: 100; display: flex; justify-content: center; align-items: center; padding: 40rpx; }
.exhausted-card { padding: 48rpx; border-radius: 32rpx; text-align: center; border: 1rpx solid rgba(217,180,80,.4); box-shadow: 0 16rpx 48rpx rgba(0,0,0,.5); }
.exhausted-title { display: block; font-size: 36rpx; font-weight: 700; color: #fff; margin-bottom: 16rpx; }
.exhausted-desc { display: block; font-size: 26rpx; color: rgba(255,255,255,.6); line-height: 1.5; }
</style>
