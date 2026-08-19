'use strict'
const { ERROR_CODES, findUser, getIdempotencyKey, now, requireAuth } = require('pianke-common')

exports.main = async (event = {}, context = {}) => {
  try {
    const { uid } = await requireAuth(event, context)
    const order_id = String(event.order_id || '').trim()
    const status = String(event.status || '').trim()
    
    let query = { uid }
    if (order_id) {
      query.order_id = order_id
    } else if (status === 'pending_recovery') {
      // 仅恢复十分钟内仍处于 created 的订单；pending_recovery 是查询意图，不是订单状态。
      query.status = 'created'
      query.created_at = uniCloud.database().command.gt(now() - 10 * 60 * 1000)
    } else {
      return { code: ERROR_CODES.INVALID_PARAM, message: '缺少查询参数', data: null }
    }
    
    const result = await uniCloud.database().collection('reward_orders').where(query).orderBy('created_at', 'desc').limit(1).get()
    const order = result.data?.[0]
    if (!order) return { code: ERROR_CODES.ORDER_NOT_FOUND, message: '订单不存在', data: null }
    return { code: ERROR_CODES.SUCCESS, message: 'success', data: { order_id: order.order_id, status: order.status, scene: order.scene, reward_type: order.reward_type || '', reward_context: order.reward_context || {}, reward_gold: order.reward_gold, reward_time: order.reward_time || null, created_at: order.created_at, updated_at: order.updated_at || now() } }
  } catch (error) {
    console.error('[queryRewardOrder] failed:', { code: Number(error.code) || ERROR_CODES.SYSTEM_ERROR, message: String(error?.message || ''), request_id: getIdempotencyKey(event) || '' })
    return { code: Number(error.code) || ERROR_CODES.SYSTEM_ERROR, message: '查询订单失败', data: null }
  }
}
