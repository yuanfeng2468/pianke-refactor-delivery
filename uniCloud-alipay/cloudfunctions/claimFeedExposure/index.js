'use strict'
const {
  requireAuth, assertRequestedUid, ERROR_CODES, PiankeError,
  getOperationConfig, getRequiredOperationConfig, getOperationNumber, findUser,
  checkAndResetDaily, getTodayString, runTransaction, stableId, getIdempotencyKey,
  safeInt, now, buildAssetPayload, addLedger, addRelaxationLedger, resolveScenePolicy,
  addRewardGrant, getDailyStat, incrementDailyStat
} = require('pianke-common')

exports.main = async (event = {}, context = {}) => {
  const requestedUid = String(event.uid || '').trim()
  const action = String(event.action || 'start').trim()
  const sessionId = getIdempotencyKey(event) || String(event.session_id || '').trim()
  const adpid = String(event.adpid || '').trim()
  const scene = String(event.scene || 'coin_page_feed').trim()
  const db = uniCloud.database()

  if (!['start', 'claim', 'close'].includes(action) || !sessionId) {
    return { code: ERROR_CODES.INVALID_PARAMS, message: '参数错误' }
  }

  try {
    const auth = await requireAuth(event, context)
    const uid = assertRequestedUid(requestedUid, auth.uid)

    const feedRewardTime = await getRequiredOperationConfig('feed_exposure_reward_time')
    const scenePolicy = resolveScenePolicy(scene, { feed_exposure_reward_time: feedRewardTime })
    const minMs = Math.max(1000, getOperationNumber(await getOperationConfig('feed_exposure_min_ms', 60000), 60000))
    const timestamp = now()
    const sessionKey = stableId('feed_session', sessionId)

    let responsePayload = null

    await runTransaction(async (transaction) => {
      const sessionResult = await transaction.collection('feed_exposure_session').doc(sessionKey).get()
      const session = sessionResult.data?.[0] || sessionResult.data

      if (action === 'start') {
        if (!session || String(session.user_id) !== String(uid)) {
          throw new PiankeError('会话无效', ERROR_CODES.RESOURCE_NOT_FOUND)
        }
        if (String(session.adpid || '') !== adpid || String(session.scene || '') !== scene) {
          throw new PiankeError('广告会话不匹配', ERROR_CODES.INVALID_PARAMS)
        }
        if (!session.session_id || !session.slot_id || !session.expires_at) {
          throw new PiankeError('会话字段不完整', ERROR_CODES.SYSTEM_ERROR)
        }
        if (String(session.status) !== 'issued') {
          if (['active', 'rewarded', 'closed', 'expired'].includes(String(session.status))) {
            responsePayload = { session_id: sessionId, status: session.status, started_at: session.started_at }
            return
          }
          throw new PiankeError('广告会话状态无效', ERROR_CODES.INVALID_PARAMS)
        }
        if (safeInt(session.expires_at) < timestamp) {
          throw new PiankeError('广告会话已过期', ERROR_CODES.RESOURCE_NOT_FOUND)
        }
        await transaction.collection('feed_exposure_session').doc(sessionKey).update({
          status: 'active', started_at: timestamp, updated_at: timestamp
        })
        responsePayload = { session_id: sessionId, status: 'active', started_at: timestamp }
        return
      }

      if (!session || String(session.user_id) !== String(uid)) throw new PiankeError('会话无效', ERROR_CODES.RESOURCE_NOT_FOUND)
      if (!session.session_id || !session.slot_id || !session.expires_at) throw new PiankeError('会话字段不完整', ERROR_CODES.SYSTEM_ERROR)
      if (String(session.adpid || '') !== adpid || String(session.scene || '') !== scene) {
        throw new PiankeError('广告会话不匹配', ERROR_CODES.INVALID_PARAMS)
      }
      const sessionStatus = String(session.status)

      // 奖励授予是 claim 的幂等事实。即使客户端在事务提交后丢失响应，
      // 重试也只能返回既有奖励，不能再次消耗每日计数。
      if (action === 'claim') {
        const grantResult = await transaction.collection('reward_grants')
          .where({ trans_id: `feed_grant:${sessionId}`, user_id: uid })
          .limit(1)
          .get()
        const existingGrant = grantResult.data?.[0] || grantResult.data
        if (existingGrant) {
          const rewardGold = safeInt(existingGrant.gold_amount)
          const rewardTime = safeInt(existingGrant.time_amount)
          if (String(session.status) !== 'rewarded') {
            await transaction.collection('feed_exposure_session').doc(sessionKey).update({
              status: 'rewarded', rewarded_at: safeInt(session.rewarded_at, timestamp) || timestamp,
              reward_gold: rewardGold, reward_time: rewardTime, updated_at: timestamp
            })
          }
          const existingUser = await findUser(transaction, uid)
          responsePayload = {
            session_id: sessionId,
            status: 'rewarded',
            reward_gold: rewardGold,
            reward_time: rewardTime,
            idempotent_replay: true,
            ...buildAssetPayload(existingUser, timestamp)
          }
          return
        }
      }

      if (['rewarded', 'closed', 'expired'].includes(sessionStatus)) {
        const existingUser = await findUser(transaction, uid)
        responsePayload = sessionStatus === 'rewarded'
          ? {
              session_id: sessionId,
              status: 'rewarded',
              reward_gold: safeInt(session.reward_gold),
              reward_time: safeInt(session.reward_time),
              idempotent_replay: true,
              ...buildAssetPayload(existingUser, timestamp)
            }
          : { session_id: sessionId, status: sessionStatus }
        return
      }
      if (safeInt(session.expires_at, timestamp + 1) < timestamp) {
        throw new PiankeError('广告会话已过期', ERROR_CODES.RESOURCE_NOT_FOUND)
      }
      if (sessionStatus !== 'active') throw new PiankeError('广告会话状态无效', ERROR_CODES.INVALID_PARAMS)
      const exposureMs = timestamp - safeInt(session.started_at, timestamp)
      if (action === 'close' || (action === 'claim' && exposureMs < minMs)) {
        if (action === 'close') {
          await transaction.collection('feed_exposure_session').doc(sessionKey).update({
            status: 'closed', end_time: timestamp, updated_at: timestamp
          })
          responsePayload = { session_id: sessionId, status: 'closed', exposure_ms: exposureMs }
        } else {
          throw new PiankeError('有效曝光时间不足', ERROR_CODES.INVALID_PARAMS)
        }
        return
      }

      const user = await findUser(transaction, uid)
      const reset = checkAndResetDaily(user, timestamp)

      const feedLimit = Math.max(1, getOperationNumber(await getRequiredOperationConfig('daily_feed_limit'), 1))
      const businessDate = getTodayString(timestamp)
      const dailyStat = await getDailyStat({ db: transaction, uid, businessDate })
      const currentFeedCount = safeInt(dailyStat.data?.feed_count)
      if (currentFeedCount >= feedLimit) throw new PiankeError('今日曝光奖励已达上限', ERROR_CODES.DAILY_LIMIT_REACHED)

      const rewardGold = safeInt(scenePolicy.fixed_gold, 10)
      const rewardTime = safeInt(scenePolicy.fixed_time, 60)

      // 更新非资产字段；放松时长必须通过不可变账本变更。
      await incrementDailyStat({ db: transaction, uid, businessDate, field: 'feed_count', delta: 1, timestamp })
      await transaction.collection('user').doc(uid).update({
        ...reset.patch,
        daily_feed_count: currentFeedCount + 1,
        updated_at: timestamp
      })

      await addRelaxationLedger({
        db: transaction,
        uid,
        deltaSeconds: rewardTime,
        business_type: 'feed_reward',
        order_id: sessionId,
        idempotency_key: `feed_time:${sessionId}`,
        remark: `信息流曝光放松时长:${adpid}`
      })

      // 统一通过 addLedger 处理金币变动与流水记录
      await addLedger({
        db: transaction, uid, delta: rewardGold, business_type: 'feed_reward',
        order_id: sessionId, idempotency_key: `feed_ledger:${sessionId}`,
        remark: `信息流曝光奖励:${adpid}`
      })

      await addRewardGrant({
        db: transaction, trans_id: `feed_grant:${sessionId}`, order_id: sessionId,
        user_id: uid, grant_type: 'feed_exposure', gold_amount: rewardGold,
        time_amount: rewardTime, created_at: timestamp
      })

      await transaction.collection('feed_exposure_session').doc(sessionKey).update({
        status: 'rewarded',
        rewarded_at: timestamp,
        reward_gold: rewardGold,
        reward_time: rewardTime,
        updated_at: timestamp
      })

      const updatedUser = await findUser(transaction, uid)
      responsePayload = {
        session_id: sessionId,
        status: 'rewarded',
        reward_gold: rewardGold,
        reward_time: rewardTime,
        ...buildAssetPayload(updatedUser, timestamp)
      }
    })

    return { code: ERROR_CODES.SUCCESS, data: responsePayload }
  } catch (error) {
    console.error('[claimFeedExposure] failed', error.message)
    return { code: error.code || ERROR_CODES.SYSTEM_ERROR, message: error.message }
  }
}
