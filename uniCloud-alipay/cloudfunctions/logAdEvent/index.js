'use strict'

const {
  requireAuth, assertRequestedUid, ERROR_CODES, AD_EVENT_TYPES, 
  AD_SCENES, addAdLog, addSecurityAuditLog, stableId, now, 
  clientIp, clientDeviceId
} = require('pianke-common')

exports.main = async (event = {}, context = {}) => {
  const adpid = String(event.adpid || '').trim()
  const scene = String(event.scene || '').trim()
  const eventType = String(event.event_type || '').trim()
  const eventId = String(event.event_id || event.trans_id || '').trim()
  
  if (!adpid || !scene || !eventType || !eventId) {
    return { code: ERROR_CODES.INVALID_PARAMS, message: '参数缺失' }
  }
  
  // 校验事件类型与场景（对齐 constants.js）
  if (!AD_EVENT_TYPES.includes(eventType)) return { code: ERROR_CODES.INVALID_PARAMS, message: '不支持的事件类型' }
  if (!AD_SCENES.includes(scene)) return { code: ERROR_CODES.INVALID_PARAMS, message: '不支持的场景' }

  try {
    const auth = await requireAuth(event, context)
    const uid = auth.uid
    const ip = clientIp(context)
    const deviceId = clientDeviceId(event, context)
    const timestamp = now()

    await addAdLog({
      _id: stableId('ad', eventId),
      event_id: eventId,
      user_id: uid,
      adpid,
      scene,
      event_type: eventType,
      status: event.status === 'failed' ? 'failed' : 'success',
      trans_id: String(event.trans_id || ''),
      ip_address: ip,
      device_id: deviceId,
      meta: event.meta || {},
      created_at: timestamp
    })

    return { code: ERROR_CODES.SUCCESS, data: { event_id: eventId } }
  } catch (error) {
    return { code: error.code || ERROR_CODES.SYSTEM_ERROR, message: error.message }
  }
}
