'use strict'
const { 
  ERROR_CODES, PiankeError, CHECKIN_CONFIG, getTodayString, getYesterdayString,
  findUser, runTransaction, addLedger, getIdempotencyKey, safeInt, now,
  buildAssetPayload, requireAuth, assertRequestedUid, getOperationConfig 
} = require('pianke-common')

exports.main = async (event = {}, context = {}) => {
  let uid = ''
  try {
    const auth = await requireAuth(event, context)
    uid = assertRequestedUid(event, auth.uid)
    
    const today = getTodayString()
    const yesterday = getYesterdayString()
    const transId = getIdempotencyKey(event) || `checkin:${uid}:${today}`
    const timestamp = now()
    const db = uniCloud.database()
    const configuredRewards = await getOperationConfig('checkin_rewards', [10, 20, 30, 50, 80, 100, 200])
    const rewardSchedule = Array.isArray(configuredRewards)
      ? configuredRewards.map((value) => Math.max(0, safeInt(value))).slice(0, CHECKIN_CONFIG.MAX_CONTINUOUS)
      : [10, 20, 30, 50, 80, 100, 200]
    while (rewardSchedule.length < CHECKIN_CONFIG.MAX_CONTINUOUS) rewardSchedule.push(rewardSchedule[rewardSchedule.length - 1] || 0)

    // 基础幂等检查
    const exists = await db.collection('wallet_ledger').where({ uid, idempotency_key: `checkin_ledger:${transId}` }).limit(1).get()
    if (exists.data?.length) {
      const user = await findUser(db, uid)
      return { code: ERROR_CODES.SUCCESS, message: '今日已签到', data: buildAssetPayload(user, timestamp) }
    }

    let rewardGold = 0
    let continuousDays = 0
    let finalUser = null

    await runTransaction(async (transaction) => {
      const user = await findUser(transaction, uid)
      if (!user) throw new PiankeError('用户不存在', ERROR_CODES.USER_NOT_FOUND)
      
      if (user.last_checkin_date === today) {
        throw new PiankeError('今日已签到', ERROR_CODES.DAILY_LIMIT_REACHED)
      }

      // 计算连签天数
      continuousDays = user.last_checkin_date === yesterday ? (safeInt(user.continuous_checkin) % CHECKIN_CONFIG.MAX_CONTINUOUS) + 1 : 1
      rewardGold = rewardSchedule[continuousDays - 1] || 0

      // 更新用户非金币状态
      await transaction.collection('user').doc(uid).update({
        continuous_checkin: continuousDays,
        last_checkin_date: today,
        updated_at: timestamp
      })

      // 统一通过 addLedger 处理金币变动与流水记录 (原子闭环)
      await addLedger({
        db: transaction, uid, delta: rewardGold, business_type: 'checkin',
        order_id: transId, idempotency_key: `checkin_ledger:${transId}`,
        remark: `每日签到第${continuousDays}天`
      })

      finalUser = await findUser(transaction, uid)
    }, { retries: 2 })

    return { 
      code: ERROR_CODES.SUCCESS, 
      message: `签到成功，获得${rewardGold}金币`, 
      data: { 
        ...buildAssetPayload(finalUser, timestamp), 
        reward_gold: rewardGold, 
        continuous_days: continuousDays 
      } 
    }
  } catch (error) {
    console.error('[checkIn] failed', { uid, message: error.message })
    return { code: Number(error.code) || ERROR_CODES.SYSTEM_ERROR, message: error.message || '签到失败' }
  }
}
