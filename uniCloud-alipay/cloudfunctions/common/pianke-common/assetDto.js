'use strict'

const { safeInt, getBusinessDate } = require('./utils')

function buildAssetDTO(user, timestamp) {
  if (!user) return { server_timestamp: timestamp, server_date: getBusinessDate(timestamp) }
  const balanceGold = safeInt(user.gold_balance)
  const balanceRelaxSeconds = safeInt(user.relaxation_time)
  return {
    user: {
      user_id: String(user._id || ''),
      balance_gold: balanceGold,
      balance_relax_seconds: balanceRelaxSeconds,
      activation_status: String(user.activation_status || 'pending'),
      invite_code: String(user.invite_code || ''),
      daily_ad_count: safeInt(user.daily_ad_count),
      daily_feed_count: safeInt(user.daily_feed_count),
      last_ad_date: String(user.daily_ad_date || ''),
      last_feed_date: String(user.daily_feed_date || '')
    },
    server_timestamp: timestamp,
    server_date: getBusinessDate(timestamp)
  }
}

module.exports = { buildAssetDTO }
