const {
  ERROR_CODES,
  requireAuth,
  assertRequestedUid,
  ensureUserInTransaction,
  runTransaction,
  buildAssetPayload
} = require('pianke-common')

exports.main = async (event = {}, context = {}) => {
  try {
    const auth = await requireAuth(event, context)
    const requestedUid = String(event.uid || '').trim()
    const uid = assertRequestedUid(requestedUid, auth.uid)
    const updatedUser = await runTransaction(async (transaction) => {
      return ensureUserInTransaction(transaction, uid)
    }, { retries: 2 })
    return {
      code: ERROR_CODES.SUCCESS,
      message: 'success',
      data: buildAssetPayload(updatedUser)
    }
  } catch (error) {
    console.error('[getUserInfo] failed', error)
    return { code: Number(error.code) || ERROR_CODES.SYSTEM_ERROR, message: error.message || '获取用户信息失败' }
  }
}
