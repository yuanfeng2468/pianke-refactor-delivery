const { ERROR_CODES, getIdempotencyKey, now, requireAuth } = require('pianke-common')

const RECOVERABLE_STATUSES = ['created', 'client_completed', 'verifying', 'verified', 'pending_review']

function toOrderPayload(order) {
  return {
    order_id: order.order_id,
    status: order.status,
    scene: order.scene,
    reward_type: order.reward_type || '',
    reward_context: order.reward_context || {},
    reward_gold: order.reward_gold,
    reward_time: order.reward_time || null,
    created_at: order.created_at,
    updated_at: order.updated_at || now()
  }
}

exports.main = async (event = {}, context = {}) => {
  try {
    const { uid } = await requireAuth(event, context)
    const orderId = String(event.order_id || '').trim()
    const status = String(event.status || '').trim()

    let query = { uid }
    const isRecoveryQuery = !orderId && status === 'pending_recovery'
    if (orderId) {
      query.order_id = orderId
    } else if (isRecoveryQuery) {
      query.status = uniCloud.database().command.in(RECOVERABLE_STATUSES)
      query.created_at = uniCloud.database().command.gt(now() - 10 * 60 * 1000)
    } else {
      return { code: ERROR_CODES.INVALID_PARAM, message: '缺少查询参数', data: null }
    }

    const limit = isRecoveryQuery ? 20 : 1
    const result = await uniCloud.database().collection('reward_orders')
      .where(query)
      .orderBy('created_at', 'desc')
      .limit(limit)
      .get()
    const orders = (result.data || []).map(toOrderPayload)
    if (!orders.length) return { code: ERROR_CODES.ORDER_NOT_FOUND, message: '订单不存在', data: null }

    return {
      code: ERROR_CODES.SUCCESS,
      message: 'success',
      data: {
        ...orders[0],
        orders
      }
    }
  } catch (error) {
    console.error('[queryRewardOrder] failed:', {
      code: Number(error.code) || ERROR_CODES.SYSTEM_ERROR,
      message: String(error?.message || ''),
      request_id: getIdempotencyKey(event) || ''
    })
    return { code: Number(error.code) || ERROR_CODES.SYSTEM_ERROR, message: '查询订单失败', data: null }
  }
}

module.exports = { RECOVERABLE_STATUSES }
