<template>
  <view class="feedback-page">
    <view class="background-gradient" />
    
    <view class="header">
      <text class="title">意见反馈</text>
      <text class="subtitle">您的每一个建议都能让“片刻”变得更好</text>
    </view>

    <view class="form-container animate-fade-in">
      <view class="input-group">
        <text class="label">反馈内容</text>
        <textarea
          v-model="content"
          class="textarea glass"
          placeholder="请详细描述您遇到的问题或建议的声音类型..."
          placeholder-style="color: rgba(255,255,255,0.2)"
          maxlength="500"
        />
        <text class="word-count">{{ content.length }}/500</text>
      </view>

      <view class="input-group">
        <text class="label">联系方式 (选填)</text>
        <input
          v-model="contact"
          class="input glass"
          placeholder="邮箱或微信号，方便我们回复您"
          placeholder-style="color: rgba(255,255,255,0.2)"
          maxlength="50"
        />
      </view>

      <button
        class="submit-btn"
        :class="{ disabled: !content.trim() || loading }"
        :loading="loading"
        @tap="handleSubmit"
      >
        提交反馈
      </button>
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { useUserStore } from '@/store/user.js'

const userStore = useUserStore()
const content = ref('')
const contact = ref('')
const loading = ref(false)

const handleSubmit = async () => {
  if (!content.value.trim() || loading.value) return
  
  loading.value = true
  try {
    const res = await userStore.invoke('submitFeedback', {
      content: content.value.trim(),
      contact: contact.value.trim()
    })
    
    if (res.code === 0) {
      uni.showToast({ title: '提交成功', icon: 'success' })
      setTimeout(() => {
        uni.navigateBack()
      }, 1500)
    } else {
      uni.showToast({ title: res.message || '提交失败', icon: 'none' })
    }
  } catch (e) {
    uni.showToast({ title: '提交异常，请稍后重试', icon: 'none' })
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.feedback-page {
  min-height: 100vh;
  background: #0d0d1a;
  color: #fff;
  padding: 60rpx 40rpx;
  position: relative;
}

.background-gradient {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 400rpx;
  background: radial-gradient(circle at 50% 0, rgba(74, 141, 183, 0.15), transparent 70%);
  pointer-events: none;
}

.header {
  margin-bottom: 60rpx;
  text-align: center;
}

.title {
  font-size: 40rpx;
  font-weight: 700;
  display: block;
  margin-bottom: 12rpx;
  letter-spacing: 2rpx;
}

.subtitle {
  font-size: 24rpx;
  color: rgba(255, 255, 255, 0.4);
}

.form-container {
  display: flex;
  flex-direction: column;
  gap: 40rpx;
}

.input-group {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.label {
  font-size: 28rpx;
  color: rgba(255, 255, 255, 0.7);
  font-weight: 600;
  padding-left: 8rpx;
}

.textarea {
  width: 100%;
  height: 320rpx;
  padding: 24rpx;
  border-radius: 24rpx;
  font-size: 28rpx;
  box-sizing: border-box;
}

.input {
  width: 100%;
  height: 90rpx;
  padding: 0 24rpx;
  border-radius: 24rpx;
  font-size: 28rpx;
  box-sizing: border-box;
}

.word-count {
  font-size: 20rpx;
  color: rgba(255, 255, 255, 0.3);
  text-align: right;
  padding-right: 8rpx;
}

.submit-btn {
  margin-top: 40rpx;
  height: 100rpx;
  line-height: 100rpx;
  background: linear-gradient(135deg, #4a8db7, #357ca5);
  color: #fff;
  border-radius: 50rpx;
  font-size: 32rpx;
  font-weight: 700;
  border: none;
}

.submit-btn.disabled {
  opacity: 0.3;
}

.animate-fade-in {
  animation: fadeIn 0.6s ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(20rpx); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
