'use strict'
const { requireAuth, assertRequestedUid } = require('pianke-common')

const { ERROR_CODES, safeInt } = require('pianke-common')

const ALLOWED_TYPES = new Set(['15min', '60min'])
const MAX_PAGE_SIZE = 100

function failure(code, message) {
  return { code, message }
}

function projectRecord(record = {}) {
  return {
    _id: String(record._id || ''),
    exchange_type: String(record.exchange_type || ''),
    gold_consumed: Math.max(0, safeInt(record.gold_consumed)),
    time_added: Math.max(0, safeInt(record.time_added)),
    trans_id: String(record.trans_id || ''),
    created_at: safeInt(record.created_at)
  }
}

exports.main = async (event = {}, context = {}) => {
  const requestedUid = String(event.uid || '').trim()
  let uid = ''
  if (!requestedUid && !event.auth_token) return failure(ERROR_CODES.INVALID_PARAMS, '缺少用户ID')

  const pageNum = Math.max(1, Math.min(100000, safeInt(event.page_num, 1)))
  const pageSize = Math.max(1, Math.min(MAX_PAGE_SIZE, safeInt(event.page_size, 10)))
  const exchangeType = String(event.exchange_type || '').trim()
  if (exchangeType && !ALLOWED_TYPES.has(exchangeType)) {
    return failure(ERROR_CODES.INVALID_PARAMS, '兑换类型无效')
  }

  try {
    const auth = await requireAuth(event, context)
    uid = assertRequestedUid(requestedUid, auth.uid)
    const db = uniCloud.database()
    let query = db.collection('exchange_record').where({ user_id: uid })
    if (exchangeType) query = query.where({ exchange_type: exchangeType })

    const [totalResult, recordsResult] = await Promise.all([
      query.count(),
      query.orderBy('created_at', 'desc').skip((pageNum - 1) * pageSize).limit(pageSize).get()
    ])
    const total = Math.max(0, safeInt(totalResult.total))
    const records = (recordsResult.data || []).map(projectRecord)
    return {
      code: ERROR_CODES.SUCCESS,
      message: '兑换记录查询成功',
      data: {
        records,
        total,
        page_num: pageNum,
        page_size: pageSize,
        has_more: pageNum * pageSize < total
      }
    }
  } catch (error) {
    console.error('[getExchangeRecords] failed', { uid, message: error.message })
    return failure(ERROR_CODES.SYSTEM_ERROR, '兑换记录查询失败')
  }
}
