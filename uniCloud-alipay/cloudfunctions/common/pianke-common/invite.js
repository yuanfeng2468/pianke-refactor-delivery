'use strict'

const { ERROR_CODES, PiankeError } = require('./constants')
const { findUser, safeInt } = require('./utils')
const { addLedger, addRewardGrant } = require('./walletService')

/**
 * 在调用方事务内统一发放邀请人和受邀人奖励。
 * 调用方必须已验证激活状态、绑定关系和业务触发条件；本函数负责关系确认、幂等流水和存证。
 */
async function grantInviteReward({ db, inviteeId, transId, rewardGold, timestamp, requireFirstAd = true }) {
  const uid = String(inviteeId || '').trim()
  const amount = Math.max(0, safeInt(rewardGold))
  if (!db || !uid || !transId || amount <= 0) throw new PiankeError('邀请奖励参数无效', ERROR_CODES.INVALID_PARAMS)

  const invitee = await findUser(db, uid)
  if (!invitee) throw new PiankeError('用户不存在', ERROR_CODES.USER_NOT_FOUND)
  if (invitee.activation_status !== 'activated') throw new PiankeError('账户尚未激活', ERROR_CODES.INVITE_CODE_NOT_ACTIVATED)
  if (requireFirstAd && safeInt(invitee.total_ad_views) < 1) {
    throw new PiankeError('完成首次有效广告行为后才可领取邀请奖励', ERROR_CODES.INVALID_PARAMS)
  }
  if (invitee.invite_reward_claimed === true) {
    return { status: 'already_claimed', invitee_id: uid, reward_gold: 0 }
  }

  const inviteCode = String(invitee.invited_by || '').trim().toUpperCase()
  if (!inviteCode) throw new PiankeError('邀请码绑定关系无效', ERROR_CODES.INVITE_CODE_INVALID)
  const inviterResult = await db.collection('user').where({ invite_code: inviteCode }).limit(1).get()
  const inviter = inviterResult.data?.[0]
  if (!inviter || inviter._id === uid) throw new PiankeError('邀请码关系无效', ERROR_CODES.INVITE_CODE_INVALID)

  const inviteLogId = `invite_${uid}_${inviteCode}`
  const existing = await db.collection('invite_logs').doc(inviteLogId).get()
  if (existing.data?.[0] || existing.data) return { status: 'already_claimed', invitee_id: uid, reward_gold: 0 }

  await addLedger({ db, uid: inviter._id, delta: amount, business_type: 'invite', order_id: `${transId}:inviter`, idempotency_key: `invite_ledger:${transId}:inviter`, remark: '好友完成首次有效行为奖励' })
  await addLedger({ db, uid, delta: amount, business_type: 'invite', order_id: `${transId}:invitee`, idempotency_key: `invite_ledger:${transId}:invitee`, remark: '完成首次有效行为奖励' })
  await db.collection('user').doc(uid).update({ invite_reward_claimed: true, updated_at: timestamp })
  await db.collection('invite_logs').doc(inviteLogId).set({
    _id: inviteLogId, trans_id: transId, invite_code: inviteCode,
    inviter_id: inviter._id, invitee_id: uid, reward_gold: amount, created_at: timestamp
  })
  await addRewardGrant({ db, trans_id: `${transId}:inviter`, order_id: `invite_reward:${transId}:inviter`, user_id: inviter._id, grant_type: 'invite_reward_inviter', gold_amount: amount, time_amount: 0, created_at: timestamp })
  await addRewardGrant({ db, trans_id: `${transId}:invitee`, order_id: `invite_reward:${transId}:invitee`, user_id: uid, grant_type: 'invite_reward_invitee', gold_amount: amount, time_amount: 0, created_at: timestamp })
  return { status: 'rewarded', inviter_id: inviter._id, invitee_id: uid, reward_gold: amount }
}

module.exports = { grantInviteReward }
