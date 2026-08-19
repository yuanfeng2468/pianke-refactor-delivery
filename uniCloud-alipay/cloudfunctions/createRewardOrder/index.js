'use strict'
const crypto = require('crypto')
const { 
  AD_CONFIG, ERROR_CODES, PiankeError, findUser, 
  checkAndResetDaily, getClientInfo, getIdempotencyKey, 
  getBatchConfigs, getOperationNumber, getOperationString, getBusinessDate,
  now, requireAuth, runTransaction, safeInt, stableId, 
  assertScene, normalizeRewardContext, addSecurityAuditLog 
} = require('pianke-common')

exports.main = async (event = {}, context = {}) => {
  let authUid = ''
  const rid = getIdempotencyKey(event) || `reward:${event.scene}:${now()}`
  
  try {
    // 1. 并行读取配置与鉴权
    const [auth, configs] = await Promise.all([
      requireAuth(event, context),
      getBatchConfigs([
        'adpid_rewarded', 'rewarded_video_reward', 'ad_reward_gold', 'ad_reward_time', 'daily_ad_limit'
      ], {
        adpid_rewarded: '',
        rewarded_video_reward: { gold: 100, time: 300 },
        ad_reward_gold: 100,
        ad_reward_time: 300,
        daily_ad_limit: AD_CONFIG.REWARDED_VIDEO.DAILY_LIMIT
      })
    ])
    
    authUid = auth.uid
    const scene = String(event.scene || '').trim()
    const scenePolicy = assertScene(scene)
    const reward_context = normalizeRewardContext(event.reward_context || {})
    reward_context.reward_type = scenePolicy.reward_type

    const adpid = String(event.adpid || '').trim()
    const configuredAdpid = getOperationString(configs.adpid_rewarded, '').trim()
    if (!configuredAdpid || adpid !== configuredAdpid) {
      throw new PiankeError('广告位配置无效', ERROR_CODES.INVALID_PARAM)
    }

    const info = getClientInfo(event, context)
    if (!info.device_id || info.device_id.length < 8) throw new PiankeError('缺少有效设备标识', ERROR_CODES.INVALID_PARAMS)
    if (!info.ip) throw new PiankeError('无法确认请求来源网络', ERROR_CODES.INVALID_PARAMS)
    if (String(auth.session?.device_id || '') !== info.device_id) {
      throw new PiankeError('设备会话不匹配', ERROR_CODES.AUTH_REQUIRED)
    }

    const rewardConfig = configs.rewarded_video_reward && typeof configs.rewarded_video_reward === 'object'
      ? configs.rewarded_video_reward : {}
    const reward_gold = scenePolicy.grant_gold
      ? Math.max(0, safeInt(rewardConfig.gold, safeInt(configs.ad_reward_gold, 100))) : 0
    const reward_time = scenePolicy.grant_time
      ? Math.max(0, safeInt(rewardConfig.time ?? rewardConfig.seconds, safeInt(configs.ad_reward_time, 300))) : 0
    const daily_limit = Math.max(1, getOperationNumber(configs.daily_ad_limit, AD_CONFIG.REWARDED_VIDEO.DAILY_LIMIT))
    
    const timestamp = now()
    const order_id = `RO${new Date(timestamp).toISOString().slice(0, 10).replace(/-/g, '')}${crypto.randomBytes(8).toString('hex').toUpperCase()}`

    const result = await runTransaction(async (transaction) => {
      // 2. 事务内并行查询：用户数据 + 幂等订单
      const [user, existing] = await Promise.all([
        findUser(transaction, authUid),
        transaction.collection('reward_orders').where({ uid: authUid, idempotency_key: rid }).limit(1).get()
      ])

      if (existing.data?.length) return existing.data[0]
      if (!user) throw new PiankeError('用户不存在', ERROR_CODES.USER_NOT_FOUND)

      const reset = checkAndResetDaily(user, timestamp)
      const businessDate = getBusinessDate(timestamp)
      const dailyStatId = stableId('daily_stats', `${authUid}:${businessDate}`)
      const dailyStatResult = await transaction.collection('user_daily_stats').doc(dailyStatId).get()
      const dailyStat = dailyStatResult.data?.[0] || dailyStatResult.data || null
      const currentCount = safeInt(dailyStat?.ad_count)
      if (currentCount >= daily_limit) throw new PiankeError('今日广告次数已达上限', ERROR_CODES.DAILY_LIMIT_REACHED)

      // 冷却锚点写入 user 同一事务，避免两个并发请求同时看到“无最近订单”而双穿。
      const lastOrderAt = safeInt(user.last_reward_order_at)
      if (lastOrderAt > 0 && timestamp - lastOrderAt < 60000) {
        const remaining = Math.ceil((60000 - (timestamp - lastOrderAt)) / 1000)
        throw new PiankeError(`请休息一下，${remaining}秒后再获取奖励`, ERROR_CODES.RATE_LIMIT_EXCEEDED)
      }

      const order = { 
        _id: stableId('reward_order', order_id), 
        order_id, idempotency_key: rid, uid: authUid, scene, 
        reward_type: scenePolicy.reward_type, reward_context, 
        status: 'created', reward_gold, reward_time, adpid, 
        device_id: info.device_id, ip: info.ip, 
        created_at: timestamp, updated_at: timestamp 
      }
      
      await transaction.collection('reward_orders').doc(order._id).set(order)
      await transaction.collection('user').doc(authUid).update({
        ...reset.patch,
        last_reward_order_at: timestamp
      })
      
      return order
    })

    await addSecurityAuditLog({ event_id: `reward_order:${result.order_id}`, action: 'reward_order_created', user_id: authUid, created_at: timestamp })

    return { 
      code: ERROR_CODES.SUCCESS, 
      data: { 
        order_id: result.order_id, 
        reward_gold: result.reward_gold, 
        reward_time: result.reward_time,
        status: result.status 
      } 
    }
  } catch (error) {
    if (authUid && rid) {
      const db = uniCloud.database()
      const existing = await db.collection('reward_orders').where({ uid: authUid, idempotency_key: rid }).limit(1).get()
      if (existing.data?.[0]) {
        const order = existing.data[0]
        return { 
          code: ERROR_CODES.SUCCESS, 
          data: { 
            order_id: order.order_id, reward_gold: order.reward_gold, 
            reward_time: order.reward_time, status: order.status, recovered: true 
          } 
        }
      }
    }
    return { code: Number(error.code) || ERROR_CODES.SYSTEM_ERROR, message: error.message || '创建订单失败' }
  }
}
