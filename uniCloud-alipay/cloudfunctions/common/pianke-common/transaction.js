'use strict'

const { findUser, stableId, now, safeInt } = require('./index')

/**
 * 查找幂等记录
 */
async function findIdempotentRecord(dbLike, collectionName, transId) {
  if (!transId) return null
  const id = stableId(collectionName, transId)
  const result = await dbLike.collection(collectionName).doc(id).get()
  return (result.data && result.data.length ? result.data[0] : result.data) || null
}

/**
 * 查找奖励发放记录
 */
async function findRewardGrant(dbLike, transId) {
  if (!transId) return null
  // 统一使用 'grant' 作为前缀，与 writeLog 中的映射保持一致
  const id = stableId('grant', transId)
  const result = await dbLike.collection('reward_grants').doc(id).get()
  return (result.data && result.data.length ? result.data[0] : result.data) || null
}

/**
 * 构造统一的资产快照负载
 * 解决 Read-After-Commit Latency：如果提供了最新的 user 对象，则直接使用它而不是重新从数据库读取
 */
function buildAssetPayload(user, timestamp = now()) {
  if (!user) return { server_timestamp: timestamp }
  return {
    user: {
      ...user,
      gold_balance: safeInt(user.gold_balance),
      relaxation_time: safeInt(user.relaxation_time),
      total_ad_views: safeInt(user.total_ad_views),
      daily_ad_count: safeInt(user.daily_ad_count),
      coupon_15min_today: safeInt(user.coupon_15min_today),
      coupon_60min_today: safeInt(user.coupon_60min_today)
    },
    gold_balance: safeInt(user.gold_balance),
    relaxation_time: safeInt(user.relaxation_time),
    total_ad_views: safeInt(user.total_ad_views),
    daily_ad_count: safeInt(user.daily_ad_count),
    server_timestamp: timestamp
  }
}

/**
 * 获取最新的资产快照负载 (兼容旧逻辑，但优先推荐在事务中直接返回)
 */
async function latestAssetPayload(uid, timestamp = now(), dbLike = null) {
  const db = dbLike || uniCloud.database()
  const user = await findUser(db, uid)
  return buildAssetPayload(user, timestamp)
}

module.exports = {
  findIdempotentRecord,
  findRewardGrant,
  buildAssetPayload,
  latestAssetPayload
}
