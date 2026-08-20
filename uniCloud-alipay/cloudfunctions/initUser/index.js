'use strict'

const {
  ERROR_CODES,
  INVITE_CONFIG,
  createUserInTransaction,
  createUserSession,
  requireAuth,
  requestId,
  clientIp,
  clientDeviceId,
  requestToken,
  checkRateLimit,
  runTransaction,
  addSecurityAuditLog,
  stableId,
  now,
  buildAssetPayload,
  RELEASE
} = require('pianke-common')

async function auditSafely(record) {
  try {
    await addSecurityAuditLog({ ...record, release_version: RELEASE.cloud_module_version })
  } catch (error) {
    console.error('[initUser] audit_failed', { action: record.action, message: error.message })
  }
}

async function ensurePersonalInviteWhitelist(transaction, user, timestamp) {
  const code = String(user?.invite_code || '').trim().toUpperCase()
  if (!code || !user?._id) return false
  const existing = await transaction.collection('invite_code_whitelist').where({ code }).limit(1).get()
  if (existing.data?.length) return false
  const recordId = stableId('invite_whitelist', code)
  await transaction.collection('invite_code_whitelist').doc(recordId).set({
    _id: recordId,
    code,
    status: 'active',
    max_uses: -1,
    current_uses: 0,
    created_by: `user:${user._id}`,
    created_at: timestamp,
    reward_gold: INVITE_CONFIG.DEFAULT_REWARD_GOLD,
    description: '用户个人邀请码'
  })
  return true
}

exports.main = async (event = {}, context = {}) => {
  const rid = requestId(event, context)
  const ip = clientIp(context)
  const deviceId = clientDeviceId(event, context)
  const startedAt = now()

  try {
    const token = requestToken(event, context)
    if (token) {
      try {
        const auth = await requireAuth(event, context)
        await auditSafely({
          event_id: `session_reuse:${rid}`,
          action: 'user_session_reused',
          severity: 'info',
          result: 'success',
          actor_type: 'client',
          actor_id: auth.uid,
          user_id: auth.uid,
          request_id: rid,
          ip_address: ip,
          device_id: deviceId,
          resource: 'user_session'
        })
        return { code: ERROR_CODES.SUCCESS, message: '初始化成功', data: { ...buildAssetPayload(auth.user), auth_token: token } }
      } catch (sessionError) {
        if (Number(sessionError.code) !== ERROR_CODES.AUTH_REQUIRED && Number(sessionError.code) !== 401) throw sessionError
        await auditSafely({
          event_id: `session_expired:${rid}`,
          action: 'user_session_expired_rebootstrap',
          severity: 'info',
          result: 'rebootstrap',
          actor_type: 'client',
          request_id: rid,
          ip_address: ip,
          device_id: deviceId,
          resource: 'user_session',
          meta: { previous_error: String(sessionError.message || '').slice(0, 120) }
        })
      }
    }

    if (!deviceId || deviceId.length < 8) return { code: ERROR_CODES.INVALID_PARAMS, message: '缺少有效设备标识' }
    await checkRateLimit(`bootstrap:${deviceId}:${ip}`, 3, 3600)

    const db = uniCloud.database()
    const existing = await db.collection('user').where({ device_id: deviceId }).limit(1).get()
    const existingUser = existing.data?.[0] || null
    const timestamp = now()
    let inviteWhitelistCreated = false
    const user = await runTransaction(async (transaction) => {
      const createdUser = await createUserInTransaction(transaction, deviceId)
      inviteWhitelistCreated = await ensurePersonalInviteWhitelist(transaction, createdUser, timestamp)
      return createdUser
    }, { retries: 2 })
    const session = await createUserSession(user._id, deviceId)
    const ipChanged = Boolean(existingUser && existingUser.last_bootstrap_ip && ip && existingUser.last_bootstrap_ip !== ip)
    await db.collection('user').doc(user._id).update({ last_bootstrap_ip: ip, last_bootstrap_at: timestamp, updated_at: timestamp })

    await auditSafely({
      event_id: `user_bootstrap:${rid}`,
      action: ipChanged ? 'device_binding_ip_changed' : 'user_bootstrap_completed',
      severity: ipChanged ? 'high' : 'info',
      result: 'success',
      actor_type: 'client',
      actor_id: user._id,
      user_id: user._id,
      request_id: rid,
      ip_address: ip,
      device_id: deviceId,
      resource: 'user',
      meta: { newly_created: !existingUser, invite_whitelist_created: inviteWhitelistCreated, ip_changed: ipChanged, elapsed_ms: Math.max(0, now() - startedAt) }
    })

    return { code: ERROR_CODES.SUCCESS, message: '初始化成功', data: { ...buildAssetPayload({ ...user, updated_at: timestamp }), auth_token: session.token } }
  } catch (error) {
    await auditSafely({
      event_id: `user_bootstrap_failed:${rid}`,
      action: 'user_bootstrap_failed',
      severity: 'error',
      result: 'error',
      actor_type: 'client',
      request_id: rid,
      ip_address: ip,
      device_id: deviceId,
      resource: 'user',
      meta: { code: Number(error.code) || ERROR_CODES.SYSTEM_ERROR, message: String(error.message || '').slice(0, 200) }
    })
    console.error('[initUser] failed', { request_id: rid, code: error.code, message: error.message })
    return { code: Number(error.code) || ERROR_CODES.SYSTEM_ERROR, message: error.message || '初始化失败' }
  }
}
