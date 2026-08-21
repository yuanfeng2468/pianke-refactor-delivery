'use strict'
const { ERROR_CODES, now, runTransaction, addAdLog, AD_EVENTS } = require('pianke-common')

exports.main = async (event = {}, context = {}) => {
  const request_id = String(context.requestId || event.request_id || '')
  const triggerType = String(context.triggerType || context.trigger_type || '').toLowerCase()
  if (triggerType !== 'timer') {
    return { code: ERROR_CODES.ADMIN_UNAUTHORIZED, message: '仅允许定时任务调用', data: { request_id } }
  }
  try {
    const db = uniCloud.database()
    const timestamp = now()
    let totalUpdated = 0
    let hasMore = true
    let batchCount = 0
    const maxBatches = 10 // 最多循环10次（单次100条，单次执行最多清理1000条，防止超时）

    while (hasMore && batchCount < maxBatches) {
      batchCount++
      const expiredResult = await db.collection('feed_exposure_session')
        .where({
          status: db.command.in(['issued', 'active']),
          expires_at: db.command.lt(timestamp)
        })
        .limit(100)
        .get()

      const sessions = expiredResult.data || []
      if (sessions.length === 0) {
        hasMore = false
        break
      }

      for (const session of sessions) {
        const updated = await runTransaction(async (transaction) => {
          const updateRes = await transaction.collection('feed_exposure_session').where({
            _id: session._id,
            status: db.command.in(['issued', 'active'])
          }).update({
            status: 'expired',
            result: { session_id: session.session_id || session._id, status: 'expired', reason: 'timeout_expired' },
            updated_at: timestamp
          })
          if (!(updateRes && (updateRes.updated > 0 || updateRes.updated === undefined))) return false
          await addAdLog({
            db: transaction,
            event_id: `feed_expired:${session.session_id || session._id}_${timestamp}`,
            user_id: session.user_id,
            adpid: session.adpid || '',
            scene: session.scene || 'coin_page_feed',
            event_type: AD_EVENTS.EXPOSURE_EXPIRED,
            status: 'success',
            trans_id: session.session_id || session._id,
            meta: { session_id: session.session_id || session._id, reason: 'timeout_expired' },
            created_at: timestamp
          })
          return true
        })
        if (updated) totalUpdated += 1
      }

      if (sessions.length < 100) {
        hasMore = false
      }
    }

    return { code: ERROR_CODES.SUCCESS, message: '清理完成', data: { updated_count: totalUpdated, batches: batchCount } }
  } catch (error) {
    console.error('[cleanupFeedSessions] failed', error)
    return { code: ERROR_CODES.SYSTEM_ERROR, message: error.message || '清理失败' }
  }
}
