'use strict'

const crypto = require('crypto')
const {
  addSecurityAuditLog, processRewardedVideoCallback
} = require('pianke-common')

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

async function onAdReward(params = {}) {
  const transId = String(params.trans_id || '').trim()
  const secret = String(process.env.PIANKE_AD_CALLBACK_SECRET || '').trim()
  const expected = crypto.createHash('sha256').update(`${secret}:${transId}`, 'utf8').digest('hex')

  if (!transId || !secret || !safeEqualHex(expected, params.sign)) {
    await addSecurityAuditLog({
      event_id: `legacy_callback_rejected:${transId || Date.now()}`,
      action: 'legacy_reward_callback_rejected',
      severity: 'high',
      result: 'rejected',
      user_id: String(params.user_id || ''),
      meta: { trans_id: transId, adpid: String(params.adpid || '') }
    })
    return { isValid: false }
  }

  try {
    return { isValid: true, data: await processRewardedVideoCallback({
      ...params,
      extra: parseExtra(params.extra)
    }) }
  } catch (error) {
    console.error('[legacy uni-ad callback] failed', error)
    return { isValid: false }
  }
}

module.exports = { onAdReward }
