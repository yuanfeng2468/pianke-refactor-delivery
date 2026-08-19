'use strict'
const { ERROR_CODES, requireAuth } = require('pianke-common')
exports.main = async (event = {}, context = {}) => {
  try {
    const { uid } = await requireAuth(event, context)
    const limit = Math.min(100, Math.max(1, Number(event.limit || 50)))
    const result = await uniCloud.database().collection('wallet_ledger').where({ uid }).orderBy('created_at', 'desc').limit(limit).get()
    return { code: ERROR_CODES.SUCCESS, message: 'success', data: { list: result.data || [] } }
  } catch (error) { return { code: Number(error.code) || ERROR_CODES.SYSTEM_ERROR, message: error.message || '流水查询失败', data: null } }
}
