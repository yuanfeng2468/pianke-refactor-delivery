'use strict'

const { PiankeError, ERROR_CODES } = require('./constants')
const { findUser, now, safeInt, stableId } = require('./utils')

/**
 * 核心账本与资产变动函数
 * 支持独立模式（乐观锁轮询）和事务模式（传入 transaction）
 */
async function addLedger({ db, uid, delta, business_type, order_id = '', idempotency_key, remark = '' }) {
  if (!db || !uid || !business_type) throw new PiankeError('流水参数无效', ERROR_CODES.INVALID_PARAMS)
  
  const key = String(idempotency_key || order_id || stableId('ledger', now())).trim()
  const change = safeInt(delta)
  const timestamp = now()
  
  // 判断是否处于事务中 (事务对象通常没有 startTransaction 方法但有 collection)
  const isTransaction = typeof db.commit !== 'undefined' || (db._transactionId)

  if (isTransaction) {
    // 事务模式：直接在事务中执行，不使用乐观锁循环
    const existing = await db.collection('wallet_ledger').where({ idempotency_key: key }).limit(1).get()
    if (existing.data?.length) {
      const ledger = existing.data[0]
      if (String(ledger.uid) !== String(uid) || safeInt(ledger.delta) !== change || String(ledger.business_type) !== String(business_type)) {
        throw new PiankeError('钱包幂等键冲突', ERROR_CODES.INVALID_PARAMS)
      }
      return ledger
    }

    const user = await findUser(db, uid)
    if (!user) throw new PiankeError('用户不存在', ERROR_CODES.USER_NOT_FOUND)
    if (String(user.account_status || 'active') === 'disabled') throw new PiankeError('账户已被限制使用', ERROR_CODES.RISK_BLOCKED)
    
    const before_balance = safeInt(user.gold_balance)
    const after_balance = before_balance + change
    if (after_balance < 0) throw new PiankeError('金币不足', ERROR_CODES.INSUFFICIENT_BALANCE)

    const ledger = {
      _id: stableId('ledger', key),
      uid, user_id: uid, before_balance, delta: change, after_balance,
      business_type, order_id: String(order_id || ''), idempotency_key: key, 
      remark, created_at: timestamp
    }

    // 在事务中更新余额 (使用原子加法，因为事务本身保证了隔离性)
    await db.collection('user').doc(uid).update({
      gold_balance: uniCloud.database().command.inc(change),
      updated_at: timestamp
    })

    await db.collection('wallet_ledger').doc(ledger._id).set(ledger)
    return ledger
  } else {
    throw new PiankeError('资产账本必须在事务中执行', ERROR_CODES.SYSTEM_ERROR)
  }
}

module.exports = { addLedger }
