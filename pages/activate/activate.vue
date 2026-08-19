<template>
  <view class="activate-page">
    <!-- 背景 -->
    <view class="background-gradient"></view>

    <!-- 内容容器 -->
    <view class="content-wrapper">
      <!-- 顶部装饰 -->
      <view class="top-decoration">
        <text class="decoration-text">欢迎来到片刻</text>
      </view>

      <!-- 主卡片 -->
      <view class="activate-card glass-strong">
        <!-- 标题 -->
        <view class="card-title">
          <text class="title-main">激活账户</text>
          <text class="title-sub">输入邀请码开启放松之旅</text>
        </view>

        <!-- 输入框 -->
        <view class="input-group">
          <input
            v-model="inviteCode"
            type="text"
            placeholder="请输入邀请码"
            placeholder-class="placeholder-text"
            class="invite-input"
            :disabled="isLoading"
            @input="handleCodeInput"
          />
          <text class="input-hint">邀请码由字母和数字组成</text>
        </view>

        <!-- 错误提示 -->
        <view v-if="errorMessage" class="error-message">
          <text>{{ errorMessage }}</text>
        </view>

        <!-- 成功提示 -->
        <view v-if="successMessage" class="success-message">
          <text>{{ successMessage }}</text>
        </view>

        <!-- 激活按钮 -->
        <view class="button-group">
          <button
            class="activate-button"
            :class="{ 'button-loading': isLoading, 'button-disabled': !inviteCode || isLoading }"
            :disabled="!inviteCode || isLoading"
            @click="handleActivate"
          >
            <text v-if="!isLoading">激活账户</text>
            <text v-else>激活中...</text>
          </button>
        </view>

        <!-- 提示信息 -->
        <view class="tips-section">
          <text class="tips-title">💡 提示</text>
          <text class="tips-text">激活后即可享受片刻的所有功能，获得初始放松时间和金币奖励。</text>
        </view>
      </view>

      <!-- 底部信息 -->
      <view class="bottom-info">
        <text class="info-text">没有邀请码？</text>
        <text class="info-link" @click="handleContactSupport">联系我们</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { useUserStore } from '@/store/user'
import { generateId } from '@/utils/index.js'

const userStore = useUserStore()

const inviteCode = ref('')
const isLoading = ref(false)
const errorMessage = ref('')
const successMessage = ref('')

/**
 * 处理邀请码输入
 */
function handleCodeInput(e) {
  // 自动转换为大写并过滤非字母数字字符
  const rawValue = e.detail.value || ''
  inviteCode.value = rawValue.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
  // 清除错误消息
  errorMessage.value = ''
}

/**
 * 处理激活
 */
async function handleActivate() {
  if (!inviteCode.value.trim()) {
    errorMessage.value = '请输入邀请码'
    return
  }

  isLoading.value = true
  errorMessage.value = ''
  successMessage.value = ''

  try {
    const result = await userStore.invoke('activateWithInviteCode', {
      code: inviteCode.value,
      idempotency_key: generateId('activate')
    })

    userStore.emitAsset(result.data)
    successMessage.value = '激活成功！正在跳转...'
    try { uni.vibrateShort({ type: 'success' }) } catch (error) { console.warn('[activate] vibration failed', { user_id: '', trace_id: '', error_stack: String(error?.stack || error?.message || error) }) }
    setTimeout(() => {
      uni.switchTab({ url: '/pages/coin/coin' })
    }, 800)
  } catch (e) {
    errorMessage.value = e.message || '网络错误，请稍后重试'
    try { uni.vibrateShort({ type: 'error' }) } catch (error) { console.warn('[activate] vibration failed', { user_id: '', trace_id: '', error_stack: String(error?.stack || error?.message || error) }) }
    uni.showToast({ title: errorMessage.value, icon: 'none', duration: 2000 })
  } finally {
    isLoading.value = false
  }
}

/**
 * 联系支持
 */
function handleContactSupport() {
  uni.showModal({
    title: '获取邀请码',
    content: '请联系我们的客服获取邀请码。',
    confirmText: '复制客服',
    cancelText: '取消',
    success: (res) => {
      if (res.confirm) {
        uni.setClipboardData({
          data: 'service@pianke.com',
          success: () => {
            uni.showToast({
              title: '已复制客服邮箱',
              icon: 'success'
            })
          }
        })
      }
    }
  })
}
</script>

<style scoped>
.activate-page {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background-color: #0d0d1a;
  position: relative;
  overflow: hidden;
}

.background-gradient {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(135deg, rgba(74, 141, 183, 0.1) 0%, rgba(217, 180, 80, 0.05) 100%);
  pointer-events: none;
}

.content-wrapper {
  display: flex;
  flex-direction: column;
  flex: 1;
  padding: 40rpx 30rpx;
  justify-content: center;
  position: relative;
  z-index: 1;
}

.top-decoration {
  text-align: center;
  margin-bottom: 60rpx;
}

.decoration-text {
  font-size: 48rpx;
  font-weight: 700;
  background: linear-gradient(135deg, #4a8db7 0%, #d9b450 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.activate-card {
  border-radius: 24rpx;
  padding: 40rpx;
  margin-bottom: 40rpx;
}

.card-title {
  display: flex;
  flex-direction: column;
  margin-bottom: 40rpx;
}

.title-main {
  font-size: 40rpx;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.95);
  margin-bottom: 10rpx;
}

.title-sub {
  font-size: 28rpx;
  color: rgba(255, 255, 255, 0.5);
}

.input-group {
  display: flex;
  flex-direction: column;
  margin-bottom: 30rpx;
}

.invite-input {
  background-color: rgba(255, 255, 255, 0.08);
  border: 1rpx solid rgba(255, 255, 255, 0.12);
  border-radius: 12rpx;
  padding: 16rpx 20rpx;
  font-size: 32rpx;
  color: rgba(255, 255, 255, 0.9);
  letter-spacing: 2rpx;
  text-transform: uppercase;
}

.invite-input:disabled {
  opacity: 0.5;
}

.placeholder-text {
  color: rgba(255, 255, 255, 0.3);
}

.input-hint {
  font-size: 24rpx;
  color: rgba(255, 255, 255, 0.4);
  margin-top: 10rpx;
  margin-left: 4rpx;
}

.error-message {
  background-color: rgba(239, 68, 68, 0.15);
  border: 1rpx solid rgba(239, 68, 68, 0.3);
  border-radius: 8rpx;
  padding: 12rpx 16rpx;
  margin-bottom: 20rpx;
}

.error-message text {
  font-size: 26rpx;
  color: #ef4444;
}

.success-message {
  background-color: rgba(34, 197, 94, 0.15);
  border: 1rpx solid rgba(34, 197, 94, 0.3);
  border-radius: 8rpx;
  padding: 12rpx 16rpx;
  margin-bottom: 20rpx;
}

.success-message text {
  font-size: 26rpx;
  color: #22c55e;
}

.button-group {
  display: flex;
  flex-direction: column;
  margin-bottom: 40rpx;
}

.activate-button {
  background: linear-gradient(135deg, #4a8db7 0%, #5a9dc7 100%);
  border: none;
  border-radius: 12rpx;
  padding: 18rpx 0;
  font-size: 32rpx;
  font-weight: 600;
  color: white;
  transition: all 0.3s ease;
}

.activate-button:active:not(.button-disabled) {
  transform: scale(0.98);
  opacity: 0.9;
}

.button-disabled {
  opacity: 0.5 !important;
}

.button-loading {
  opacity: 0.7;
}

.tips-section {
  display: flex;
  flex-direction: column;
  background-color: rgba(217, 180, 80, 0.1);
  border-left: 4rpx solid #d9b450;
  border-radius: 8rpx;
  padding: 16rpx 20rpx;
}

.tips-title {
  font-size: 28rpx;
  font-weight: 600;
  color: #d9b450;
  margin-bottom: 8rpx;
}

.tips-text {
  font-size: 26rpx;
  color: rgba(255, 255, 255, 0.6);
  line-height: 1.6;
}

.bottom-info {
  text-align: center;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 8rpx;
}

.info-text {
  font-size: 26rpx;
  color: rgba(255, 255, 255, 0.5);
}

.info-link {
  font-size: 26rpx;
  color: #4a8db7;
  text-decoration: underline;
}
</style>
