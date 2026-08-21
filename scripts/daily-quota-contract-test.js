'use strict'

const assert = require('assert')
const {
  QUOTA_TYPES,
  quotaDocumentId,
  quotaLimitFromConfig,
  buildQuotaSnapshot
} = require('../uniCloud-alipay/cloudfunctions/common/pianke-common/quotaService')

const user = {
  _id: 'user-1',
  daily_ad_count: 3,
  daily_feed_count: 5,
  coupon_15min_today: 1,
  coupon_60min_today: 0
}
const config = {
  daily_ad_limit: 15,
  daily_feed_limit: 20,
  coupon_15min_daily_limit: 3,
  coupon_60min_daily_limit: 1,
  interstitial_daily_limit: 5
}

assert.deepStrictEqual(Object.keys(QUOTA_TYPES), [
  'rewarded_video',
  'feed_reward',
  'coupon_15min',
  'coupon_60min',
  'interstitial'
])
assert.strictEqual(quotaLimitFromConfig('rewarded_video', config), 15)
assert.strictEqual(quotaLimitFromConfig('coupon_15min', config), 3)
assert.strictEqual(quotaDocumentId('user-1', '2026-08-21', 'rewarded_video'), quotaDocumentId('user-1', '2026-08-21', 'rewarded_video'))
assert.notStrictEqual(quotaDocumentId('user-1', '2026-08-21', 'rewarded_video'), quotaDocumentId('user-1', '2026-08-22', 'rewarded_video'))

const snapshot = buildQuotaSnapshot({
  user,
  quotaType: 'rewarded_video',
  quotaDate: '2026-08-21',
  config
})
assert.strictEqual(snapshot.used_count, 3)
assert.strictEqual(snapshot.limit_count, 15)
assert.strictEqual(snapshot.remaining_count, 12)
assert.strictEqual(snapshot.exhausted, false)

const exhausted = buildQuotaSnapshot({
  user: { ...user, daily_feed_count: 20 },
  quotaType: 'feed_reward',
  quotaDate: '2026-08-21',
  config
})
assert.strictEqual(exhausted.remaining_count, 0)
assert.strictEqual(exhausted.exhausted, true)

console.log(JSON.stringify({ quota_types: 5, stable_ids: true, remaining_count: true, exhausted_state: true }))
