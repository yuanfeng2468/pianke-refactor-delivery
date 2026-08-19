import { generateId } from './index.js'

export const ADPID = {
  rewarded: '', 
  feed: '',
  interstitial: ''
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function showLoading() {
  if (typeof plus !== 'undefined' && plus.nativeUI) {
    plus.nativeUI.showWaiting('', { modal: true, back: 'transmit', padding: '10px' })
  }
}

function hideLoading() {
  if (typeof plus !== 'undefined' && plus.nativeUI) {
    plus.nativeUI.closeWaiting()
  }
}

export function getAdpid(store, type) {
  const val = store?.config?.[`adpid_${type}`] || ADPID[type]
  return String(typeof val === 'object' ? (val.value || val.config_value?.value || '') : (val || ''))
}

export function isAdEnabled(store, type) {
  const enabled = store?.config?.[`ad_enabled_${type}`]
  return enabled === undefined ? true : Boolean(enabled)
}

let _rewardedAd = null
let _isLoading = false

/**
 * 预加载激励视频广告
 */
export function preloadRewardedAd(store) {
  if (!isAdEnabled(store, 'rewarded') || _rewardedAd || _isLoading) return
  const adpid = getAdpid(store, 'rewarded')
  if (!adpid) return
  
  _isLoading = true
  _rewardedAd = uni.createRewardedVideoAd({ adpid: String(adpid) })
  _rewardedAd.onLoad(() => { _isLoading = false })
  _rewardedAd.onError(() => { _isLoading = false; _rewardedAd = null })
  _rewardedAd.load()
}

/**
 * 激励视频播放
 */
export async function playRewardedAd({ store, scene, rewardContext = {}, onRewarded }) {
  const allowedScenes = ['relax', 'coin_page_quick_earn']
  if (!allowedScenes.includes(scene)) throw new Error('该场景不支持获取奖励')
  if (!isAdEnabled(store, 'rewarded')) throw new Error('当前功能暂未开启')
  if (typeof store.ensureSessionReady === 'function') await store.ensureSessionReady()
  
  const adpid = getAdpid(store, 'rewarded')
  if (!adpid) throw new Error('广告位配置错误')

  showLoading()
  try {
    const transId = generateId(`reward_${scene}`)
    const orderRes = await store.invoke('createRewardOrder', { scene, adpid, reward_context: rewardContext, idempotency_key: transId })
    if (orderRes?.code !== 0) throw new Error(orderRes?.message || '订单创建失败')
    
    const orderId = orderRes.data.order_id
    
    // 实例化广告并配置回调；没有预加载实例时必须主动 load，否则首次点击会永久等待。
    const wasPreloaded = Boolean(_rewardedAd)
    const adInstance = _rewardedAd || uni.createRewardedVideoAd({ adpid: String(adpid) })
    adInstance.urlCallback = {
      userId: String(store.user._id),
      extra: JSON.stringify({ scene, order_id: orderId, request_id: transId })
    }

    return new Promise((resolve, reject) => {
      let settled = false
      const cleanup = () => {
        adInstance.offLoad()
        adInstance.offError()
        adInstance.offClose()
        hideLoading()
        _rewardedAd = null
        preloadRewardedAd(store)
      }

      const showAd = () => {
        hideLoading()
        adInstance.show().catch((error) => {
          cleanup()
          if (!settled) { settled = true; reject(error) }
        })
      }
      adInstance.onLoad(() => { _isLoading = false; showAd() })
      adInstance.onError((err) => {
        if (settled) return
        settled = true
        cleanup()
        reject(new Error(err.errMsg || '广告加载失败'))
      })
      adInstance.onClose(async (res) => {
        if (settled) return
        settled = true
        if (!res?.isEnded) {
          try {
            await store.invoke('cancelRewardOrder', { order_id: orderId, reason: 'middle_exit' })
          } catch (error) {
            console.warn('[ad] cancel order deferred', { user_id: store.user?._id || '', trace_id: orderId, error_stack: String(error?.stack || error?.message || error) })
          }
          cleanup()
          reject(new Error('完整观看视频才能获得奖励'))
          return
        }

        try {
          try {
            await store.invoke('reportAdCompleted', { order_id: orderId })
          } catch (error) {
            if ([401, 1403].includes(Number(error?.code))) {
              try {
                await store.ensureSessionReady()
                await store.invoke('reportAdCompleted', { order_id: orderId })
              } catch (retryError) {
                console.warn('[ad] completion report deferred', { user_id: store.user?._id || '', trace_id: orderId, error_stack: String(retryError?.stack || retryError?.message || retryError) })
              }
            } else {
              console.warn('[ad] completion report deferred', { user_id: store.user?._id || '', trace_id: orderId, error_stack: String(error?.stack || error?.message || error) })
            }
          }

          // 阶梯式轮询：服务端回调成功后才确认到账；超时进入延迟到账态。
          let rewardData = null
          const pollIntervals = [300, 500, 800, 1200, 1800, 2500]
          for (const ms of pollIntervals) {
            await wait(ms)
            let query = null
            try {
              query = await store.invoke('queryRewardOrder', { order_id: orderId })
            } catch (error) {
              console.warn('[ad] reward order query failed', { user_id: store.user?._id || '', trace_id: orderId, error_stack: String(error?.stack || error?.message || error) })
            }
            if (query?.data?.status === 'rewarded') {
              try {
                const refreshed = await store.getUserInfo({ force: true })
                rewardData = refreshed?.data || { user: store.user }
              } catch (error) {
                console.warn('[ad] rewarded asset refresh deferred', { user_id: store.user?._id || '', trace_id: orderId, error_stack: String(error?.stack || error?.message || error) })
                rewardData = { user: store.user, pending: true }
              }
              break
            }
            if (query?.data?.status === 'failed') {
              throw new Error(query?.data?.fail_reason || '广告订单已失败，奖励未发放')
            }
          }

          if (!rewardData) {
            // 超时未即时同步：不猜测已到账，提示用户进入恢复流程。
            let refreshed = null
            try { refreshed = await store.getUserInfo({ force: true }) } catch (error) {
              console.warn('[ad] pending asset refresh deferred', { user_id: store.user?._id || '', trace_id: orderId, error_stack: String(error?.stack || error?.message || error) })
            }
            rewardData = refreshed?.data || { user: store.user }
            rewardData.pending = true
          }

          try {
            if (onRewarded) await onRewarded(rewardData, { late: Boolean(rewardData.pending), meta: { late: Boolean(rewardData.pending), order_id: orderId } })
          } catch (error) {
            console.warn('[ad] reward UI callback failed', { user_id: store.user?._id || '', trace_id: orderId, error_stack: String(error?.stack || error?.message || error) })
          }
          cleanup()
          resolve(rewardData)
        } catch (error) {
          cleanup()
          reject(error)
        }
      })

      if (wasPreloaded) {
        if (!_isLoading) showAd()
      } else {
        _isLoading = true
        adInstance.load().catch((error) => {
          if (settled) return
          settled = true
          cleanup()
          reject(error)
        })
      }
    })
  } catch (e) {
    hideLoading()
    throw e
  }
}

/**
 * 检查并恢复待处理订单（仅限真正未完成发放且在合理时间窗口内的订单）
 */
export async function checkAndRecoverPendingOrder({ store }) {
  if (!store?.user?._id || !isAdEnabled(store, 'rewarded')) return
  try {
    const res = await store.invoke('queryRewardOrder', { uid: store.user._id, status: 'pending_recovery' })
    if (res?.data?.order_id && res.data.created_at && (Date.now() - res.data.created_at < 600000)) {
      // 订单在10分钟内创建且未完成，可尝试同步状态或提示用户
      const query = await store.invoke('queryRewardOrder', { order_id: res.data.order_id })
      if (query?.data?.status === 'rewarded') {
        uni.showToast({ title: '奖励已恢复', icon: 'success' })
        await store.getUserInfo({ force: true })
      }
    }
  } catch (error) {
    console.warn('[ad] pending-order recovery failed', { user_id: store.user?._id || '', trace_id: '', error_stack: String(error?.stack || error?.message || error) })
  }
}

export async function logAdEvent(store, { adpid, scene, eventType, eventId, status = 'success', transId = '', meta = {} }) {
  if (!store?.user?._id) return
  try {
    await store.invoke('logAdEvent', {
      uid: store.user._id, adpid, scene, event_type: eventType,
      event_id: eventId || generateId(`ad_${eventType}`),
      trans_id: transId, status, meta
    })
  } catch (error) {
    console.warn('[ad] ad event logging failed', { user_id: store.user?._id || '', trace_id: '', error_stack: String(error?.stack || error?.message || error) })
  }
}
