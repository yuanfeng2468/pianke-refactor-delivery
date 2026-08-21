'use strict'

const {
  COUPON_CONFIG, ERROR_CODES, PiankeError, requireAuth, assertRequestedUid, findUser,
  checkAndResetDaily, getOperationConfig, runTransaction, addLedger, writeLog,
  checkRateLimit, safeInt, now, getBusinessDate, stableId, getIdempotencyKey, buildAssetPayload,
  addRelaxationLedger, RELEASE
} = require('pianke-common')

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

    // 2. 配置读取 (对齐 constants.js)
    const configured = await getOperationConfig(`coupon_${couponType}`, {})
    const cost = Math.max(0, safeInt(configured?.cost || configured?.gold_cost, coupon.gold_cost))
    const time = Math.max(0, safeInt(configured?.time || configured?.relax_seconds, coupon.relax_seconds))
    const dailyLimit = Math.max(0, safeInt(configured?.dailyLimit || configured?.daily_limit, coupon.daily_limit))
    const todayField = couponType === '15min' ? 'coupon_15min_today' : 'coupon_60min_today'
    const dailyField = couponType === '15min' ? 'coupon_15min_count' : 'coupon_60min_count'
    const couponName = couponType === '15min' ? '15分钟放松卡' : '60分钟放松卡'
    const timestamp = now()
    const businessDate = getBusinessDate(timestamp)
    const dailyStatsId = stableId('daily_stats', `${uid}:${businessDate}`)

    const result = await runTransaction(async (transaction) => {
      // 幂等检查必须位于同一事务内，避免并发请求在事务外同时读到“未处理”。
      const existingResult = await transaction.collection('exchange_record')
        .where({ trans_id: transId, user_id: uid }).limit(1).get()
      const existing = existingResult.data?.[0] || existingResult.data
      if (existing) {
        if (String(existing.exchange_type || '') !== couponType) {
          throw new PiankeError('兑换幂等键与兑换类型不匹配', ERROR_CODES.INVALID_PARAMS)
        }
        return { user: await findUser(transaction, uid), replayed: true }
      }

      const user = await findUser(transaction, uid)
      if (!user) throw new PiankeError('用户不存在', ERROR_CODES.USER_NOT_FOUND)
      if (user.activation_status !== 'activated') throw new PiankeError('账户尚未激活', ERROR_CODES.INVITE_CODE_NOT_ACTIVATED)
      
      const reset = checkAndResetDaily(user, timestamp)
      const statsCollection = transaction.collection('user_daily_stats')
      const statsResult = await statsCollection.doc(dailyStatsId).get()
      const stats = statsResult.data?.[0] || statsResult.data || null
      const currentDailyCount = safeInt(stats?.[dailyField])
      // 4. 校验上限与余额；user_daily_stats 是跨设备、跨请求的唯一业务日来源。
      if (currentDailyCount >= dailyLimit) throw new PiankeError(`今日${couponName}已达兑换上限`, ERROR_CODES.DAILY_LIMIT_REACHED)
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

      // 6. 更新业务日统计，并同步旧字段供老客户端展示；资产仍由不可变账本维护。
      if (!stats) {
        await statsCollection.doc(dailyStatsId).set({ _id: dailyStatsId, user_id: uid, business_date: businessDate, ad_count: 0, feed_count: 0, interstitial_count: 0, coupon_15min_count: 0, coupon_60min_count: 0, checkin_completed: false, created_at: timestamp, updated_at: timestamp })
      }
      await statsCollection.doc(dailyStatsId).update({ [dailyField]: uniCloud.database().command.inc(1), updated_at: timestamp })
      await transaction.collection('user').doc(uid).update({ ...reset.patch, [todayField]: currentDailyCount + 1, coupon_date: businessDate, updated_at: timestamp })
      
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
      
      return { user: await findUser(transaction, uid), replayed: false }
    }, { retries: 2 })

    return {
      code: ERROR_CODES.SUCCESS,
      message: result.replayed ? '兑换已处理' : `成功兑换${couponName}`,
      data: buildAssetPayload(result.user, timestamp)
    }
  } catch (error) {
    console.error('[exchangeCoupon] failed', { uid, transId, code: error.code, message: error.message })
    return { code: Number(error.code) || ERROR_CODES.SYSTEM_ERROR, message: error.message || '兑换失败' }
  }
}
