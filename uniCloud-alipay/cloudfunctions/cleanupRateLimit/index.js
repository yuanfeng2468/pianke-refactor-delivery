'use strict'

const { RELEASE, now, addSecurityAuditLog } = require('pianke-common')

exports.main = async (event = {}, context = {}) => {
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
      request_id: context.requestId || `cron_${timestamp}`,
      ip_address: '127.0.0.1',
      meta: { deleted_count: deletedCount, threshold }
    })
  } catch (err) {
    console.error('[cleanupRateLimit] failed:', err.message)
    return { code: 500, message: err.message, release: RELEASE }
  }

  return { code: 0, message: 'success', deleted_count: deletedCount, release: RELEASE }
}
