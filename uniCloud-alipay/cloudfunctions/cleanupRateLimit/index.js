'use strict'

const { ERROR_CODES, RELEASE, now, addSecurityAuditLog } = require('pianke-common')

exports.main = async (event = {}, context = {}) => {
  const request_id = String(context.requestId || event.request_id || '')
  const triggerType = String(context.triggerType || context.trigger_type || '').toLowerCase()
  if (triggerType !== 'timer') {
    return { code: ERROR_CODES.ADMIN_UNAUTHORIZED, message: '仅允许定时任务调用', data: { request_id, release: RELEASE } }
  }
  const db = uniCloud.database()
  const timestamp = now()
  const retentionMs = 24 * 60 * 60 * 1000 // Keep rate limit records for 24 hours
  const threshold = timestamp - retentionMs

  let deletedCount = 0
  try {
    const res = await db.collection('rate_limit').where({
      window_start: db.command.lt(threshold)
    }).remove()

    deletedCount = res.deleted || res.affectedDocs || 0

    await addSecurityAuditLog({
      event_id: `cleanup_rate_limit:${timestamp}`,
      action: 'cleanup_rate_limit',
      severity: 'low',
      result: 'success',
      actor_type: 'system',
      request_id: request_id || `cron_${timestamp}`,
      ip_address: '127.0.0.1',
      meta: { deleted_count: deletedCount, threshold }
    })
  } catch (err) {
    console.error('[cleanupRateLimit] failed:', err.message)
    return { code: ERROR_CODES.SYSTEM_ERROR, message: '清理失败', data: { request_id }, release: RELEASE }
  }

  return { code: ERROR_CODES.SUCCESS, message: 'success', data: { deleted_count: deletedCount, request_id }, release: RELEASE }
}
