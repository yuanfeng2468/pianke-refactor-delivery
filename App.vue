<script setup>
import { onError, onLaunch, onShow, onHide } from '@dcloudio/uni-app'
import { useUserStore } from './store/user'
import { reportError, markPerf, measurePerf } from './utils/index'
import { checkAndRecoverPendingOrder, preloadRewardedAd } from './utils/ad'

onError((err) => {
  reportError(err, { scene: 'app_global' })
})

onLaunch(async () => {
  const privacyAgreed = await ensurePrivacyConsent()
  if (!privacyAgreed) {
    console.warn('[App] privacy consent not granted; initialization blocked')
    return
  }
  markPerf('app_launch_start')
  console.log('App Launch')
  console.log(`[App] 应用启动 (${getRuntimeVersion()}), 开始初始化流程`)
  
  // 初始化用户数据
  const userStore = useUserStore()
  console.log('[App] 调用 userStore.initUser()...')
  let initResult = await userStore.initUser()
  console.log('[App] initUser 返回结果:', initResult)
  
  // 增加启动重试机制：若首次初始化失败且不是用户主动取消，则尝试静默重试一次
  if (!initResult.success && initResult.code !== 'USER_CANCEL') {
    console.log('[App] 首次初始化失败，尝试静默重试...')
    await new Promise(resolve => setTimeout(resolve, 1000))
    initResult = await userStore.initUser()
  }
  
  if (!initResult.success) {
    console.warn('[App] initUser 最终失败:', initResult.message)
    uni.showToast({ title: '网络连接较弱，部分功能受限', icon: 'none' })
  }
  
  // 恢复未完成的广告订单并预加载广告
  if (initResult.success) {
    checkAndRecoverPendingOrder({ store: userStore })
    preloadRewardedAd(userStore)
  }

  // 检查用户激活状态
  checkActivationStatus(userStore)
  
  // 配置全局音频设置
  configureGlobalAudio()
  
  // 检查版本更新
  checkAppUpdate()
  
  markPerf('app_launch_end')
  measurePerf('app_launch_start', 'app_launch_end')
})

onShow(() => {
  console.log('App Show')
  const userStore = useUserStore()
  if (userStore.user && userStore.user._id) {
    // 每次切回前台时同步一次，但为了防止覆盖刚刚领取的奖励，这里可以稍微延迟
    setTimeout(() => {
      userStore.getUserInfo().then(res => {
        if (res.success) {
          checkActivationStatus(userStore)
          checkAndRecoverPendingOrder({ store: userStore })
        }
      }).catch(err => console.error('[App] onShow 同步用户信息失败:', err))
    }, 1000)
  }
})

onHide(() => {
  console.log('App Hide')
})

/**
 * 检查用户激活状态
 */
function checkActivationStatus(userStore) {
  if (!userStore || !userStore.user) return
  const activationStatus = userStore.user.activation_status || 'pending'
  
  console.log('[App] 用户激活状态校验:', activationStatus)
  
  const pages = getCurrentPages()
  const currentPage = pages.length > 0 ? pages[pages.length - 1].route : ''
  console.log('[App] 当前页面路由:', currentPage)
  
  if (activationStatus !== 'activated') {
    if (currentPage !== 'pages/activate/activate') {
      setTimeout(() => {
        uni.reLaunch({
          url: '/pages/activate/activate'
        })
      }, 200)
    }
  } else {
    if (currentPage === 'pages/activate/activate') {
      setTimeout(() => {
        uni.switchTab({
          url: '/pages/coin/coin'
        })
      }, 200)
    }
  }
}

let privacyPromptVisible = false
function ensurePrivacyConsent() {
  if (uni.getStorageSync('pianke_privacy_agreed')) return Promise.resolve(true)
  if (privacyPromptVisible) return Promise.resolve(false)
  privacyPromptVisible = true
  return new Promise((resolve) => {
    uni.showModal({
      title: '隐私政策',
      content: '欢迎使用片刻。我们非常重视您的个人信息和隐私保护。在使用前，请您务必审慎阅读《隐私政策》及《服务协议》全部条款。',
      confirmText: '同意并继续',
      cancelText: '不同意',
      success: (res) => {
        privacyPromptVisible = false
        if (res.confirm) {
          uni.setStorageSync('pianke_privacy_agreed', true)
          resolve(true)
          return
        }
        uni.showModal({
          title: '提示',
          content: '我们需要您的授权才能提供完整服务。',
          confirmText: '去同意',
          cancelText: '退出应用',
          success: (retryRes) => {
            if (retryRes.confirm) {
              ensurePrivacyConsent().then(resolve)
            } else {
              resolve(false)
              // #ifdef APP-PLUS
              plus.runtime.quit()
              // #endif
            }
          },
          fail: () => resolve(false)
        })
      },
      fail: () => {
        privacyPromptVisible = false
        resolve(false)
      }
    })
  })
}

function getRuntimeVersion() {
  try {
    const systemInfo = uni.getSystemInfoSync ? uni.getSystemInfoSync() : {}
    const version = String(systemInfo.appVersion || systemInfo.appWgtVersion || '').trim()
    return version ? `v${version}` : '运行时版本未知'
  } catch (_) {
    return '运行时版本未知'
  }
}

function checkAppUpdate() {
  console.log(`[App] 当前版本: ${getRuntimeVersion()}`)
}

function configureGlobalAudio() {
  console.log('全局音频配置完成')
}
</script>

<style>
page {
  background-color: #0d0d1a;
  color: rgba(255, 255, 255, 0.85);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB',
    'Microsoft YaHei', 'Helvetica Neue', Helvetica, Arial, sans-serif;
  font-size: 28rpx;
  line-height: 1.6;
  box-sizing: border-box;
}

.glass {
  background-color: rgba(255, 255, 255, 0.06);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1rpx solid rgba(255, 255, 255, 0.08);
}

.glass-strong {
  background-color: rgba(255, 255, 255, 0.09);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border: 1rpx solid rgba(255, 255, 255, 0.12);
}

.color-primary { color: #4a8db7; }
.color-accent { color: #d9b450; }
.text-primary { color: rgba(255, 255, 255, 0.85); }
.text-secondary { color: rgba(255, 255, 255, 0.5); }
.text-muted { color: rgba(255, 255, 255, 0.25); }

@keyframes breathe {
  0% { box-shadow: 0 0 16rpx rgba(217, 180, 80, 0.2), 0 0 32rpx rgba(217, 180, 80, 0.08); }
  100% { box-shadow: 0 0 40rpx rgba(217, 180, 80, 0.4), 0 0 80rpx rgba(217, 180, 80, 0.15); }
}

.breathing-light { animation: breathe 2.5s infinite alternate ease-in-out; }

@keyframes flashAmber {
  0% { background-color: rgba(217, 180, 80, 0.3); transform: scale(1.02); }
  100% { background-color: rgba(255, 255, 255, 0.06); transform: scale(1); }
}

.flash-amber { animation: flashAmber 1.2s ease-out; }
.tabular-nums { font-variant-numeric: tabular-nums; }
.font-serif { font-family: 'STSongti-SC-Regular', 'Songti SC', 'SimSun', serif; }
.safe-bottom { padding-bottom: env(safe-area-inset-bottom); }
</style>
