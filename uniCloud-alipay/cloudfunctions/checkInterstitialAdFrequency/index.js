'use strict'

const { 
  requireAuth, assertRequestedUid, AD_CONFIG, AD_SCENES, ERROR_CODES, 
  getOperationNumber, getOperationConfig, getOperationString, 
  evaluateInterstitialFrequency, addAdLog, stableId, safeInt, 
  getIdempotencyKey, getTodayString, runTransaction, now 
} = require('pianke-common')

exports.main = async (event = {}, context = {}) => {
  const requestedUid = String(event.uid || '').trim()
  const scene = String(event.scene || 'interstitial_exit_coin').trim()
  const requestId = getIdempotencyKey(event) || `freq_${requestedUid}_${scene}_${now()}`
  
  if (!AD_SCENES.includes(scene)) return { code: ERROR_CODES.INVALID_PARAMS, message: '不支持的场景' }

  try {
    const auth = await requireAuth(event, context)
    const uid = assertRequestedUid(requestedUid, auth.uid)
    
    // 配置获取
    const frequencyMinutes = getOperationNumber(await getOperationConfig('interstitial_frequency_minutes', 2), 2)
    const dailyLimit = getOperationNumber(await getOperationConfig('interstitial_daily_limit', 10), 10)
    const adpid = getOperationString(await getOperationConfig('adpid_interstitial', ''), '').trim()
    
    let response = null

    await runTransaction(async (transaction) => {
      const requestKey = stableId('freq_request', requestId)
      const existingRequest = await transaction.collection('interstitial_frequency_request').doc(requestKey).get()
      const existing = existingRequest.data?.[0] || existingRequest.data
      if (existing) {
        response = existing.result
        return
      }

      const recordResult = await transaction.collection('ad_interstitial_frequency').where({ user_id: uid }).limit(1).get()
      const record = recordResult.data?.[0] || null
      const timestamp = now()
      
      const decision = evaluateInterstitialFrequency(record, frequencyMinutes, dailyLimit, timestamp)
      const today = getTodayString()
      
      if (decision.canShow) {
        const nextRecord = {
          user_id: uid, today_date: today,
          today_count: record && record.today_date === today ? safeInt(record.today_count) + 1 : 1,
          last_show_at: timestamp, updated_at: timestamp
        }
        if (record) await transaction.collection('ad_interstitial_frequency').doc(record._id).update(nextRecord)
        else await transaction.collection('ad_interstitial_frequency').add({ ...nextRecord, _id: stableId('freq', uid) })
      }

      response = { can_show: decision.canShow, reason: decision.reason, request_id: requestId }
      await transaction.collection('interstitial_frequency_request').doc(requestKey).set({
        _id: requestKey, request_id: requestId, user_id: uid, scene, result: response, created_at: timestamp
      })
      
      await addAdLog({
        db: transaction, event_id: `freq:${requestId}`, user_id: uid, adpid, scene,
        event_type: 'request', status: 'success', trans_id: requestKey,
        meta: response, created_at: timestamp
      })
    })

    return { code: ERROR_CODES.SUCCESS, data: response }
  } catch (error) {
    return { code: error.code || ERROR_CODES.SYSTEM_ERROR, message: error.message }
  }
}
