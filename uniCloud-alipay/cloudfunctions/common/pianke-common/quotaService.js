'use strict'

const { stableId, getTodayString, safeInt, now } = require('./utils')

const QUOTA_TYPES = Object.freeze({
  rewarded_video: 'rewarded_video',
  feed_reward: 'feed_reward',
  coupon_15min: 'coupon_15min',
  coupon_60min: 'coupon_60min',
  interstitial: 'interstitial'
})

function quotaDocumentId(userId, quotaDate, quotaType) {
  return stableId('daily_quota', `${userId}:${quotaDate}:${quotaType}`)
}

function quotaLimitFromConfig(quotaType, config = {}) {
  const value = key => safeInt(config[key], -1)
  switch (quotaType) {
    case QUOTA_TYPES.rewarded_video:
      return value('daily_ad_limit')
    case QUOTA_TYPES.feed_reward:
      return value('daily_feed_limit')
    case QUOTA_TYPES.coupon_15min:
      return value('coupon_15min_daily_limit')
    case QUOTA_TYPES.coupon_60min:
      return value('coupon_60min_daily_limit')
    case QUOTA_TYPES.interstitial:
      return value('interstitial_daily_limit')
    default:
      return -1
  }
}

function userQuotaCount(user, quotaType, quotaDate) {
  const today = getTodayString(now())
  if (quotaDate !== today) return 0
  switch (quotaType) {
    case QUOTA_TYPES.rewarded_video:
      return safeInt(user.daily_ad_count)
    case QUOTA_TYPES.feed_reward:
      return safeInt(user.daily_feed_count)
    case QUOTA_TYPES.coupon_15min:
      return safeInt(user.coupon_15min_today)
    case QUOTA_TYPES.coupon_60min:
      return safeInt(user.coupon_60min_today)
    default:
      return 0
  }
}

function buildQuotaSnapshot({ user, quotaType, quotaDate, config = {}, record = null }) {
  const usedCount = record ? safeInt(record.used_count) : userQuotaCount(user, quotaType, quotaDate)
  const limitCount = record ? safeInt(record.limit_count, quotaLimitFromConfig(quotaType, config)) : quotaLimitFromConfig(quotaType, config)
  return {
    quota_type: quotaType,
    quota_date: quotaDate,
    used_count: Math.max(0, usedCount),
    limit_count: limitCount,
    remaining_count: limitCount < 0 ? -1 : Math.max(0, limitCount - usedCount),
    exhausted: limitCount >= 0 && usedCount >= limitCount
  }
}

async function readOrMirrorQuota({ db, user, quotaType, quotaDate, config = {}, transaction = null }) {
  const database = transaction || db
  const id = quotaDocumentId(user._id, quotaDate, quotaType)
  const result = await database.collection('daily_quota').doc(id).get()
  const record = result.data?.[0] || result.data || null
  const snapshot = buildQuotaSnapshot({ user, quotaType, quotaDate, config })
  const timestamp = now()
  if (record) {
    const needsSync = safeInt(record.used_count) !== snapshot.used_count || safeInt(record.limit_count, snapshot.limit_count) !== snapshot.limit_count
    if (needsSync) {
      await database.collection('daily_quota').doc(id).update({
        used_count: snapshot.used_count,
        limit_count: snapshot.limit_count,
        source: 'user_mirror',
        updated_at: timestamp
      })
    }
    return snapshot
  }
  await database.collection('daily_quota').doc(id).set({
    _id: id,
    user_id: user._id,
    quota_date: quotaDate,
    quota_type: quotaType,
    used_count: snapshot.used_count,
    limit_count: snapshot.limit_count,
    source: 'user_mirror',
    created_at: timestamp,
    updated_at: timestamp
  })
  return snapshot
}

module.exports = {
  QUOTA_TYPES,
  quotaDocumentId,
  quotaLimitFromConfig,
  userQuotaCount,
  buildQuotaSnapshot,
  readOrMirrorQuota
}
