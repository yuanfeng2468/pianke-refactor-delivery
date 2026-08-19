<template>
  <view class="legal-page">
    <view class="legal-header">
      <view class="back-button" @click="goBack">‹</view>
      <view class="header-copy">
        <text class="eyebrow">片刻 · 用户权益</text>
        <text class="page-title">{{ currentTitle }}</text>
      </view>
      <view class="header-mark">§</view>
    </view>

    <view class="document-switcher">
      <view class="switch-item" :class="{ active: activeType === 'terms' }" @click="switchDocument('terms')">
        <text class="switch-index">01</text><text>服务协议</text>
      </view>
      <view class="switch-item" :class="{ active: activeType === 'privacy' }" @click="switchDocument('privacy')">
        <text class="switch-index">02</text><text>隐私政策</text>
      </view>
    </view>

    <view v-if="isLoading" class="status-card"><text>正在加载最新内容…</text></view>
    <web-view v-else-if="currentUrl" class="document-webview" :src="currentUrl" @error="handleLoadError" />
    <view v-else class="status-card"><text>暂时无法加载内容，请稍后重试。</text></view>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { useUserStore } from '@/store/user.js'

const DEFAULT_URLS = {
  terms: 'https://env-00jy6ojekxqo-static.normal.cloudstatic.cn/user/service.html',
  privacy: 'https://env-00jy6ojekxqo-static.normal.cloudstatic.cn/user/privacy.html'
}

const userStore = useUserStore()
const activeType = ref('terms')
const isLoading = ref(true)
const loadError = ref(false)

const currentTitle = computed(() => activeType.value === 'privacy' ? '隐私政策' : '服务协议')
const currentUrl = computed(() => {
  const key = activeType.value === 'privacy' ? 'legal_privacy_url' : 'legal_terms_url'
  return String(userStore.config?.[key] || DEFAULT_URLS[activeType.value] || '').trim()
})

onLoad(async (options) => {
  if (options?.type === 'privacy') activeType.value = 'privacy'
  isLoading.value = true
  try {
    // 应用启动时通常已经同步配置；未同步时在此主动从 operation_config 拉取。
    if (!userStore.initialized || !userStore.config?.legal_terms_url || !userStore.config?.legal_privacy_url) {
      await userStore.invoke('getAppConfig').then((res) => {
        userStore.config = { ...userStore.config, ...(res.data || {}) }
      })
    }
  } catch (error) {
    console.warn('[legal] 云端法律链接读取失败，使用默认云端地址', error)
  } finally {
    isLoading.value = false
  }
})

function switchDocument(type) {
  activeType.value = type
  loadError.value = false
  isLoading.value = false
}

function handleLoadError() {
  loadError.value = true
  uni.showToast({ title: '内容加载失败，请稍后重试', icon: 'none' })
}

function goBack() {
  uni.navigateBack()
}
</script>

<style scoped>
.legal-page{min-height:100vh;background:#0d0d1a;color:rgba(255,255,255,.86);padding:70rpx 30rpx 60rpx;box-sizing:border-box}.legal-header{display:flex;align-items:center;max-width:700rpx;margin:0 auto 26rpx}.back-button{width:62rpx;height:62rpx;display:flex;align-items:center;justify-content:center;border:1rpx solid rgba(255,255,255,.1);border-radius:20rpx;background:rgba(255,255,255,.06);color:#e6c66d;font-size:50rpx;line-height:1}.header-copy{display:flex;flex:1;flex-direction:column;margin-left:20rpx}.eyebrow{color:#8ec5df;font-size:19rpx;letter-spacing:3rpx}.page-title{margin-top:5rpx;color:rgba(255,255,255,.92);font-size:36rpx;font-weight:700;letter-spacing:3rpx}.header-mark{width:62rpx;height:62rpx;display:flex;align-items:center;justify-content:center;border-radius:50%;background:rgba(230,198,109,.14);color:#e6c66d;font-size:34rpx}.document-switcher{display:flex;gap:12rpx;max-width:700rpx;margin:0 auto 22rpx;padding:8rpx;border:1rpx solid rgba(255,255,255,.08);border-radius:22rpx;background:rgba(255,255,255,.045)}.switch-item{display:flex;flex:1;align-items:center;justify-content:center;gap:10rpx;padding:17rpx 10rpx;border-radius:16rpx;color:rgba(255,255,255,.45);font-size:23rpx}.switch-item.active{background:rgba(230,198,109,.16);color:#e6c66d}.switch-index{font-size:18rpx;opacity:.7}.document-webview{display:block;width:100%;height:calc(100vh - 270rpx);max-width:700rpx;margin:0 auto;border:1rpx solid rgba(255,255,255,.1);border-radius:28rpx;overflow:hidden;background:#fff}.status-card{display:flex;align-items:center;justify-content:center;height:calc(100vh - 270rpx);max-width:700rpx;margin:0 auto;border:1rpx solid rgba(255,255,255,.1);border-radius:28rpx;background:linear-gradient(145deg,rgba(32,32,57,.96),rgba(24,24,43,.9));color:rgba(255,255,255,.62);font-size:23rpx}
</style>
