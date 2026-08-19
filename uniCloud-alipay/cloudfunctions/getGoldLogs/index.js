'use strict'
const { ERROR_CODES, requireAuth, assertRequestedUid, safeInt, findUser } = require('pianke-common')

exports.main = async (event = {}, context = {}) => {
  const requestedUid = String(event.uid || '').trim()
  const pageNum = Math.max(1, safeInt(event.page_num || event.pageNum, 1))
  const pageSize = Math.min(100, Math.max(1, safeInt(event.page_size || event.pageSize, 20)))
  const db = uniCloud.database()

  try {
    const auth = await requireAuth(event, context)
    const uid = assertRequestedUid(requestedUid, auth.uid)

    // 从权威账本表 wallet_ledger 读取数据，而不是旧的 gold_logs
    const countResult = await db.collection('wallet_ledger').where({ uid }).count()
    const total = safeInt(countResult.total)

    const result = await db.collection('wallet_ledger')
      .where({ uid })
      .orderBy('created_at', 'desc')
      .skip((pageNum - 1) * pageSize)
      .limit(pageSize)
      .get()

    // 字段映射归一化，适配前端展示
    const logs = (result.data || []).map(item => ({
      _id: item._id,
      amount: safeInt(item.delta),
      type: item.business_type,
      source: item.business_type,
      description: item.remark || item.business_type,
      trans_id: item.idempotency_key || item.order_id,
      created_at: item.created_at
    }))

    return {
      code: ERROR_CODES.SUCCESS,
      message: 'success',
      data: {
        logs,
        total,
        page_num: pageNum,
        page_size: pageSize,
        has_more: pageNum * pageSize < total
      }
    }
  } catch (error) {
    console.error('[getGoldLogs] failed', error.message)
    return { code: error.code || ERROR_CODES.SYSTEM_ERROR, message: error.message || '获取金币流水失败' }
  }
}
