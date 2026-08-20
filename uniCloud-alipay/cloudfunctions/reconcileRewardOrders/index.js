'use strict'

const {
  ERROR_CODES, requestId, clientIp, safeAdminSecretCompare, processRewardedVideoCallback, now
} = require('pianke-common')

function isStrongSecret(value) {
  const secret = String(value || '')
  return secret.length >= 32 && secret.length <= 512 && new Set(secret).size >= 12
}

exports.main = async (event = {}, context = {}) => {
  const request_id = requestId(event, context)
  const ip = clientIp(context)
  const configuredSecret = String(process.env.PIANKE_ADMIN_KEY || process.env.UNICLOUD_ADMIN_KEY || '').trim()
  const token = String(event.admin_token || '').trim()
  const isEnabledTimer = String(process.env.PIANKE_RECONCILE_TIMER_ENABLED || '').toLowerCase() === 'true'
  const isPlatformTimer = String(context.triggerType || context.trigger_type || '').toLowerCase() === 'timer'
  const authorized = isEnabledTimer && isPlatformTimer
    ? true
    : isStrongSecret(configuredSecret) && safeAdminSecretCompare(configuredSecret, token)
  if (!authorized) {
    return { code: ERROR_CODES.ADMIN_UNAUTHORIZED, message: '管理鉴权失败', data: { request_id } }
  }

  const db = uniCloud.database()
  const orderId = String(event.order_id || '').trim()
  const limit = Math.min(Math.max(Number(event.limit) || 20, 1), 100)
  const recoverableStatuses = ['created', 'client_completed', 'verifying', 'verified', 'pending_review']
  const query = { status: db.command.in(recoverableStatuses) }
  if (orderId) query.order_id = orderId
  try {
    const result = await db.collection('reward_orders').where(query).orderBy('updated_at', 'asc').limit(limit).get()
    const outcomes = []
    for (const order of result.data || []) {
      // 没有官方 trans_id 时不能伪造回调，也不能把“等待外部证据”误报为失败。
      if (!String(order.trans_id || '').trim()) {
        outcomes.push({ order_id: order.order_id, status: 'awaiting_external_evidence' })
        continue
      }
      try {
        outcomes.push(await processRewardedVideoCallback({
          user_id: order.uid,
          order_id: order.order_id,
          trans_id: order.trans_id,
          adpid: order.adpid,
          scene: order.scene,
          extra: { order_id: order.order_id, scene: order.scene }
        }))
      } catch (error) {
        await db.collection('reward_orders').doc(order._id).update({
          reconciliation_status: 'mismatch',
          reconciliation_note: String(error.message || 'reconciliation failed').slice(0, 200),
          updated_at: now()
        })
        outcomes.push({ order_id: order.order_id, status: 'mismatch', code: Number(error.code) || ERROR_CODES.SYSTEM_ERROR })
      }
    }
    return { code: ERROR_CODES.SUCCESS, message: '对账完成', data: { request_id, ip, processed: outcomes.length, outcomes } }
  } catch (error) {
    console.error('[reconcileRewardOrders] failed', { request_id, error_stack: String(error.stack || error.message || error) })
    return { code: Number(error.code) || ERROR_CODES.SYSTEM_ERROR, message: '对账失败', data: { request_id } }
  }
}
