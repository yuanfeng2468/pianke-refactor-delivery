'use strict'
const { ERROR_CODES, PiankeError, now, requireAuth, runTransaction, assertTransition } = require('pianke-common')
exports.main = async (event = {}, context = {}) => {
  try {
    const { uid } = await requireAuth(event, context)
    const order_id = String(event.order_id || '').trim()
    if (!order_id) return { code: ERROR_CODES.INVALID_PARAM, message: '缺少订单号', data: null }
    const result = await runTransaction(async (transaction) => {
      const found = await transaction.collection('reward_orders').where({ order_id, uid }).limit(1).get()
      const order = found.data?.[0]
      if (!order) throw new PiankeError('订单不存在', ERROR_CODES.ORDER_NOT_FOUND)
      if (order.status === 'failed') return order
      if (order.status === 'rewarded') return order
      assertTransition('reward_orders', order.status, 'failed')
      const updated_at = now()
      await transaction.collection('reward_orders').doc(order._id).update({ status: 'failed', fail_reason: String(event.reason || '广告未完整观看'), updated_at })
      return { ...order, status: 'failed', updated_at }
    })
    return { code: ERROR_CODES.SUCCESS, message: result.status === 'rewarded' ? '订单已发奖' : '订单已取消', data: { order_id, status: result.status } }
  } catch (error) { return { code: Number(error.code) || ERROR_CODES.SYSTEM_ERROR, message: error.message || '取消订单失败', data: null } }
}
