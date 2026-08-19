'use strict'

const { ERROR_CODES, PiankeError, AD_EVENTS } = require('./constants')
const { findUser, checkAndResetDaily, now, safeInt } = require('./utils')
const { addLedger } = require('./walletService')
const { addRelaxationLedger } = require('./relaxationService')
const { grantInviteReward } = require('./invite')
const { assertTransition } = require('./orderState')

async function addAdLog(data, dbLike = null) {
  const db = dbLike || uniCloud.database()
  const id = data._id || `adlog_${String(data.trans_id || Date.now())}`
  await db.collection('ad_log').doc(id).set({ _id: id, ...data, created_at: data.created_at || now() })
}

async function addRewardGrant(data, dbLike = null) {
  const db = dbLike || uniCloud.database()
  const payload = { ...data }
  delete payload.db
  const id = payload._id || `grant_${String(payload.trans_id || Date.now())}`
  await db.collection('reward_grants').doc(id).set({ _id: id, ...payload, created_at: payload.created_at || now() })
}

async function addSecurityAuditLog(data) {
  try {
    const db = uniCloud.database()
    const id = data._id || `audit_${String(data.event_id || Date.now())}`
    await db.collection('security_audit_logs').doc(id).set({ _id: id, ...data, created_at: data.created_at || now() })
  } catch (auditError) {
    console.error('[rewardedVideoService] audit write failed', { user_id: data.user_id || '', trace_id: data.trace_id || '', error_stack: String(auditError.stack || auditError.message || auditError) })
    throw auditError
  }
}

async function processRewardedVideoCallback(params = {}) {
  const adpid = String(params.adpid || '').trim()
  const transId = String(params.trans_id || '').trim()
  const uid = String(params.user_id || params.userId || '').trim()
  let extra = params.extra
  for (let i = 0; i < 3 && typeof extra === 'string'; i += 1) {
    try { extra = JSON.parse(extra) } catch (_) { break }
  }
  extra = extra && typeof extra === 'object' && !Array.isArray(extra) ? extra : {}
  const orderId = String(extra.order_id || params.order_id || '').trim()
  const scene = String(extra.scene || params.scene || '').trim()
  const timestamp = now()
  const { getBatchConfigs, getOperationNumber, runTransaction } = require('./index')

  if (!adpid || !transId || !uid || !orderId || !scene) throw new PiankeError('广告回调参数不完整', ERROR_CODES.INVALID_PARAMS)

  let result = null
  await runTransaction(async (transaction) => {
    const grantExists = await transaction.collection('reward_grants').where({ trans_id: transId }).limit(1).get()
    if (grantExists.data?.length) {
      result = { status: 'already_processed', trans_id: transId, order_id: orderId }
      return
    }

    const orderResult = await transaction.collection('reward_orders').where({ order_id: orderId, uid }).limit(1).get()
    const order = orderResult.data?.[0]
    if (!order) throw new PiankeError('广告订单不存在', ERROR_CODES.ORDER_NOT_FOUND)
    if (order.status === 'rewarded') {
      result = { status: 'already_rewarded', trans_id: transId, order_id: orderId }
      return
    }
    if (order.status === 'failed') throw new PiankeError('广告订单已取消', ERROR_CODES.INVALID_PARAM)
    if (String(order.adpid) !== adpid || String(order.scene) !== scene) throw new PiankeError('广告回调与订单不匹配', ERROR_CODES.INVALID_PARAM)

    const user = await findUser(transaction, uid)
    if (!user) throw new PiankeError('用户不存在', ERROR_CODES.USER_NOT_FOUND)

    const configs = await getBatchConfigs(['daily_ad_limit', 'invite_reward_gold'], { daily_ad_limit: 15, invite_reward_gold: 200 })
    const dailyLimit = Math.max(1, getOperationNumber(configs.daily_ad_limit, 15))
    const inviteRewardGold = Math.max(0, getOperationNumber(configs.invite_reward_gold, 200))
    const reset = checkAndResetDaily(user, timestamp)
    const currentCount = reset.changed ? 0 : safeInt(user.daily_ad_count)

    if (currentCount >= dailyLimit) {
      if (order.status !== 'pending_review') assertTransition('reward_orders', order.status, 'pending_review')
      await transaction.collection('reward_orders').doc(order._id).update({
        status: 'pending_review', trans_id: transId, callback_time: timestamp,
        pending_review_at: order.pending_review_at || timestamp,
        reconciliation_status: 'pending', updated_at: timestamp
      })
      result = { status: 'pending_review', trans_id: transId, order_id: orderId, daily_count: currentCount }
      return
    }

    if (order.status !== 'verifying') assertTransition('reward_orders', order.status, 'verifying')
    await transaction.collection('reward_orders').doc(order._id).update({ status: 'verifying', trans_id: transId, callback_time: timestamp, updated_at: timestamp })

    const rewardGold = Math.max(0, safeInt(order.reward_gold))
    const rewardTime = Math.max(0, safeInt(order.reward_time))
    const dailyCount = currentCount + 1
    const firstAd = safeInt(user.total_ad_views) === 0
    await transaction.collection('user').doc(uid).update({
      ...reset.patch, daily_ad_count: dailyCount, total_ad_views: uniCloud.database().command.inc(1), last_reward_at: timestamp, updated_at: timestamp
    })
    await addLedger({ db: transaction, uid, delta: rewardGold, business_type: 'ad_reward', order_id: orderId, idempotency_key: transId, remark: `激励视频奖励:${scene}` })
    if (rewardTime > 0) await addRelaxationLedger({ db: transaction, uid, deltaSeconds: rewardTime, business_type: 'ad_reward', order_id: orderId, idempotency_key: `ad_time:${transId}`, remark: `激励视频放松时长:${scene}` })
    await addRewardGrant({ db: transaction, trans_id: transId, order_id: orderId, user_id: uid, grant_type: 'ad_video', adpid, scene, reward_type: order.reward_type || 'gold_and_time', reward_context: order.reward_context || {}, gold_amount: rewardGold, time_amount: rewardTime, created_at: timestamp })
    await transaction.collection('reward_orders').doc(order._id).update({
      status: 'rewarded', trans_id: transId, verified_at: timestamp, rewarded_at: timestamp,
      reconciliation_status: 'matched', reconciled_at: timestamp, callback_time: timestamp, updated_at: timestamp
    })
    if (firstAd && user.invited_by && !user.invite_reward_claimed && inviteRewardGold > 0) {
      await grantInviteReward({ db: transaction, inviteeId: uid, transId: `auto_invite:${uid}`, rewardGold: inviteRewardGold, timestamp, requireFirstAd: false })
    }
    result = { status: 'rewarded', trans_id: transId, order_id: orderId, gold: rewardGold, time: rewardTime, daily_count: dailyCount }
  }, { retries: 2 })

  await addAdLog({ event_id: `callback:${transId}`, user_id: uid, adpid, scene, event_type: result.status === 'rewarded' ? 'reward_success' : AD_EVENTS.REWARD_DUPLICATE, status: result.status === 'pending_review' ? 'pending' : 'success', trans_id: transId, reward_amount: result.gold || 0, reward_time: result.time || 0, created_at: timestamp })
  return result
}

module.exports = { processRewardedVideoCallback }
