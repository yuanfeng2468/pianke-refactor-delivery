'use strict'

const {
  requireAuth,
  assertRequestedUid,
  ERROR_CODES,
  PiankeError,
  findUser,
  getTodayString,
  now,
  getBatchConfigs,
  getOperationNumber,
  QUOTA_TYPES,
  readOrMirrorQuota
} = require('pianke-common')

const CONFIG_KEYS = [
  'daily_ad_limit',
  'daily_feed_limit',
  'coupon_15min_daily_limit',
  'coupon_60min_daily_limit',
  'coupon_15min',
  'coupon_60min',
  'interstitial_daily_limit'
]

function configMap(configs) {
  return configs || {}
}

function numberConfig(config, key, fallback) {
  const value = config[key]
  if (value && typeof value === 'object') {
    if (value.value !== undefined) return getOperationNumber(value, fallback)
    if (value.dailyLimit !== undefined) return getOperationNumber(value.dailyLimit, fallback)
  }
  return getOperationNumber(value, fallback)
}

exports.main = async (event = {}, context = {}) => {
  const requestedUid = String(event.uid || '').trim()
  try {
    const auth = await requireAuth(event, context)
    const uid = assertRequestedUid(requestedUid, auth.uid)
    const db = uniCloud.database()
    const user = await findUser(db, uid)
    if (!user) throw new PiankeError('用户不存在', ERROR_CODES.USER_NOT_FOUND)

    const today = getTodayString(now())
    const config = configMap(await getBatchConfigs(CONFIG_KEYS))
    const configForQuota = {
      daily_ad_limit: numberConfig(config, 'daily_ad_limit', 15),
      daily_feed_limit: numberConfig(config, 'daily_feed_limit', 20),
      coupon_15min_daily_limit: numberConfig(config, 'coupon_15min_daily_limit', numberConfig(config, 'coupon_15min', 3)),
      coupon_60min_daily_limit: numberConfig(config, 'coupon_60min_daily_limit', numberConfig(config, 'coupon_60min', 1)),
      interstitial_daily_limit: numberConfig(config, 'interstitial_daily_limit', 5)
    }

    const quotas = await Promise.all(Object.values(QUOTA_TYPES).map(quotaType =>
      readOrMirrorQuota({ db, user, quotaType, quotaDate: today, config: configForQuota })
    ))
    return {
      code: ERROR_CODES.SUCCESS,
      message: '获取每日配额成功',
      data: {
        server_timestamp: now(),
        server_date: today,
        quotas
      }
    }
  } catch (error) {
    console.error('[getDailyQuota] failed', {
      user_id: requestedUid,
      trace_id: String(event.request_id || ''),
      error_stack: String(error.stack || error.message || error)
    })
    return { code: Number(error.code) || ERROR_CODES.SYSTEM_ERROR, message: error.message || '获取每日配额失败', data: null }
  }
}
