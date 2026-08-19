const {
  ERROR_CODES,
  requireAuth,
  assertRequestedUid,
  getIdempotencyKey,
  addAdLog,
  addSecurityAuditLog,
  requestId,
  clientIp,
  clientDeviceId,
  now,
  safeInt
} = require('pianke-common')

async function auditSafely(record) {
  try {
    await addSecurityAuditLog(record)
  } catch (error) {
    console.error('[addAdReward] audit failed', { action: record.action, message: error.message })
  }
}

exports.main = async (event = {}, context = {}) => {
  const requestedUid = String(event.uid || '').trim()
  const rid = requestId(event, context)
  const ip = clientIp(context)
  const deviceId = clientDeviceId(event, context)
  try {
    const auth = await requireAuth(event, context)
    const uid = assertRequestedUid(requestedUid, auth.uid)
    const transId = getIdempotencyKey(event)
    if (!transId || transId.length < 8) {
      await auditSafely({ event_id: `direct_reward_invalid:${rid}`, action: 'client_direct_reward_rejected', severity: 'high', result: 'rejected', actor_type: 'client', actor_id: uid, user_id: uid, request_id: rid, ip_address: ip, device_id: deviceId, resource: 'rewarded_video', meta: { reason: 'missing_transaction_id' } })
      return { code: ERROR_CODES.INVALID_PARAMS, message: '缺少有效广告交易标识' }
    }
    await addAdLog({
      _id: `unverified_${uid}_${transId}`.slice(0, 120),
      event_id: `unverified_reward:${transId}`,
      user_id: uid,
      adpid: String(event.adpid || '').trim(),
      scene: String(event.scene || '').trim(),
      event_type: 'reward_fail',
      status: 'skipped',
      trans_id: transId,
      reward_amount: Math.max(0, safeInt(event.reward_amount)),
      reward_time: Math.max(0, safeInt(event.reward_time)),
      ip_address: ip,
      device_id: deviceId,
      meta: { reason: 'client_direct_reward_disabled' },
      created_at: now()
    })
    await auditSafely({ event_id: `direct_reward_rejected:${transId}`, action: 'client_direct_reward_rejected', severity: 'critical', result: 'rejected', actor_type: 'client', actor_id: uid, user_id: uid, request_id: rid, ip_address: ip, device_id: deviceId, resource: 'rewarded_video', meta: { reason: 'server_callback_required' } })
    return { code: ERROR_CODES.AD_REWARD_UNVERIFIED, message: '奖励必须由广告平台服务端回调验证后发放' }
  } catch (error) {
    await auditSafely({ event_id: `direct_reward_failed:${rid}`, action: 'client_direct_reward_failed', severity: 'high', result: 'error', actor_type: 'client', request_id: rid, ip_address: ip, device_id: deviceId, resource: 'rewarded_video', meta: { code: Number(error.code) || ERROR_CODES.SYSTEM_ERROR, message: String(error.message || '').slice(0, 200) } })
    return { code: Number(error.code) || ERROR_CODES.SYSTEM_ERROR, message: error.message || '奖励验证失败' }
  }
}
