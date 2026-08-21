'use strict'

const { PiankeError, ERROR_CODES } = require('./constants')
const { findUser, now, safeInt, stableId } = require('./utils')

/**
 * 放松时长账本：所有 relaxation_time 的增加/扣减必须经过这里。
 * 必须在事务中调用，避免“余额已改、账本未写”的半成功状态。
 */
async function addRelaxationLedger({ db, uid, deltaSeconds, business_type, order_id = '', idempotency_key, remark = '' }) {
  if (!db || !uid || !business_type) {
    throw new PiankeError('放松时长流水参数无效', ERROR_CODES.INVALID_PARAMS)
  }

  const key = String(idempotency_key || order_id || '').trim()
  if (!key) throw new PiankeError('缺少放松时长幂等键', ERROR_CODES.INVALID_PARAMS)

  const change = safeInt(deltaSeconds)
  if (change === 0) {
    const user = await findUser(db, uid)
    if (!user) throw new PiankeError('用户不存在', ERROR_CODES.USER_NOT_FOUND)
    if (String(user.account_status || 'active') === 'disabled') throw new PiankeError('账户已被限制使用', ERROR_CODES.RISK_BLOCKED)
    return { _id: stableId('relax_ledger', key), uid, before_seconds: safeInt(user.relaxation_time), delta_seconds: 0, after_seconds: safeInt(user.relaxation_time), business_type, order_id: String(order_id || ''), idempotency_key: key }
  }

  const existing = await db.collection('relaxation_ledger').where({ idempotency_key: key }).limit(1).get()
  if (existing.data?.length) {
    const ledger = existing.data[0]
    if (String(ledger.uid) !== String(uid) || safeInt(ledger.delta_seconds) !== change) {
      throw new PiankeError('放松时长幂等键冲突', ERROR_CODES.INVALID_PARAMS)
    }
    return ledger
  }

  const user = await findUser(db, uid)
  if (!user) throw new PiankeError('用户不存在', ERROR_CODES.USER_NOT_FOUND)
  if (String(user.account_status || 'active') === 'disabled') throw new PiankeError('账户已被限制使用', ERROR_CODES.RISK_BLOCKED)

  const before = safeInt(user.relaxation_time)
  const after = before + change
  if (after < 0) throw new PiankeError('放松时长不足', ERROR_CODES.INSUFFICIENT_GOLD)

  const timestamp = now()
  const ledger = {
    _id: stableId('relax_ledger', key),
    uid,
    before_seconds: before,
    delta_seconds: change,
    after_seconds: after,
    business_type,
    order_id: String(order_id || ''),
    idempotency_key: key,
    remark: String(remark || '').slice(0, 500),
    created_at: timestamp
  }

  // 事务内：余额与账本必须同时提交。
  await db.collection('user').doc(uid).update({
    relaxation_time: uniCloud.database().command.inc(change),
    updated_at: timestamp,
    last_relax_sync_at: timestamp
  })
  await db.collection('relaxation_ledger').doc(ledger._id).set(ledger)
  return ledger
}

module.exports = { addRelaxationLedger }
