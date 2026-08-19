'use strict'
const {
  ERROR_CODES, PiankeError, findUser, getOperationConfig, runTransaction,
  getIdempotencyKey, safeInt, now, requireAuth, assertRequestedUid,
  latestAssetPayload, grantInviteReward
} = require('pianke-common')

exports.main = async (event = {}, context = {}) => {
  let uid = ''
  try {
    if (event.trigger === 'manual_admin') return { code: ERROR_CODES.ADMIN_UNAUTHORIZED, message: '管理员补发必须使用管理员专用接口' }
    const auth = await requireAuth(event, context)
    uid = assertRequestedUid(event, auth.uid)
    const suppliedCode = String(event.inviteCode || event.invite_code || '').trim().toUpperCase()
    const transId = getIdempotencyKey(event) || `invite_reward_request:${uid}`
    const timestamp = now()
    const configured = await getOperationConfig('invite_reward_gold', 200)
    const rewardGold = Math.max(0, safeInt(configured?.gold ?? configured, 200))

    const result = await runTransaction(async (transaction) => {
      const currentUser = await findUser(transaction, uid)
      if (!currentUser) throw new PiankeError('用户不存在', ERROR_CODES.USER_NOT_FOUND)
      const boundCode = String(currentUser.invited_by || '').trim().toUpperCase()
      if (!boundCode || (suppliedCode && suppliedCode !== boundCode)) throw new PiankeError('邀请码绑定关系无效', ERROR_CODES.INVITE_CODE_INVALID)
      return grantInviteReward({ db: transaction, inviteeId: uid, transId, rewardGold, timestamp, requireFirstAd: true })
    }, { retries: 2 })

    return { code: ERROR_CODES.SUCCESS, message: result.status === 'already_claimed' ? '邀请奖励已处理' : `邀请奖励已发放${rewardGold}金币`, data: { ...(await latestAssetPayload(uid)), inviter_id: result.inviter_id || '', reward_gold: result.reward_gold || 0 } }
  } catch (error) {
    console.error('[inviteReward] failed', { user_id: uid, trace_id: getIdempotencyKey(event) || '', error_stack: String(error.stack || error.message || error) })
    return { code: Number(error.code) || ERROR_CODES.SYSTEM_ERROR, message: error.message || '邀请奖励发放失败' }
  }
}
