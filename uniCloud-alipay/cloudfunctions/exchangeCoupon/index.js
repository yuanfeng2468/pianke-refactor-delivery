'use strict'

const {
  COUPON_CONFIG, ERROR_CODES, PiankeError, requireAuth, assertRequestedUid, findUser,
  checkAndResetDaily, getOperationConfig, runTransaction, addLedger, writeLog,
  checkRateLimit, safeInt, now, getIdempotencyKey, buildAssetPayload,
  latestAssetPayload, addRelaxationLedger
} = require('pianke-common')

const RELEASE = 'pianke-common@3.1.0'

exports.main = async (event = {}, context = {}) => {
  const couponType = String(event.couponType || event.coupon_type || '').trim()
  const coupon = COUPON_CONFIG[couponType]
  const transId = getIdempotencyKey(event)
  let uid = ''

  try {
    if (!coupon || !transId) throw new PiankeError('兑换参数无效', ERROR_CODES.INVALID_PARAMS)
    const auth = await requireAuth(event, context)
    uid = auth.uid
    assertRequestedUid(event, uid)
    
    // 1. 频率限制
    await checkRateLimit(`exchange:${uid}`, 5, 60)

    // 2. 幂等性检查
    const db = uniCloud.database()
    const existing = await db.collection('exchange_record').where({ trans_id: transId, user_id: uid }).limit(1).get()
    if (existing.data?.length) return { code: ERROR_CODES.SUCCESS, message: '兑换已处理', data: await latestAssetPayload(uid) }

    // 3. 配置读取 (对齐 constants.js)
    const configured = await getOperationConfig(`coupon_${couponType}`, {})
    const cost = Math.max(0, safeInt(configured?.cost || configured?.gold_cost, coupon.gold_cost))
    const time = Math.max(0, safeInt(configured?.time || configured?.relax_seconds, coupon.relax_seconds))
    const dailyLimit = Math.max(0, safeInt(configured?.dailyLimit || configured?.daily_limit, coupon.daily_limit))
    const todayField = couponType === '15min' ? 'coupon_15min_today' : 'coupon_60min_today'
    const couponName = couponType === '15min' ? '15分钟放松卡' : '60分钟放松卡'
    const timestamp = now()

    const result = await runTransaction(async (transaction) => {
      const user = await findUser(transaction, uid)
      if (!user) throw new PiankeError('用户不存在', ERROR_CODES.USER_NOT_FOUND)
      if (user.activation_status !== 'activated') throw new PiankeError('账户尚未激活', ERROR_CODES.INVITE_CODE_NOT_ACTIVATED)
      
      const reset = checkAndResetDaily(user, timestamp)
      const current = { ...user, ...reset.patch }
      
      // 4. 校验上限与余额
      if (safeInt(current[todayField]) >= dailyLimit) throw new PiankeError(`今日${couponName}已达兑换上限`, ERROR_CODES.DAILY_LIMIT_REACHED)
      if (safeInt(current.gold_balance) < cost) throw new PiankeError('金币余额不足', ERROR_CODES.INSUFFICIENT_GOLD)
      
      // 5. 核心：通过 addLedger 统一扣除金币并记录流水 (addLedger 内部会更新 user.gold_balance)
      await addLedger({ 
        db: transaction, 
        uid, 
        delta: -cost, 
        business_type: 'exchange', 
        order_id: transId, 
        idempotency_key: `exchange_ledger:${transId}`, 
        remark: `兑换${couponName}` 
      })
      
      await addRelaxationLedger({
        db: transaction,
        uid,
        deltaSeconds: time,
        business_type: 'exchange',
        order_id: transId,
        idempotency_key: `exchange_time:${transId}`,
        remark: `兑换${couponName}放松时长`
      })

      // 6. 只更新非资产字段，避免覆盖并发中的 relaxation_time。
      await transaction.collection('user').doc(uid).update({
        ...reset.patch,
        [todayField]: safeInt(current[todayField]) + 1,
        updated_at: timestamp
      })
      
      // 7. 写入兑换记录
      await writeLog('exchange_record', { 
        trans_id: transId, 
        user_id: uid, 
        exchange_type: couponType, 
        gold_consumed: cost, 
        time_added: time, 
        release_version: RELEASE, 
        created_at: timestamp 
      }, transaction)
      
      return await findUser(transaction, uid)
    }, { retries: 2 })

    return { code: ERROR_CODES.SUCCESS, message: `成功兑换${couponName}`, data: buildAssetPayload(result, timestamp) }
  } catch (error) {
    console.error('[exchangeCoupon] failed', { uid, transId, code: error.code, message: error.message })
    return { code: Number(error.code) || ERROR_CODES.SYSTEM_ERROR, message: error.message || '兑换失败' }
  }
}
