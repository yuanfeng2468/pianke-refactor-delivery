'use strict'

const { stableId, now } = require('./utils')

function statId(uid, businessDate) {
  return stableId('daily_stats', `${uid}:${businessDate}`)
}

async function getDailyStat({ db, uid, businessDate }) {
  if (!db || !uid || !businessDate) throw new Error('invalid daily stat input')
  const id = statId(uid, businessDate)
  const result = await db.collection('user_daily_stats').doc(id).get()
  return { id, data: result.data?.[0] || result.data || null }
}

async function ensureDailyStat({ db, uid, businessDate, timestamp = now() }) {
  const { id, data } = await getDailyStat({ db, uid, businessDate })
  if (data) return data
  await db.collection('user_daily_stats').doc(id).set({
    _id: id, user_id: uid, business_date: businessDate,
    ad_count: 0, feed_count: 0, interstitial_count: 0,
    coupon_15min_count: 0, coupon_60min_count: 0, checkin_completed: false,
    created_at: timestamp, updated_at: timestamp
  })
  return { _id: id, user_id: uid, business_date: businessDate, ad_count: 0, feed_count: 0, interstitial_count: 0, coupon_15min_count: 0, coupon_60min_count: 0, checkin_completed: false, created_at: timestamp, updated_at: timestamp }
}

async function incrementDailyStat({ db, uid, businessDate, field, delta = 1, timestamp = now() }) {
  if (!db || !uid || !businessDate || !/^[a-z_]+$/.test(String(field))) throw new Error('invalid daily stat input')
  const current = await ensureDailyStat({ db, uid, businessDate, timestamp })
  await db.collection('user_daily_stats').doc(current._id).update({
    [field]: db.command.inc(Number(delta) || 1), updated_at: timestamp
  })
  return current._id
}

module.exports = { statId, getDailyStat, ensureDailyStat, incrementDailyStat }
