'use strict'

const crypto = require('crypto')
const { addSecurityAuditLog, processRewardedVideoCallback } = require('./index')

function safeEqualHex(a, b) {
  const aa = Buffer.from(String(a || '').trim().toLowerCase(), 'utf8')
  const bb = Buffer.from(String(b || '').trim().toLowerCase(), 'utf8')
  return aa.length > 0 && aa.length === bb.length && crypto.timingSafeEqual(aa, bb)
}

function parseExtra(extra) {
  let value = extra
  for (let i = 0; i < 3 && typeof value === 'string'; i += 1) {
    try { value = JSON.parse(value) } catch (_) { return {} }
  }
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

async function handleRewardCallback(params = {}) {
  const transId = String(params.trans_id || params.transId || params.transaction_id || '').trim()
  const sign = String(params.sign || params.signature || params.sig || '').trim()
  const secret = String(process.env.PIANKE_AD_CALLBACK_SECRET || '').trim()
  const expected = crypto.createHash('sha256').update(`${secret}:${transId}`, 'utf8').digest('hex')
  if (!transId || !secret || !safeEqualHex(expected, sign)) {
    await addSecurityAuditLog({
      event_id: `callback_rejected:${transId || Date.now()}`,
      action: 'reward_callback_rejected',
      severity: 'high',
      result: 'rejected',
      user_id: String(params.user_id || params.userId || params.uid || ''),
      meta: { trans_id: transId, adpid: String(params.adpid || params.adp_id || '') }
    })
    return { isValid: false }
  }

  try {
    const data = await processRewardedVideoCallback({
      ...params,
      trans_id: transId,
      user_id: params.user_id || params.userId || params.uid,
      adpid: params.adpid || params.adp_id,
      extra: parseExtra(params.extra)
    })
    return { isValid: true, data }
  } catch (error) {
    console.error('[reward callback] failed', error)
    return { isValid: false }
  }
}

module.exports = { handleRewardCallback }
