import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { formatDuration, formatDateTime, generateId, normalizeResult } from '@/utils/index.js'

const STORAGE_KEY = 'pianke_uid'
const AUTH_TOKEN_KEY = 'pianke_auth_token'
const INSTALLATION_KEY = 'pianke_installation_id'
const RELAX_SYNC_PENDING_KEY = 'pianke_relax_sync_pending'
const DEFAULT_CONFIG = {
  daily_ad_limit: 100,
  daily_feed_limit: 100,
  rewarded_video_gold: 100,
  rewarded_video_time: 300,
  feed_exposure_min_ms: 60000,
  feed_exposure_reward_time: 60,
  coupon_15min_cost: 300,
  coupon_15min_time: 900,
  coupon_15min_daily_limit: 3,
  coupon_60min_cost: 1000,
  coupon_60min_time: 3600,
  coupon_60min_daily_limit: 1,
  adpid_rewarded: '',
  adpid_feed: '',
  adpid_interstitial: '',
  ad_enabled_rewarded: true,
  ad_enabled_feed: true,
  ad_enabled_interstitial: true,
  legal_terms_url: 'https://env-00jy6ojekxqo-static.normal.cloudstatic.cn/user/service.html',
  legal_privacy_url: 'https://env-00jy6ojekxqo-static.normal.cloudstatic.cn/user/privacy.html'
}

export const useUserStore = defineStore('user', () => {
  const user = ref({
    _id: '',
    gold_balance: 0,
    relaxation_time: 0,
    relaxation_started_at: 0,
    relaxation_expire_at: 0,
    total_ad_views: 0,
    daily_ad_count: 0,
    daily_ad_date: '',
    daily_feed_count: 0,
    daily_feed_date: '',
    invite_code: '',
    coupon_15min_today: 0,
    coupon_60min_today: 0,
    coupon_date: '',
    invite_bind_used: false,
    activation_status: 'pending',
    continuous_checkin: 0,
    last_checkin_date: '',
    created_at: 0,
    updated_at: 0
  })
  const goldLogs = ref([])
  const goldLogsTotal = ref(0)
  const config = ref({ ...DEFAULT_CONFIG })
  const serverTimestamp = ref(0)
  const serverDate = ref('')
  const currentTime = ref(Date.now())
  const isLoading = ref(false)
  const error = ref('')
  const initialized = ref(false)
  const clockOffset = ref(0)
  const isSyncing = ref(false)
  let syncPromise = null
  let relaxSyncPromise = null
  let eventHandler = null
  let timer = null
  let lastSyncTimestamp = 0
  let statsTimer = null
  const USER_INFO_SYNC_COOLDOWN_MS = 1500
  let lastUserInfoSuccessAt = 0
  let lastAssetUpdateTime = 0
  let lastConfigFetchAt = 0

  function startClock() {
    if (timer) return
    timer = setInterval(() => { currentTime.value = Date.now() }, 1000)
  }

  function getOrCreateUid() {
    return user.value._id || uni.getStorageSync(STORAGE_KEY) || ''
  }

  function getOrCreateInstallationId() {
    let installationId = uni.getStorageSync(INSTALLATION_KEY)
    if (!installationId) {
      installationId = generateId('device')
      uni.setStorageSync(INSTALLATION_KEY, installationId)
    }
    return installationId
  }

  function saveAuthToken(token) {
    if (token) {
      uni.setStorageSync(AUTH_TOKEN_KEY, String(token))
    }
  }

  function getAuthToken() {
    return uni.getStorageSync(AUTH_TOKEN_KEY) || ''
  }

  function applyAsset(data = {}) {
    if (data.auth_token) saveAuthToken(data.auth_token)
    if (!data.user) return
    
    const updateTime = Number(data.server_timestamp || Date.now())
    if (updateTime < lastAssetUpdateTime) return
    lastAssetUpdateTime = updateTime

    const asset = data.user || {}
    user.value = {
      ...user.value,
      _id: asset.user_id || user.value._id,
      gold_balance: Number(asset.balance_gold || 0),
      relaxation_time: Number(asset.balance_relax_seconds || 0),
      activation_status: asset.activation_status || user.value.activation_status,
      invite_code: asset.invite_code || user.value.invite_code,
      daily_ad_count: Number(asset.daily_ad_count || 0),
      daily_feed_count: Number(asset.daily_feed_count || 0),
      daily_ad_date: asset.last_ad_date || '',
      daily_feed_date: asset.last_feed_date || ''
    }
    if (data.config) config.value = { ...config.value, ...data.config }
    
    if (data.server_timestamp) {
      serverTimestamp.value = Number(data.server_timestamp)
      clockOffset.value = serverTimestamp.value - Date.now()
    }
    if (data.server_date) serverDate.value = String(data.server_date)
    
    if (data.user.relaxation_expire_at) {
      targetTime.value = Number(data.user.relaxation_expire_at) - clockOffset.value
    } else {
      targetTime.value = Date.now() + Math.max(0, Number(data.user.relaxation_time || 0)) * 1000
    }
  }

  const targetTime = ref(0)
  const remainingSeconds = computed(() => Math.max(0, Math.ceil((targetTime.value - currentTime.value) / 1000)))
  const isActive = computed(() => remainingSeconds.value > 0)

  watch(isActive, (active) => {
    if (active) {
      lastSyncTimestamp = Date.now()
      if (!statsTimer) {
        statsTimer = setInterval(() => {
          const now = Date.now()
          const diff = Math.floor((now - lastSyncTimestamp) / 1000)
          if (diff >= 30) {
            syncRelaxSeconds(diff)
            lastSyncTimestamp = now
          }
        }, 5000)
      }
    } else {
      if (statsTimer) {
        const diff = Math.floor((Date.now() - lastSyncTimestamp) / 1000)
        if (diff > 0) syncRelaxSeconds(diff)
        clearInterval(statsTimer)
        statsTimer = null
      }
    }
  })

  async function syncRelaxSeconds(seconds) {
    if (!user.value._id || seconds <= 0 || relaxSyncPromise) return
    const requestedSeconds = Math.min(360, Math.max(1, Math.floor(seconds)))
    let pending = uni.getStorageSync(RELAX_SYNC_PENDING_KEY)
    if (!pending || pending.uid !== user.value._id || !pending.idempotency_key) {
      pending = {
        uid: user.value._id,
        seconds: requestedSeconds,
        idempotency_key: generateId('relax_sync'),
        created_at: Date.now(),
        updated_at: Date.now()
      }
    } else {
      pending.seconds = Math.max(0, Number(pending.seconds) || 0) + requestedSeconds
      pending.updated_at = Date.now()
    }
    uni.setStorageSync(RELAX_SYNC_PENDING_KEY, pending)
    const syncPayload = { uid: user.value._id, increment_seconds: Math.max(1, Number(pending.seconds) || requestedSeconds), idempotency_key: pending.idempotency_key }
    relaxSyncPromise = (async () => {
      try {
        const response = await invoke('syncRelaxStats', syncPayload)
        if (response.code === 0 && response.data) {
          applyAsset(response.data)
          uni.removeStorageSync(RELAX_SYNC_PENDING_KEY)
        }
      } catch (error) {
        // 保留累计 pending 与幂等键，网络重试不会重复扣时。
        console.warn('[user] relaxation sync deferred', { user_id: user.value._id, trace_id: pending.idempotency_key, error_stack: String(error?.stack || error?.message || error) })
      } finally {
        relaxSyncPromise = null
      }
    })()
    return relaxSyncPromise
  }
  
  const formattedRelaxTime = computed(() => formatDuration(remainingSeconds.value))
  const dailyAdLimit = computed(() => Math.max(1, Number(config.value.daily_ad_limit || DEFAULT_CONFIG.daily_ad_limit)))
  const adProgress = computed(() => Math.min(100, Math.round((Number(user.value.daily_ad_count || 0) / dailyAdLimit.value) * 100)))
  const dailyFeedLimit = computed(() => Math.max(1, Number(config.value.daily_feed_limit || DEFAULT_CONFIG.daily_feed_limit)))
  const feedProgress = computed(() => Math.min(100, Math.round((Number(user.value.daily_feed_count || 0) / dailyFeedLimit.value) * 100)))
  const canExchange15min = computed(() => Number(user.value.gold_balance) >= Number(config.value.coupon_15min_cost) && Number(user.value.coupon_15min_today) < Number(config.value.coupon_15min_daily_limit))
  const canExchange60min = computed(() => Number(user.value.gold_balance) >= Number(config.value.coupon_60min_cost) && Number(user.value.coupon_60min_today) < Number(config.value.coupon_60min_daily_limit))
  const isTodayCheckedIn = computed(() => {
    const today = serverDate.value || new Date().toISOString().split('T')[0]
    return Boolean(user.value.last_checkin_date && user.value.last_checkin_date === today)
  })

  async function invoke(name, data = {}) {
    if (typeof uniCloud === 'undefined') throw new Error('云服务未就绪')
    const authToken = getAuthToken()
    const requestData = { ...data, device_id: data.device_id || getOrCreateInstallationId() }
    if (authToken) requestData.auth_token = authToken
    if (name !== 'initUser' && user.value._id && !requestData.uid) requestData.uid = user.value._id
    
    const response = normalizeResult(await uniCloud.callFunction({ name, data: requestData }))
    if (!response || Number(response.code) !== 0) {
      const err = new Error(response?.message || '请求失败')
      err.code = response?.code
      if ([401, 1403].includes(Number(err.code))) {
        uni.removeStorageSync(AUTH_TOKEN_KEY)
        initialized.value = false
      }
      throw err
    }
    return response
  }

  async function ensureSessionReady() {
    if (initialized.value) return { success: true }
    return syncUser('initUser')
  }

  async function syncUser(name = 'getUserInfo', options = {}) {
    const force = Boolean(options?.force)
    if (name === 'getUserInfo' && !force && lastUserInfoSuccessAt > 0 && Date.now() - lastUserInfoSuccessAt < USER_INFO_SYNC_COOLDOWN_MS) {
      return { success: true, data: { user: user.value, server_timestamp: serverTimestamp.value, server_date: serverDate.value, cached: true } }
    }
    if (syncPromise) return syncPromise
    syncPromise = (async () => {
      isLoading.value = true
      try {
        const req = name === 'initUser' ? { device_id: getOrCreateInstallationId() } : { uid: getOrCreateUid() }
        const promises = [invoke(name, req)]
        
        // 缓存策略：60秒 TTL，运营配置修改后最多 60 秒自然生效
        if (Date.now() - lastConfigFetchAt > 60000) {
          promises.push(invoke('getAppConfig'))
        }

        const [userRes, configRes] = await Promise.allSettled(promises)
        if (userRes.status === 'fulfilled') {
          applyAsset(userRes.value.data)
          if (name === 'getUserInfo') lastUserInfoSuccessAt = Date.now()
        } else {
          throw userRes.reason
        }
        
        if (configRes && configRes.status === 'fulfilled') {
          config.value = { ...config.value, ...(configRes.value.data || {}) }
          lastConfigFetchAt = Date.now()
        }
        
        initialized.value = true
        return { success: true, data: userRes.value.data }
      } catch (err) {
        error.value = err.message
        return { success: false, message: err.message, code: err.code }
      } finally {
        isLoading.value = false
        syncPromise = null
      }
    })()
    return syncPromise
  }

  async function checkIn() {
    if (isTodayCheckedIn.value) return { success: false, message: '今日已签到' }
    
    // 乐观 UI 更新
    const backup = { ...user.value }
    const today = serverDate.value || new Date().toISOString().split('T')[0]
    user.value.last_checkin_date = today
    user.value.gold_balance += (config.value.checkin_reward_gold || 100)
    user.value.continuous_checkin += 1

    try {
      const res = await invoke('checkIn')
      applyAsset(res.data)
      void fetchGoldLogs({ page_num: 1 })
      return { success: true, message: res.message }
    } catch (err) {
      user.value = backup // 回滚
      return { success: false, message: err.message }
    }
  }

  async function exchangeCoupon(couponType) {
    const coupon = couponType === '15min' ? 
      { cost: config.value.coupon_15min_cost, time: config.value.coupon_15min_time, field: 'coupon_15min_today' } :
      { cost: config.value.coupon_60min_cost, time: config.value.coupon_60min_time, field: 'coupon_60min_today' }
    
    if (user.value.gold_balance < coupon.cost) return { success: false, message: '金币不足' }
    
    // 乐观 UI 更新
    const backup = { ...user.value }
    const backupTarget = targetTime.value
    user.value.gold_balance -= coupon.cost
    user.value[coupon.field] += 1
    targetTime.value += coupon.time * 1000

    try {
      const res = await invoke('exchangeCoupon', { couponType, idempotency_key: generateId('ex') })
      applyAsset(res.data)
      void fetchGoldLogs({ page_num: 1 })
      return { success: true, message: res.message }
    } catch (err) {
      user.value = backup
      targetTime.value = backupTarget
      return { success: false, message: err.message }
    }
  }

  async function fetchGoldLogs(options = {}) {
    try {
      const res = await invoke('getGoldLogs', { page_num: options.page_num || 1, page_size: options.page_size || 20 })
      const next = res.data?.logs || []
      goldLogs.value = options.page_num > 1 ? [...goldLogs.value, ...next] : next
      goldLogsTotal.value = res.data?.total || 0
      return { success: true }
    } catch (err) { return { success: false } }
  }

  return {
    user, goldLogs, goldLogsTotal, config, targetTime, serverTimestamp, serverDate,
    remainingSeconds, isActive, formattedRelaxTime, dailyAdLimit, adProgress,
    dailyFeedLimit, feedProgress, canExchange15min, canExchange60min, isLoading,
    error, initialized, getOrCreateUid, syncUser, initUser: () => { startClock(); return syncUser('initUser') },
    getUserInfo: (opts) => { startClock(); return syncUser('getUserInfo', opts) },
    invoke, ensureSessionReady, formatDateTime, fetchGoldLogs, exchangeCoupon, checkIn, isTodayCheckedIn, applyAsset,
    emitAsset: (d) => { applyAsset(d); void fetchGoldLogs(); uni.$emit('asset_updated', d) }
  }
})
