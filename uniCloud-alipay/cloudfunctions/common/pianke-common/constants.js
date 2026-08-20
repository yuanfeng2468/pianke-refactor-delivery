'use strict'

const RELEASE = Object.freeze({
  schema_version: '3.1.3',
  cloud_module_version: 'pianke-common@3.1.3',
  service_space_id: 'env-00jy6ozy1390'
})

const ERROR_CODES = Object.freeze({
  SUCCESS: 0,
  INVALID_PARAM: 400,
  INVALID_PARAMS: 400,
  ORDER_NOT_FOUND: 404,
  DUPLICATE_REQUEST: 409,
  BALANCE_NOT_ENOUGH: 410,
  INSUFFICIENT_GOLD: 410,
  RISK_BLOCKED: 429,
  INTERNAL_ERROR: 500,
  SYSTEM_ERROR: 500,
  USER_NOT_FOUND: 404,
  RESOURCE_NOT_FOUND: 404,
  AUTH_REQUIRED: 401,
  INVITE_ALREADY_USED: 420,
  INVITE_CODE_INVALID: 421,
  INVITE_CODE_EXPIRED: 422,
  INVITE_CODE_EXCEEDED: 423,
  INVITE_CODE_NOT_ACTIVATED: 424,
  DAILY_LIMIT_REACHED: 430,
  AD_REWARD_UNVERIFIED: 431,
  ADMIN_UNAUTHORIZED: 403,
  CONFIG_INVALID: 432,
  RATE_LIMIT_EXCEEDED: 429
})

const AD_CONFIG = {
  REWARDED_VIDEO: {
    REWARD_GOLD: 80,
    DAILY_LIMIT: 10,
    ALLOWED_ADPIDS: []
  },
  FEED_AD: { ADPID: '' },
  INTERSTITIAL_AD: { ADPID: '', DEFAULT_FREQUENCY_MINUTES: 2, DEFAULT_DAILY_LIMIT: 10 }
}

const INVITE_CONFIG = { DEFAULT_REWARD_GOLD: 200 }
const CHECKIN_CONFIG = Object.freeze({ MAX_CONTINUOUS: 7 })

const COUPON_CONFIG = Object.freeze({
  '15min': { gold_cost: 300, relax_seconds: 900, daily_limit: 3 },
  '60min': { gold_cost: 1000, relax_seconds: 3600, daily_limit: 1 }
})

// 仅保留核心业务的事件类型，增加 show/click/close 埋点支持
const AD_EVENT_TYPES = Object.freeze([
  'request', 'fill', 'show', 'click', 'close', 'error',
  'start', 'complete', 'reward_success', 'reward_fail', 'reward_duplicate',
  'exposure_start', 'exposure_rewarded', 'exposure_expired',
  'load_start', 'load_success', 'load_failed', 'show_requested', 'shown',
  'closed', 'callback_received', 'callback_verified', 'reward_granted'
])

const AD_EVENTS = Object.freeze({
  REWARD_DUPLICATE: 'reward_duplicate',
  EXPOSURE_EXPIRED: 'exposure_expired',
  EXPOSURE_REWARDED: 'exposure_rewarded',
  LOAD_FAILED: 'load_failed',
  REWARD_GRANTED: 'reward_granted'
})

// 仅保留核心重构后的 4 个场景
const AD_SCENES = Object.freeze([
  'relax', 
  'coin_page_quick_earn', 
  'coin_page_feed', 
  'interstitial_exit_coin'
])

class PiankeError extends Error {
  constructor(message, code = ERROR_CODES.SYSTEM_ERROR, data = null) {
    super(message)
    this.name = 'PiankeError'
    this.code = code
    this.data = data
  }
}

module.exports = {
  RELEASE,
  ERROR_CODES,
  AD_CONFIG,
  INVITE_CONFIG,
  CHECKIN_CONFIG,
  COUPON_CONFIG,
  AD_EVENT_TYPES,
  AD_EVENTS,
  AD_SCENES,
  PiankeError
}
