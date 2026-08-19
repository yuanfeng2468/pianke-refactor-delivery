'use strict'

const { stableId, now } = require('./utils')

async function incrementDailyStat({ db, uid, businessDate, field, delta = 1 }) {
  if (!db || !uid || !businessDate || !/^[a-z_]+$/.test(String(field))) throw new Error('invalid daily stat input')
  const id = stableId('daily_stats', `${uid}:${businessDate}`)
  const collection = db.collection('user_daily_stats')
  const existingResult = await collection.doc(id).get()
  const existing = existingResult.data?.[0] || existingResult.data
  const timestamp = now()
  if (!existing) {
    await collection.doc(id).set({
      _id: id, user_id: uid, business_date: businessDate,
      ad_count: 0, feed_count: 0, interstitial_count: 0,
      coupon_15min_count: 0, coupon_60min_count: 0, checkin_completed: false,
      created_at: timestamp, updated_at: timestamp
    })
  }
  await collection.doc(id).update({ [field]: uniCloud.database().command.inc(Number(delta) || 1), updated_at: timestamp })
  return id
}

module.exports = { incrementDailyStat }
