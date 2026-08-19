'use strict'

const { ERROR_CODES, safeInt } = require('pianke-common')

// 内存缓存：跨请求持久化（在实例未销毁前有效）
let configCache = null
let lastCacheTime = 0
const CACHE_TTL = 60000 // 60秒缓存，运营配置最多延迟 60 秒

exports.main = async (event = {}) => {
  try {
    const now = Date.now()
    
    // 命中有效缓存直接返回
    if (configCache && (now - lastCacheTime < CACHE_TTL)) {
      return { code: ERROR_CODES.SUCCESS, message: 'success (cached)', data: configCache }
    }

    const db = uniCloud.database()
    const { data: configRows } = await db.collection('operation_config').get()
    
    const configs = (configRows || []).reduce((acc, row) => {
      acc[row.config_key] = row.config_value
      return acc
    }, {})

    // 映射逻辑
    const valueOf = (obj, key, fallback) => (obj && obj[key] !== undefined ? obj[key] : fallback)
    const scalar = (obj, fallback) => (obj && obj.value !== undefined ? obj.value : fallback)

    const result = {
      daily_ad_limit: Math.min(100, Math.max(1, safeInt(scalar(configs.daily_ad_limit, 100), 100))),
      daily_feed_limit: Math.min(100, Math.max(1, safeInt(scalar(configs.daily_feed_limit, 100), 100))),
      rewarded_video_gold: safeInt(valueOf(configs.rewarded_video_reward, 'gold', 100), 100),
      rewarded_video_time: safeInt(valueOf(configs.rewarded_video_reward, 'time', 300), 300),
      feed_exposure_min_ms: safeInt(scalar(configs.feed_exposure_min_ms, 60000), 60000),
      feed_exposure_reward_time: safeInt(scalar(configs.feed_exposure_reward_time, 60), 60),
      interstitial_frequency_minutes: safeInt(scalar(configs.interstitial_frequency_minutes, 3), 3),
      interstitial_daily_limit: safeInt(scalar(configs.interstitial_daily_limit, 5), 5),
      
      coupon_15min_cost: safeInt(valueOf(configs.coupon_15min, 'cost', 300), 300),
      coupon_15min_time: safeInt(valueOf(configs.coupon_15min, 'time', 900), 900),
      coupon_15min_daily_limit: safeInt(valueOf(configs.coupon_15min, 'dailyLimit', 3), 3),
      
      coupon_60min_cost: safeInt(valueOf(configs.coupon_60min, 'cost', 1000), 1000),
      coupon_60min_time: safeInt(valueOf(configs.coupon_60min, 'time', 3600), 3600),
      coupon_60min_daily_limit: safeInt(valueOf(configs.coupon_60min, 'dailyLimit', 1), 1),
      
      // 广告位 ID 以 operation_config 为唯一权威来源；缺失时返回空值，禁止回退到旧硬编码 ID。
      adpid_rewarded: String(scalar(configs.adpid_rewarded, '')),
      adpid_feed: String(scalar(configs.adpid_feed, '')),
      adpid_interstitial: String(scalar(configs.adpid_interstitial, '')),
      
      ad_enabled_rewarded: scalar(configs.ad_enabled_rewarded, true) !== false && Boolean(String(scalar(configs.adpid_rewarded, '')).trim()),
      ad_enabled_feed: scalar(configs.ad_enabled_feed, true) !== false && Boolean(String(scalar(configs.adpid_feed, '')).trim()),
      ad_enabled_interstitial: scalar(configs.ad_enabled_interstitial, true) !== false && Boolean(String(scalar(configs.adpid_interstitial, '')).trim()),

      // 法律文档由云端静态托管，地址统一从 operation_config 下发。
      legal_terms_url: String(scalar(configs.legal_terms_url, 'https://env-00jy6ojekxqo-static.normal.cloudstatic.cn/user/service.html')).trim(),
      legal_privacy_url: String(scalar(configs.legal_privacy_url, 'https://env-00jy6ojekxqo-static.normal.cloudstatic.cn/user/privacy.html')).trim()
    }

    // 更新缓存
    configCache = result
    lastCacheTime = now

    return { code: ERROR_CODES.SUCCESS, message: 'success', data: result }
  } catch (error) {
    console.error('[getAppConfig] failed', error)
    return { code: ERROR_CODES.SYSTEM_ERROR, message: '获取配置失败' }
  }
}
