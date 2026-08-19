'use strict'

const { 
  requireAuth, assertRequestedUid, ERROR_CODES, PiankeError, 
  findUser, runTransaction, safeInt, now, buildAssetPayload, checkRateLimit, addRelaxationLedger
} = require('pianke-common')

exports.main = async (event = {}, context = {}) => {
  const requestedUid = String(event.uid || '').trim()
  const incrementSeconds = Math.max(0, safeInt(event.increment_seconds || 0))
  const idempotencyKey = String(event.idempotency_key || '').trim()
  const timestamp = now()
  const db = uniCloud.database()

  // 1. 基础校验：允许离线队列合并提交，服务端余额校验决定实际可结算时长。
  if (incrementSeconds <= 0 || incrementSeconds > 86400) {
    return { code: ERROR_CODES.SUCCESS, message: '无需同步' }
  }

  try {
    if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 128) {
      throw new PiankeError('缺少有效结算幂等键', ERROR_CODES.INVALID_PARAMS)
    }
    const auth = await requireAuth(event, context)
    const uid = assertRequestedUid(requestedUid, auth.uid)
    
    // 2. 频率限制：每 10 秒最多同步一次
    await checkRateLimit(`sync_relax:${uid}`, 1, 10)

    let responsePayload = null

    await runTransaction(async (transaction) => {
      const user = await findUser(transaction, uid)
      if (!user) throw new PiankeError('用户不存在', ERROR_CODES.USER_NOT_FOUND)

      const currentBalance = safeInt(user.relaxation_time)

      // 服务端余额校验：客户端只能结算已经存在的放松时长。
      if (currentBalance + 5 < incrementSeconds) {
        throw new PiankeError('放松时长已耗尽', ERROR_CODES.INSUFFICIENT_GOLD)
      }

      const actualDeduct = Math.min(currentBalance, incrementSeconds)
      if (actualDeduct <= 0) throw new PiankeError('放松时长已耗尽', ERROR_CODES.INSUFFICIENT_GOLD)

      // 放松时长通过不可变账本扣减；余额与账本必须在同一事务提交。
      await addRelaxationLedger({
        db: transaction,
        uid,
        deltaSeconds: -actualDeduct,
        business_type: 'relax_consume',
        order_id: `relax:${uid}:${idempotencyKey}`,
        idempotency_key: `relax_consume:${idempotencyKey}`,
        remark: '客户端放松时长结算'
      })

      await transaction.collection('user').doc(uid).update({
        total_relaxation_seconds: db.command.inc(actualDeduct),
        updated_at: timestamp
      })

      const updatedUser = await findUser(transaction, uid)
      responsePayload = buildAssetPayload(updatedUser, timestamp)
    })

    return { code: ERROR_CODES.SUCCESS, data: responsePayload }
  } catch (error) {
    console.error('[syncRelaxStats] failed', { user_id: requestedUid, trace_id: idempotencyKey, error_stack: String(error.stack || error.message || error) })
    return { code: error.code || ERROR_CODES.SYSTEM_ERROR, message: error.message }
  }
}
