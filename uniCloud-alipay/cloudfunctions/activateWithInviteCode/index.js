'use strict'

const {
  ERROR_CODES, INVITE_CONFIG, requireAuth, assertRequestedUid, findUser, getOperationConfig,
  runTransaction, addLedger, addInviteAttemptLog, addRewardGrant, checkRateLimit,
  stableId, getIdempotencyKey, safeInt, now, PiankeError, buildAssetPayload,
  latestAssetPayload,
  RELEASE
} = require('pianke-common')

exports.main = async (event = {}, context = {}) => {
  const inviteCode = String(event.code || event.invite_code || '').trim().toUpperCase()
  let uid = ''
  const requestedUid = String(event.uid || '').trim()
  const deviceId = String(event.device_id || context.DEVICEID || '').trim()
  const ipAddress = String(event.ip_address || context.CLIENTIP || '').trim()
  const transId = getIdempotencyKey(event) || `activate:${deviceId}:${inviteCode}`

  try {
    if (!inviteCode) throw new PiankeError('缺少邀请码', ERROR_CODES.INVALID_PARAMS)
    const auth = await requireAuth(event, context)
    uid = auth.uid
    assertRequestedUid(event, uid)
    await checkRateLimit(`activate:${uid}`, 5, 60)

    const db = uniCloud.database()
    const existing = await db.collection('reward_grants').where({ user_id: uid, trans_id: transId, grant_type: 'invite_activation' }).limit(1).get()
    if (existing.data?.length) return { code: ERROR_CODES.SUCCESS, message: '激活已处理', data: await latestAssetPayload(uid) }

    const result = await runTransaction(async (transaction) => {
      const user = await findUser(transaction, uid)
      if (!user) throw new PiankeError('用户不存在', ERROR_CODES.USER_NOT_FOUND)
      if (user.activation_status === 'activated') throw new PiankeError('账户已激活', ERROR_CODES.INVITE_ALREADY_USED)
      const timestamp = now()
      const whitelistResult = await transaction.collection('invite_code_whitelist').where({ code: inviteCode }).limit(1).get()
      const whitelistInvite = whitelistResult.data?.[0]
      let invite = whitelistInvite
      let inviteType = 'whitelist'
      let inviter = null

      if (invite) {
        if (invite.status !== 'active') throw new PiankeError('邀请码无效', ERROR_CODES.INVITE_CODE_INVALID)
        if (invite.expires_at && safeInt(invite.expires_at) < timestamp) throw new PiankeError('邀请码已过期', ERROR_CODES.INVITE_CODE_EXPIRED)
        if (String(invite.created_by || '').startsWith('user:')) {
          const inviterUid = String(invite.created_by).slice('user:'.length)
          inviter = await findUser(transaction, inviterUid)
          if (!inviter || inviter.activation_status !== 'activated') throw new PiankeError('邀请码所属邀请人尚未激活', ERROR_CODES.INVITE_CODE_NOT_ACTIVATED)
          if (String(inviter._id) === String(uid)) throw new PiankeError('不能使用自己的邀请码', ERROR_CODES.INVITE_CODE_INVALID)
        }
        const currentUses = safeInt(invite.current_uses)
        const maxUses = safeInt(invite.max_uses, -1)
        if (maxUses !== -1 && currentUses >= maxUses) throw new PiankeError('邀请码使用次数已达上限', ERROR_CODES.INVITE_CODE_EXCEEDED)
        invite.currentUses = currentUses
      } else {
        const inviterResult = await transaction.collection('user').where({ invite_code: inviteCode, activation_status: 'activated' }).limit(1).get()
        inviter = inviterResult.data?.[0]
        if (!inviter) throw new PiankeError('邀请码无效或邀请人未激活', ERROR_CODES.INVITE_CODE_NOT_ACTIVATED)
        if (String(inviter._id) === String(uid)) throw new PiankeError('不能使用自己的邀请码', ERROR_CODES.INVITE_CODE_INVALID)
        inviteType = 'personal'
        invite = { code: inviteCode, reward_gold: null }
      }

      const configured = await getOperationConfig('invite_reward_gold', INVITE_CONFIG.DEFAULT_REWARD_GOLD)
      const rewardGold = Math.max(0, safeInt(invite.reward_gold, safeInt(configured?.gold ?? configured, INVITE_CONFIG.DEFAULT_REWARD_GOLD)))
      const grantId = stableId('grant', transId)
      await transaction.collection('user').doc(uid).update({ activation_status: 'activated', invited_by: inviteCode, invite_bind_used: true, last_invite_code_check_at: timestamp, updated_at: timestamp })
      if (inviteType === 'whitelist') {
        await transaction.collection('invite_code_whitelist').doc(invite._id).update({ current_uses: invite.currentUses + 1, updated_at: timestamp })
      }
      await addLedger({ db: transaction, uid, delta: rewardGold, business_type: 'invite', order_id: transId, idempotency_key: `activation_ledger:${transId}`, remark: `邀请码激活奖励：${inviteCode}` })
      await addRewardGrant({ db: transaction, _id: grantId, trans_id: transId, order_id: `invite_activation:${transId}`, user_id: uid, grant_type: 'invite_activation', gold_amount: rewardGold, time_amount: 0, scene: 'activation', release_version: RELEASE, created_at: timestamp })
      await addInviteAttemptLog({ db: transaction, _id: stableId('invite_attempt', transId), event_id: transId, user_id: uid, code_input: inviteCode, result: 'success', ip_address: ipAddress, device_id: deviceId, release_version: RELEASE, created_at: timestamp })
      const updated = await findUser(transaction, uid)
      return { user: updated, rewardGold }
    })

    return { code: ERROR_CODES.SUCCESS, message: `激活成功，已发放${result.rewardGold}金币`, data: { ...buildAssetPayload(result.user), reward_gold: result.rewardGold } }
  } catch (error) {
    console.error('[activateWithInviteCode] failed', { uid, inviteCode, transId, code: error.code, message: error.message })
    return { code: Number(error.code) || ERROR_CODES.SYSTEM_ERROR, message: error.message || '激活失败' }
  }
}
