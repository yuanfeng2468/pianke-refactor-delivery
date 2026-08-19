'use strict'
const { ERROR_CODES, PiankeError, now, requireAuth, runTransaction, assertTransition } = require('pianke-common')

exports.main = async (event = {}, context = {}) => {
  try {
    const { uid } = await requireAuth(event, context)
    const order_id = String(event.order_id || '').trim()
    if (!order_id) return { code: ERROR_CODES.INVALID_PARAM, message: '缺少订单号', data: null }
    const data = await runTransaction(async (transaction) => {
      const result = await transaction.collection('reward_orders').where({ order_id, uid }).limit(1).get()
      const order = result.data?.[0]
      if (!order) throw new PiankeError('订单不存在', ERROR_CODES.ORDER_NOT_FOUND)
      if (order.status === 'rewarded' || order.status === 'failed' || order.status === 'pending_review' || order.status === 'verified') return order
      const updated_at = now()
      if (order.status !== 'client_completed') assertTransition('reward_orders', order.status, 'client_completed')
      await transaction.collection('reward_orders').doc(order._id).update({
        status: 'client_completed',
        client_completed_at: order.client_completed_at || updated_at,
        updated_at
      })
      return { ...order, status: 'client_completed', client_completed_at: order.client_completed_at || updated_at, updated_at }
    })
    return { code: ERROR_CODES.SUCCESS, message: '客户端观看完成已记录，等待广告服务端确认', data: { order_id, status: data.status } }
  } catch (error) {
    return { code: Number(error.code) || ERROR_CODES.SYSTEM_ERROR, message: error.message || '广告完成上报失败', data: null }
  }
}
