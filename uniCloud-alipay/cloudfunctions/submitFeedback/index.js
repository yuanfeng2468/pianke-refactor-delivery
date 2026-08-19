'use strict'
const { requireAuth, assertRequestedUid } = require('pianke-common')

const {
  ERROR_CODES,
  checkRateLimit,
  now
} = require('pianke-common')

exports.main = async (event = {}, context = {}) => {
  const requestedUid = String(event.uid || '').trim()
  let uid = ''
  const content = String(event.content || '').trim()
  const contact = String(event.contact || '').trim().slice(0, 160)

  if (!requestedUid && !event.auth_token || !content) {
    return { code: ERROR_CODES.INVALID_PARAMS, message: '反馈内容不能为空' }
  }

  if (content.length > 500) {
    return { code: ERROR_CODES.INVALID_PARAMS, message: '反馈内容过长' }
  }

  try {
    const auth = await requireAuth(event, context)
    uid = assertRequestedUid(requestedUid, auth.uid)
    // 速率限制：单用户每小时最多反馈 3 次
    await checkRateLimit(`feedback:${uid}`, 3, 3600)
    
    const db = uniCloud.database()
    await db.collection('feedback').add({
      user_id: uid,
      content,
      contact,
      status: 'pending',
      created_at: now(),
      updated_at: now()
    })

    return { 
      code: ERROR_CODES.SUCCESS, 
      message: '感谢您的反馈，我们会尽快处理'
    }
  } catch (error) {
    const code = error.code || ERROR_CODES.SYSTEM_ERROR
    return { code, message: error.message || '提交失败' }
  }
}
