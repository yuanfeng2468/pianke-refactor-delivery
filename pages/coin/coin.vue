<template>
  <view class="coin-page">
    <view class="background-gradient" />
    <view class="ambient-glow" />

    <view class="top-asset-card">
      <view class="asset-row">
        <view class="asset-item" @click="syncAssets">
          <text class="asset-label">金币余额</text>
          <text class="asset-value gold">{{ user.gold_balance || 0 }}</text>
        </view>
        <view class="asset-divider" />
        <view class="asset-item" @click="syncAssets">
          <text class="asset-label">放松时间</text>
          <text class="asset-value">{{ userStore.formattedRelaxTime }}</text>
        </view>
        <view class="asset-divider" />
        <view class="asset-item" @click="syncAssets">
          <text class="asset-label">今日进度</text>
          <text class="asset-value">{{ user.daily_ad_count || 0 }}/{{ userStore.dailyAdLimit }}</text>
        </view>
      </view>
      <view class="progress-track"><view class="progress-fill" :style="{ width: `${userStore.adProgress}%` }" /></view>
      <view class="quick-earn-btn" :class="{ disabled: rewardLoading || !isAdEnabled(userStore, 'rewarded') }" @click="handleQuickEarn">
        <text class="quick-earn-text">
          <template v-if="!isAdEnabled(userStore, 'rewarded')">功能维护中</template>
          <template v-else-if="rewardLoading">广告准备中...</template>
          <template v-else>快速赚金币 · 完整观看获取金币与放松时间奖励</template>
        </text>
      </view>
    </view>

    <!-- 每日签到 -->
    <view class="checkin-card glass animate-fade-in">
      <view class="checkin-header">
        <view class="checkin-info">
          <text class="checkin-title">每日签到</text>
          <text class="checkin-desc">已连续签到 {{ userStore.user.continuous_checkin || 0 }} 天</text>
        </view>
        <button 
          class="checkin-btn" 
          :class="{ 'btn-disabled': userStore.isTodayCheckedIn || checkInLoading }"
          :disabled="userStore.isTodayCheckedIn || checkInLoading"
          @tap="handleCheckIn"
        >
          {{ userStore.isTodayCheckedIn ? '今日已领' : (checkInLoading ? '签到中...' : '立即签到') }}
        </button>
      </view>
      <view class="checkin-days">
        <view 
          v-for="day in 7" 
          :key="day" 
          class="day-item"
          :class="{ 'day-active': day <= (userStore.user.continuous_checkin || 0), 'day-today': day === ((userStore.user.continuous_checkin || 0) % 7) + 1 && !userStore.isTodayCheckedIn }"
        >
          <text class="day-gold">+{{ [10, 20, 30, 50, 80, 100, 200][day-1] }}</text>
          <view class="day-dot" />
          <text class="day-label">{{ day }}天</text>
        </view>
      </view>
    </view>

    <scroll-view
      scroll-y
      class="feed-scroll-container"
      :refresher-enabled="true"
      :refresher-triggered="isRefreshing"
      @refresherrefresh="onPullRefresh"
      @scrolltolower="loadMoreFeed"
    >
      <view class="feed-list">
        <view v-for="item in feedItems" :key="item.id" class="feed-card" @click="handleAdClick(item)">
          <view v-if="!item.mediaFailed && item.mediaType === 'image' && item.imageUrl" class="ad-media-frame" :style="mediaStyle(item)">
            <image class="ad-image" :src="item.imageUrl" mode="aspectFill" @error="onMediaError(item, $event)" />
          </view>
          <view v-else-if="!item.mediaFailed && item.mediaType === 'video' && item.videoUrl" class="ad-media-frame" :style="mediaStyle(item)">
            <video class="ad-video" :src="item.videoUrl" :show-center-play-btn="true" :controls="true" @error="onMediaError(item, $event)" />
          </view>
          <!-- #ifdef APP-PLUS || MP-WEIXIN -->
          <ad
            v-else-if="!item.mediaFailed && item.mediaType === 'native'"
            :adpid="item.adpid"
            class="native-ad"
            @load="onAdLoad(item)"
            @error="onAdError(item, $event)"
            @close="onAdClose(item)"
          />
          <!-- #endif -->
          <view class="ad-copy">
            <view class="card-header">
              <text class="card-title">{{ item.title }}</text>
              <text class="ad-tag">广告内容</text>
            </view>
            <text class="card-desc">{{ item.description }}</text>
          </view>
          <view class="card-footer">
            <text class="ad-reward-tip">{{ item.rewarded ? '已获得 +1 分钟放松时长' : item.started ? `已停留 ${item.displaySeconds} 秒，满 ${requiredExposureSeconds} 秒自动领取` : '进入卡片后开始服务端计时' }}</text>
            <view class="ad-progress-bar"><view :style="{ width: `${Math.min(100, item.displaySeconds / requiredExposureSeconds * 100)}%` }" /></view>
          </view>
        </view>
        <view v-if="isLoadingMore" class="loading-more">正在加载更多内容…</view>
        <view v-if="!feedItems.length" class="empty-state">暂无可展示内容，请稍后重试</view>
      </view>
    </scroll-view>
  </view>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { onShow, onHide } from '@dcloudio/uni-app'
import { useUserStore } from '@/store/user.js'
import { generateId } from '@/utils/index.js'
import { ADPID, logAdEvent, playRewardedAd, getAdpid, isAdEnabled } from '@/utils/ad.js'
import { feedDebug, feedDebugError } from '@/utils/feed-debug.js'

const userStore = useUserStore()
const user = computed(() => userStore.user || {})
const feedItems = ref([])
const isRefreshing = ref(false)
const isLoadingMore = ref(false)
const rewardLoading = ref(false)
const checkInLoading = ref(false)
const isPageActive = ref(false)
const activeExposure = ref(null)
const currentPage = ref(0)
const hasMore = ref(true)
const requiredExposureSeconds = computed(() => Math.max(60, Math.ceil(Number(userStore.config.feed_exposure_min_ms || 60000) / 1000)))
let exposureTimer = null
let autoLoadTimer = null
let emptyRetryTimer = null
let interstitialAd = null
let _interstitialTimer = null
let _adLoading = false
let feedInitStarted = false
let feedInitialized = false
let hasShownOnce = false

function normalizeFeedItem(ad) {
  return {
    id: String(ad.id),
    title: String(ad.title || ''),
    description: String(ad.description || ''),
    adpid: String(ad.adpid || ''),
    slotId: String(ad.slotId || ad.slot_id || ''),
    sessionId: String(ad.sessionId || ad.session_id || ''),
    imageUrl: String(ad.imageUrl || ''),
    videoUrl: String(ad.videoUrl || ''),
    landingUrl: String(ad.landingUrl || ''),
    mediaType: ['native', 'image', 'video', 'text'].includes(ad.mediaType) ? ad.mediaType : 'text',
    aspectRatio: Number(ad.aspectRatio) >= 0.25 && Number(ad.aspectRatio) <= 4 ? Number(ad.aspectRatio) : 1.7778,
    started: false,
    rewarded: false,
    claiming: false,
    closed: false,
    displaySeconds: 0,
    eventId: generateId('feed_event')
  }
}

async function fetchAdList(page) {
  feedDebug('request:start', { page, pageSize: 1, active: isPageActive.value })
  try {
    const response = await userStore.invoke('getFeedAds', {
      uid: user.value._id,
      page,
      pageSize: 1
    })
    const payload = response.data || {}
    const ads = Array.isArray(payload.ads) ? payload.ads : []
    feedDebug('request:success', { page, received: ads.length, hasMore: payload.hasMore === true, code: response.code })
    return { ads: ads.map(normalizeFeedItem), hasMore: payload.hasMore === true }
  } catch (error) {
    feedDebugError('request:failed', error, { page })
    await logAdEvent(userStore, {
      adpid: getAdpid(userStore, 'feed'),
      scene: 'coin_page_feed',
      eventType: 'error',
      eventId: generateId('feed_fetch_error'),
      transId: generateId('feed_fetch'),
      status: 'failed',
      meta: { page, message: error.message || 'getFeedAds failed' }
    })
    return { ads: [], hasMore: true, failed: true }
  }
}

async function initFeedList() {
  if (!isAdEnabled(userStore, 'feed')) {
    feedItems.value = []
    feedInitialized = true
    return
  }
  if (feedInitialized && !isPageActive.value) return
  stopEmptyRetryLoop()
  feedDebug('list:init', { previousCount: feedItems.value.length, currentPage: currentPage.value })
  await closeExposure(activeExposure.value)
  feedItems.value = []
  activeExposure.value = null
  currentPage.value = 0
  hasMore.value = true
  const result = await fetchAdList(1)
  if (result.failed) {
    scheduleEmptyRetry()
    return
  }
  feedItems.value = result.ads
  currentPage.value = 1
  hasMore.value = result.hasMore
  feedInitialized = true
  feedDebug('list:initialized', { count: feedItems.value.length, currentPage: currentPage.value, hasMore: hasMore.value })
  if (feedItems.value.length) {
    stopEmptyRetryLoop()
    if (isPageActive.value && !activeExposure.value) void startNextExposure()
  } else {
    scheduleEmptyRetry()
  }
}

onMounted(async () => {
  try {
    if (typeof userStore.ensureSessionReady === 'function') {
      await userStore.ensureSessionReady()
    }
    await userStore.getUserInfo()
  } catch (e) {
    console.error('[coin] session initialization failed', e)
  }
  if (!feedInitStarted) {
    feedInitStarted = true
    await initFeedList()
  } else {
    feedDebug('list:init-skipped', { reason: 'already-started-by-show' })
  }
  preloadInterstitialAd()
})

onShow(() => {
  const firstShow = !hasShownOnce
  hasShownOnce = true
  isPageActive.value = true
  feedDebug('lifecycle:show', { count: feedItems.value.length, currentPage: currentPage.value, hasMore: hasMore.value, firstShow })
  void userStore.getUserInfo()
  startExposureLoop()
  startAutoLoadLoop()
  if (!feedInitStarted || (!firstShow && (!feedItems.value.length || !hasMore.value))) {
    feedInitStarted = true
    void initFeedList()
  } else if (!activeExposure.value) void startNextExposure()
  
  // 逻辑复用：显示插屏广告定时器
  startInterstitialTimer()
})

onHide(() => {
  feedDebug('lifecycle:hide', { count: feedItems.value.length, activeExposure: Boolean(activeExposure.value) })
  isPageActive.value = false
  stopExposureLoop()
  stopAutoLoadLoop()
  stopEmptyRetryLoop()
  void closeExposure(activeExposure.value)
  
  // 逻辑复用：停止插屏广告定时器
  stopInterstitialTimer()
})

onUnmounted(() => {
  feedDebug('lifecycle:unmounted', { count: feedItems.value.length, activeExposure: Boolean(activeExposure.value) })
  isPageActive.value = false
  stopExposureLoop()
  stopAutoLoadLoop()
  stopEmptyRetryLoop()
  void closeExposure(activeExposure.value)
  
  // 逻辑复用：停止插屏广告定时器
  stopInterstitialTimer()
})

function startExposureLoop() {
  if (exposureTimer) return
  exposureTimer = setInterval(() => {
    if (!isPageActive.value) return
    const item = activeExposure.value
    if (!item || item.rewarded) return
    item.displaySeconds += 1
    if (item.displaySeconds >= requiredExposureSeconds.value) void claimExposure(item)
  }, 1000)
}

function stopExposureLoop() {
  if (exposureTimer) clearInterval(exposureTimer)
  exposureTimer = null
}

async function startNextExposure() {
  if (!isPageActive.value || activeExposure.value) return
  const item = feedItems.value.find((candidate) => !candidate.rewarded && !candidate.started)
  if (!item) {
    feedDebug('exposure:none-available', { count: feedItems.value.length })
    return
  }
  feedDebug('exposure:start-request', { itemId: item.id, adpid: item.adpid, slotId: item.slotId })
  try {
    const response = await userStore.invoke('claimFeedExposure', {
      uid: user.value._id,
      action: 'start',
      session_id: item.sessionId,
      slot_id: item.slotId,
      adpid: item.adpid || getAdpid(userStore, 'feed'),
      scene: 'coin_page_feed'
    })
    item.started = response.data?.status === 'active' || response.data?.status === 'started'
    activeExposure.value = item.started ? item : null
    feedDebug('exposure:started', { itemId: item.id, started: item.started, sessionId: item.sessionId })
    await logAdEvent(userStore, { adpid: getAdpid(userStore, 'feed'), scene: 'coin_page_feed', eventType: 'show', eventId: `${item.eventId}_show`, transId: item.sessionId })
  } catch (error) {
    feedDebugError('exposure:start-failed', error, { itemId: item.id, slotId: item.slotId })
    await logAdEvent(userStore, { adpid: getAdpid(userStore, 'feed'), scene: 'coin_page_feed', eventType: 'error', eventId: `${item.eventId}_start_error`, transId: item.sessionId, status: 'failed', meta: { message: error.message } })
  }
}

async function claimExposure(item) {
  if (!item || item.rewarded || item.claiming) return
  item.claiming = true
  feedDebug('exposure:claim-request', { itemId: item.id, displaySeconds: item.displaySeconds, requiredSeconds: requiredExposureSeconds.value })
  try {
    const response = await userStore.invoke('claimFeedExposure', {
      uid: user.value._id,
      action: 'claim',
      session_id: item.sessionId,
      slot_id: item.slotId,
      adpid: item.adpid || getAdpid(userStore, 'feed'),
      scene: 'coin_page_feed'
    })
    if (response.data?.status === 'rewarded') {
      item.rewarded = true
      feedDebug('exposure:rewarded', { itemId: item.id, rewardTime: response.data.reward_time })
      userStore.emitAsset(response.data)
      await logAdEvent(userStore, { adpid: getAdpid(userStore, 'feed'), scene: 'coin_page_feed', eventType: 'exposure_rewarded', eventId: `${item.eventId}_rewarded`, transId: item.sessionId, meta: { reward_time: response.data.reward_time } })
      uni.showToast({ title: `停留达标，已获得 ${response.data.reward_gold} 金币与 1 分钟时长`, icon: 'success' })
      activeExposure.value = null
      void startNextExposure()
    }
  } catch (error) {
    feedDebugError('exposure:claim-failed', error, { itemId: item.id, displaySeconds: item.displaySeconds })
    await logAdEvent(userStore, { adpid: getAdpid(userStore, 'feed'), scene: 'coin_page_feed', eventType: 'reward_fail', eventId: `${item.eventId}_reward_fail`, transId: item.sessionId, status: 'failed', meta: { message: error.message } })
  } finally {
    item.claiming = false
  }
}

async function closeExposure(item) {
  if (!item || !item.started || item.rewarded || item.closed) return
  item.closed = true
  feedDebug('exposure:close-request', { itemId: item.id, displaySeconds: item.displaySeconds })
  try {
    await userStore.invoke('claimFeedExposure', {
      uid: user.value._id,
      action: 'close',
      session_id: item.sessionId,
      slot_id: item.slotId,
      adpid: item.adpid || getAdpid(userStore, 'feed'),
      scene: 'coin_page_feed'
    })
    await logAdEvent(userStore, { adpid: item.adpid || getAdpid(userStore, 'feed'), scene: 'coin_page_feed', eventType: 'close', eventId: `${item.eventId}_close`, transId: item.sessionId })
  } catch (error) {
    await logAdEvent(userStore, { adpid: getAdpid(userStore, 'feed'), scene: 'coin_page_feed', eventType: 'error', eventId: `${item.eventId}_close_error`, transId: item.sessionId, status: 'failed', meta: { message: error.message } })
  } finally {
    if (activeExposure.value === item) activeExposure.value = null
  }
}

async function handleQuickEarn() {
  if (rewardLoading.value || !isAdEnabled(userStore, 'rewarded')) return
  if (user.value.activation_status !== 'activated') {
    uni.showToast({ title: '请先完成账户激活', icon: 'none' })
    return
  }
  
  // 增加震动反馈
  try { uni.vibrateShort({ type: 'medium' }) } catch (error) { console.warn('[coin] vibration failed', { user_id: userStore.user?._id || '', trace_id: '', error_stack: String(error?.stack || error?.message || error) }) }
  
  rewardLoading.value = true
  try {
    const result = await playRewardedAd({
      store: userStore,
      scene: 'coin_page_quick_earn',
      onRewarded: (_reward, meta = {}) => {
        if (!meta.late) return
        uni.showToast({ title: '奖励已到账', icon: 'success' })
        void userStore.getUserInfo({ force: true })
      }
    })
    if (result?.pending) {
      uni.showToast({ title: '广告已完成，奖励正在核验，请稍后刷新', icon: 'none', duration: 2500 })
      return
    }
    uni.showToast({ title: '奖励已到账', icon: 'success' })
    // 奖励到账后刷新用户信息
    void userStore.getUserInfo({ force: true })
  } catch (error) {
    uni.showToast({ title: error.message || '广告未完成，未发放奖励', icon: 'none' })
  } finally {
    rewardLoading.value = false
  }
}

async function syncAssets() {
  if (userStore.isLoading) return
  try { uni.vibrateShort({ type: 'light' }) } catch (error) { console.warn('[coin] vibration failed', { user_id: userStore.user?._id || '', trace_id: '', error_stack: String(error?.stack || error?.message || error) }) }
  const result = await userStore.getUserInfo()
  uni.showToast({ title: result.success ? '数据已同步' : '同步失败', icon: result.success ? 'success' : 'none' })
}

/**
 * 处理签到
 */
const handleCheckIn = async () => {
  if (userStore.isTodayCheckedIn || checkInLoading.value) return

  checkInLoading.value = true
  try {
    if (!userStore.initialized || !userStore.user?._id) {
      const initResult = await userStore.initUser()
      if (!initResult?.success || !userStore.user?._id) {
        throw new Error(initResult?.message || '用户初始化未完成')
      }
    }
    uni.showLoading({ title: '签到中...' })
    vibrate()
    const res = await userStore.checkIn()
    uni.hideLoading()
    
    if (res.success) {
      uni.showToast({ title: res.message, icon: 'success' })
      vibrate()
    } else {
      uni.showToast({ title: res.message, icon: 'none' })
    }
  } catch (e) {
    uni.hideLoading()
    uni.showToast({ title: e.message || '签到失败，请重试', icon: 'none' })
  } finally {
    checkInLoading.value = false
  }
}

function vibrate() {
  try { uni.vibrateShort({ type: 'medium' }) } catch (error) { console.warn('[coin] vibration failed', { user_id: userStore.user?._id || '', trace_id: '', error_stack: String(error?.stack || error?.message || error) }) }
}

async function onPullRefresh() {
  if (isRefreshing.value) return
  isRefreshing.value = true
  try {
    await Promise.allSettled([
      initFeedList(),
      userStore.getUserInfo()
    ])
    uni.showToast({ title: '数据已同步', icon: 'none' })
  } finally {
    isRefreshing.value = false
  }
}

async function loadMoreFeed() {
  if (!isPageActive.value || isLoadingMore.value || !hasMore.value) return
  isLoadingMore.value = true
  feedDebug('pagination:start', { nextPage: currentPage.value + 1 || 1, currentCount: feedItems.value.length, trigger: 'scroll-or-timer' })
  try {
    const nextPage = currentPage.value + 1 || 1
    const result = await fetchAdList(nextPage)
    if (result.failed) return
    if (result.ads.length) {
      const existingIds = new Set(feedItems.value.map((item) => item.id))
      const newAds = result.ads.filter((item) => !existingIds.has(item.id))
      feedItems.value.push(...newAds)
      currentPage.value = nextPage
      feedDebug('pagination:appended', { page: nextPage, received: result.ads.length, appended: newAds.length, total: feedItems.value.length })
    }
    hasMore.value = result.hasMore && result.ads.length > 0
    feedDebug('pagination:complete', { page: nextPage, total: feedItems.value.length, hasMore: hasMore.value })
    if (!activeExposure.value) void startNextExposure()
  } finally {
    isLoadingMore.value = false
  }
}

function startAutoLoadLoop() {
  stopAutoLoadLoop()
  feedDebug('pagination:timer-start', { intervalMs: 10000 })
  const tick = async () => {
    if (!isPageActive.value) return
    if (!isLoadingMore.value && hasMore.value && feedItems.value.length) await loadMoreFeed()
    autoLoadTimer = setTimeout(tick, 10000)
  }
  autoLoadTimer = setTimeout(tick, 10000)
}

function stopAutoLoadLoop() {
  if (autoLoadTimer) feedDebug('pagination:timer-stop', {})
  if (autoLoadTimer) clearTimeout(autoLoadTimer)
  autoLoadTimer = null
}

function scheduleEmptyRetry() {
  if (emptyRetryTimer || !isPageActive.value || feedItems.value.length) return
  const retryDelayMs = 15000
  feedDebug('empty-retry:schedule', { delayMs: retryDelayMs })
  emptyRetryTimer = setTimeout(async () => {
    emptyRetryTimer = null
    if (!isPageActive.value || feedItems.value.length) return
    feedDebug('empty-retry:start', { page: 1 })
    await initFeedList()
  }, retryDelayMs)
}

function stopEmptyRetryLoop() {
  if (emptyRetryTimer) feedDebug('empty-retry:stop', {})
  if (emptyRetryTimer) clearTimeout(emptyRetryTimer)
  emptyRetryTimer = null
}

function mediaStyle(item) {
  return { aspectRatio: String(item.aspectRatio || 1.7778) }
}

function handleAdClick(item) {
  void logAdEvent(userStore, { adpid: item.adpid || getAdpid(userStore, 'feed'), scene: 'coin_page_feed', eventType: 'click', eventId: `${item.eventId}_click`, transId: item.sessionId })
  if (item.landingUrl && typeof uni.openURL === 'function') uni.openURL({ url: item.landingUrl })
}

function onMediaError(item, error) {
  item.mediaFailed = true
  feedDebugError('media:error', error, { itemId: item.id, mediaType: item.mediaType })
  void logAdEvent(userStore, { adpid: item.adpid || getAdpid(userStore, 'feed'), scene: 'coin_page_feed', eventType: 'error', eventId: `${item.eventId}_media_error`, transId: item.sessionId, status: 'failed', meta: { message: error?.detail?.errMsg || 'media error' } })
}

function onAdLoad(item) {
  feedDebug('native-ad:loaded', { itemId: item.id, adpid: item.adpid, slotId: item.slotId })
  void logAdEvent(userStore, { adpid: item.adpid || getAdpid(userStore, 'feed'), scene: 'coin_page_feed', eventType: 'fill', eventId: `${item.eventId}_fill`, transId: item.sessionId })
}

function onAdClose(item) {
  feedDebug('native-ad:closed', { itemId: item.id, adpid: item.adpid })
  void logAdEvent(userStore, { adpid: item.adpid || getAdpid(userStore, 'feed'), scene: 'coin_page_feed', eventType: 'close', eventId: `${item.eventId}_native_close`, transId: item.sessionId })
}

function onAdError(item, error) {
  feedDebugError('native-ad:error', error, { itemId: item.id, adpid: item.adpid, slotId: item.slotId })
  void logAdEvent(userStore, { adpid: item.adpid || getAdpid(userStore, 'feed'), scene: 'coin_page_feed', eventType: 'error', eventId: `${item.eventId}_native_error`, transId: item.sessionId, status: 'failed', meta: { message: error?.detail?.errMsg || '' } })
}

function preloadInterstitialAd() {
  if (typeof uni.createInterstitialAd !== 'function') return
  try {
    const adpid = getAdpid(userStore, 'interstitial')
    interstitialAd = uni.createInterstitialAd({ adpid })
    interstitialAd.load().catch((error) => console.warn('[coin] interstitial preload failed', { user_id: userStore.user?._id || '', trace_id: '', error_stack: String(error?.stack || error?.message || error) }))
  } catch (error) {
    interstitialAd = null
  }
}

/**
 * 逻辑复用：网赚游戏插屏广告定时器逻辑
 */
function startInterstitialTimer() {
  stopInterstitialTimer()
  _interstitialTimer = setInterval(() => {
    showInterstitialAd()
  }, 1000 * 60 * 2) // 2分钟展示一次
}

function stopInterstitialTimer() {
  if (_interstitialTimer) {
    clearInterval(_interstitialTimer)
    _interstitialTimer = null
  }
}

async function showInterstitialAd() {
  if (!isAdEnabled(userStore, 'interstitial')) return
  if (_adLoading) return

  try {
    // 逻辑复用：网赚游戏插屏不带复杂场景校验，但保持 Pianke 的频控接口调用以确保合规
    const response = await userStore.invoke('checkInterstitialAdFrequency', {
      uid: user.value._id,
      scene: 'interstitial_exit_coin', // 复用现有场景名
      request_id: generateId('interstitial_check')
    })
    if (!response.data?.can_show) return

    const adpid = getAdpid(userStore, 'interstitial')
    if (!interstitialAd && typeof uni.createInterstitialAd === 'function') {
      interstitialAd = uni.createInterstitialAd({ adpid })
    }
    
    if (!interstitialAd) return

    _adLoading = true
    await interstitialAd.load().catch((error) => { console.warn('[coin] interstitial load failed', { user_id: userStore.user?._id || '', trace_id: '', error_stack: String(error?.stack || error?.message || error) }); throw error })
    await interstitialAd.show()
    _adLoading = false
  } catch (error) {
    _adLoading = false
    console.warn('[ad-interstitial] show failed', error.message)
  }
}
</script>

<style scoped>
.coin-page { display:flex; flex-direction:column; height:100vh; overflow:hidden; background:#0b0b16; position:relative; color:#fff; }
.background-gradient { position:absolute; inset:0 0 auto; height:520rpx; background:radial-gradient(circle at 50% 0,rgba(74,141,183,.28),transparent 70%); pointer-events:none; }
.ambient-glow { position:absolute; inset:auto 0 0; height:300rpx; background:radial-gradient(circle at 50% 100%,rgba(217,180,80,.12),transparent 70%); pointer-events:none; }
.top-asset-card { position:relative; z-index:2; margin:24rpx 24rpx 0; padding:28rpx 24rpx 24rpx; border:1rpx solid rgba(217,180,80,.35); border-radius:28rpx; background:rgba(26,26,46,.9); box-shadow:0 12rpx 40rpx rgba(0,0,0,.35); backdrop-filter:blur(24px); }

/* 签到卡片样式 */
.checkin-card { position:relative; z-index:2; margin:24rpx; padding:32rpx; border-radius:32rpx; }
.checkin-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:32rpx; }
.checkin-title { font-size:32rpx; font-weight:600; color:#fff; display:block; }
.checkin-desc { font-size:24rpx; color:rgba(255,255,255,0.5); margin-top:4rpx; }
.checkin-btn { margin:0; padding:0 32rpx; height:64rpx; line-height:64rpx; font-size:26rpx; background:linear-gradient(135deg,#4a8db7,#357ca5); color:#fff; border-radius:32rpx; }
.btn-disabled { background:rgba(255,255,255,0.1) !important; color:rgba(255,255,255,0.3) !important; }
.checkin-days { display:flex; justify-content:space-between; }
.day-item { display:flex; flex-direction:column; align-items:center; gap:12rpx; opacity:0.4; transition:all 0.3s ease; }
.day-active { opacity:1; }
.day-active .day-gold { color:#d9b450; }
.day-active .day-dot { background-color:#d9b450; box-shadow:0 0 12rpx rgba(217,180,80,0.5); }
.day-today { opacity:0.8; transform:scale(1.1); }
.day-gold { font-size:20rpx; color:rgba(255,255,255,0.6); font-weight:600; }
.day-dot { width:12rpx; height:12rpx; border-radius:50%; background-color:rgba(255,255,255,0.2); }
.day-label { font-size:18rpx; color:rgba(255,255,255,0.4); }

.asset-row { display:flex; align-items:center; justify-content:space-between; margin-bottom:20rpx; }
.asset-item { flex:1; display:flex; flex-direction:column; align-items:center; gap:8rpx; }
.asset-divider { width:1rpx; height:60rpx; background:rgba(255,255,255,.14); }
.asset-label { color:rgba(255,255,255,.56); font-size:22rpx; }
.asset-value { color:#b8e8ff; font-size:34rpx; font-weight:700; }
.asset-value.gold { color:#e6c66d; }
.progress-track { height:8rpx; overflow:hidden; border-radius:99rpx; background:rgba(255,255,255,.12); }
.progress-fill { height:100%; border-radius:99rpx; background:linear-gradient(90deg,#d9b450,#f4dc8a); transition:width .3s; }
.quick-earn-btn { margin-top:24rpx; padding:23rpx 20rpx; border-radius:999rpx; text-align:center; background:linear-gradient(135deg,#d9b450,#e6c66d); box-shadow:0 8rpx 24rpx rgba(217,180,80,.28); }
.quick-earn-btn.disabled { opacity:.5; }
.quick-earn-text { color:#0d0d1a; font-size:27rpx; font-weight:700; }
.feed-scroll-container { position:relative; z-index:2; flex:1; min-height:0; }
.feed-list { padding:12rpx 24rpx calc(40rpx + env(safe-area-inset-bottom)); }
.feed-card { margin-bottom:24rpx; padding:0; overflow:hidden; border:1rpx solid rgba(255,255,255,.1); border-radius:28rpx; background:linear-gradient(160deg,rgba(35,35,58,.96),rgba(20,20,36,.94)); box-shadow:0 12rpx 32rpx rgba(0,0,0,.24); }
.ad-media-frame { width:100%; overflow:hidden; background:linear-gradient(135deg,rgba(74,141,183,.18),rgba(217,180,80,.12)); }
.ad-image,.ad-video { display:block; width:100%; height:100%; }
.native-ad { display:block; width:100%; min-height:180rpx; background:rgba(255,255,255,.04); }
.ad-copy { padding:24rpx 26rpx 18rpx; }
.card-header { display:flex; align-items:flex-start; justify-content:space-between; gap:18rpx; }
.card-title { flex:1; color:#fff; font-size:31rpx; font-weight:700; line-height:1.4; }
.ad-tag { flex-shrink:0; padding:6rpx 12rpx; border-radius:999rpx; color:#e6c66d; background:rgba(230,198,109,.12); font-size:19rpx; }
.card-desc { display:block; margin-top:14rpx; color:rgba(255,255,255,.62); font-size:24rpx; line-height:1.65; }
.card-footer { margin:0 26rpx 26rpx; padding-top:18rpx; border-top:1rpx solid rgba(255,255,255,.08); }
.ad-reward-tip { display:block; margin-bottom:12rpx; color:rgba(255,255,255,.52); font-size:22rpx; }
.ad-progress-bar { height:8rpx; overflow:hidden; border-radius:99rpx; background:rgba(255,255,255,.1); }
.ad-progress-bar view { height:100%; border-radius:99rpx; background:#8ec5df; transition:width .3s; }
.loading-more,.empty-state { padding:44rpx 0; text-align:center; color:rgba(255,255,255,.42); font-size:24rpx; }
.empty-state { margin:24rpx 0; padding:90rpx 36rpx; border:1rpx dashed rgba(255,255,255,.14); border-radius:24rpx; background:rgba(255,255,255,.03); }
</style>
