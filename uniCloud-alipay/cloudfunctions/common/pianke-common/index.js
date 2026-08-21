'use strict'

const crypto = require('crypto')
const constants = require('./constants')
const utils = require('./utils')
const orderState = require('./orderState')
const walletService = require('./walletService')
const { addRelaxationLedger } = require('./relaxationService')
const { processRewardedVideoCallback } = require('./rewardedVideoService')
const { grantInviteReward } = require('./invite')
const { buildAssetDTO } = require('./assetDto')
const { ok, fail, assert } = require('./api')
const quotaService = require('./quotaService')

const {
  RELEASE, ERROR_CODES, AD_CONFIG, INVITE_CONFIG, CHECKIN_CONFIG, COUPON_CONFIG,
  AD_EVENT_TYPES, AD_EVENTS, AD_SCENES, PiankeError
} = constants

const {
  now, safeInt, stableId, hash, getTodayString, getYesterdayString, findUser
} = utils

const { addLedger } = walletService

function safeAdminSecretCompare(expected, actual) {
  const a = Buffer.from(String(expected || ''), 'utf8')
  const b = Buffer.from(String(actual || ''), 'utf8')
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}
const { transitions, assertTransition, canTransition } = orderState
const { SCENE_POLICIES, getScenePolicy, normalizeRewardContext, assertScene } = require('./adPolicy')

function getIdempotencyKey(event = {}) { 
  return String(event.idempotency_key || event.trans_id || event.request_id || '').trim() 
}

function assertRequestedUid(requested, uid) {
  const rUid = typeof requested === 'object' ? requested.uid : requested
  if (rUid && String(rUid).trim() !== String(uid).trim()) {
    throw new PiankeError('用户身份不匹配', ERROR_CODES.AUTH_REQUIRED)
  }
  return String(uid).trim()
}

function requestId(event = {}, context = {}) {
  return String(event.request_id || context.REQUEST_ID || context.requestId || stableId('req', `${Date.now()}:${Math.random()}`)).slice(0, 160)
}

function requestToken(event = {}, context = {}) {
  return String(event.auth_token || event.token || context.AUTH_TOKEN || '').trim()
}

function clientDeviceId(event = {}, context = {}) {
  return String(event.device_id || context.DEVICEID || context.deviceId || '').trim()
}

function clientIp(context = {}) {
  return String(context.CLIENTIP || context.clientIP || context.CLIENT_IP || '').trim()
}

function createUserId(deviceId) {
  return stableId('user', deviceId)
}

function defaultUserDocument(uid, deviceId, timestamp = now()) {
  const today = getTodayString(timestamp)
  return {
    _id: uid,
    device_id: deviceId,
    gold_balance: 0,
    relaxation_time: 0,
    relaxation_started_at: 0,
    relaxation_expire_at: 0,
    daily_ad_count: 0,
    daily_ad_date: today,
    daily_feed_count: 0,
    daily_feed_date: today,
    invite_code: `PK${hash(uid).slice(0, 8).toUpperCase()}`,
    invited_by: '',
    invite_reward_claimed: false,
    account_status: 'active',
    activation_status: 'pending',
    continuous_checkin: 0,
    last_checkin_date: '',
    created_at: timestamp,
    updated_at: timestamp
  }
}

async function createUserInTransaction(transaction, deviceId) {
  const uid = createUserId(deviceId)
  const users = transaction.collection('user')
  const existingDoc = await users.doc(uid).get()
  if (existingDoc.data && existingDoc.data.length) return existingDoc.data[0]
  if (existingDoc.data && !Array.isArray(existingDoc.data)) return existingDoc.data
  const created = defaultUserDocument(uid, deviceId)
  await users.doc(uid).set(created)
  return created
}

async function createUserSession(uid, deviceId) {
  const token = stableId('token', `${uid}:${deviceId}:${now()}:${Math.random()}`)
  const timestamp = now()
  const session = {
    _id: stableId('session', token),
    user_id: uid,
    device_id: deviceId,
    token_hash: hash(token),
    expires_at: timestamp + 30 * 86400000,
    revoked: false,
    created_at: timestamp,
    updated_at: timestamp
  }
  await uniCloud.database().collection('user_sessions').doc(session._id).set(session)
  return { ...session, token }
}

function assertAccountActive(user) {
  if (user && String(user.account_status || 'active') === 'disabled') {
    throw new PiankeError('账户已被限制使用', ERROR_CODES.RISK_BLOCKED)
  }
  return user
}

async function requireAuth(event = {}, context = {}) {
  const token = requestToken(event, context)
  const uidHint = String(event.uid || context.USERID || '').trim()
  if (!token) throw new PiankeError('未登录', ERROR_CODES.AUTH_REQUIRED)
  
  const result = await uniCloud.database().collection('user_sessions').where({ token_hash: hash(token), revoked: false }).limit(1).get()
  const session = result.data?.[0]
  if (!session || safeInt(session.expires_at) < now()) throw new PiankeError('登录已过期', ERROR_CODES.AUTH_REQUIRED)
  if (uidHint && String(session.user_id) !== uidHint) throw new PiankeError('身份不匹配', ERROR_CODES.AUTH_REQUIRED)
  
  const user = await findUser(uniCloud.database(), session.user_id)
  if (!user) throw new PiankeError('用户不存在', ERROR_CODES.USER_NOT_FOUND)
  
  return { uid: session.user_id, user, session }
}

function getClientInfo(event = {}, context = {}) {
  // 网络身份只能来自云平台上下文；绝不信任客户端 event.ip。
  return {
    device_id: String(event.device_id || context.DEVICEID || context.deviceId || ''),
    ip: String(context.CLIENTIP || context.clientIP || context.CLIENT_IP || ''),
    ua: String(context.USERAGENT || context.userAgent || '')
  }
}

async function runTransaction(callback, options = {}) {
  const db = uniCloud.database()
  const retries = Math.max(0, safeInt(options.retries, 2))
  let lastError
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const transaction = await db.startTransaction()
    try { 
      const result = await callback(transaction)
      await transaction.commit()
      return result 
    } catch (error) { 
      lastError = error
      try { await transaction.rollback() } catch (rollbackError) {
        console.error('[pianke-common] transaction rollback failed', { user_id: '', trace_id: '', error_stack: String(rollbackError.stack || rollbackError.message || rollbackError) })
      }
      if (attempt >= retries) throw error 
    }
  }
  throw lastError
}

const _configCache = new Map()
const CONFIG_TTL_MS = 60000 // 60秒缓存过期

async function getOperationConfig(key, fallback = null) {
  const cached = _configCache.get(key)
  const nowTime = Date.now()
  if (cached && (nowTime - cached.timestamp < CONFIG_TTL_MS)) {
    return cached.val
  }
  try { 
    const result = await uniCloud.database().collection('operation_config').where({ config_key: key }).limit(1).get()
    const val = result.data?.[0]?.config_value ?? fallback
    _configCache.set(key, { val, timestamp: nowTime })
    return val
  } catch (_) { return fallback }
}

async function getBatchConfigs(keys, fallbacks = {}) {
  const nowTime = Date.now()
  const missing = keys.filter(k => {
    const cached = _configCache.get(k)
    return !cached || (nowTime - cached.timestamp >= CONFIG_TTL_MS)
  })

  if (missing.length > 0) {
    try {
      const db = uniCloud.database()
      const result = await db.collection('operation_config').where({
        config_key: db.command.in(missing)
      }).limit(100).get()
      
      const found = {}
      result.data.forEach(item => {
        found[item.config_key] = item.config_value
        _configCache.set(item.config_key, { val: item.config_value, timestamp: nowTime })
      })
      
      missing.forEach(k => {
        if (!(k in found)) {
          const fb = fallbacks[k] ?? null
          _configCache.set(k, { val: fb, timestamp: nowTime })
        }
      })
    } catch (_) {
      missing.forEach(k => {
        if (!_configCache.has(k)) _configCache.set(k, { val: fallbacks[k] ?? null, timestamp: nowTime })
      })
    }
  }

  const res = {}
  keys.forEach(k => {
    const cached = _configCache.get(k)
    res[k] = cached ? cached.val : (fallbacks[k] ?? null)
  })
  return res
}

function getOperationNumber(value, fallback = 0) { 
  const val = (value && typeof value === 'object') ? (value.value ?? value.number ?? value.amount) : value
  const n = Number(val)
  return Number.isFinite(n) ? n : fallback 
}

function getOperationString(value, fallback = '') { 
  const val = (value && typeof value === 'object') ? (value.value ?? value.string ?? value.text) : value
  return val != null ? String(val) : fallback 
}

function checkAndResetDaily(user, timestamp = now()) {
  const today = getTodayString(timestamp)
  const patch = {}
  let changed = false
  if (user.daily_ad_date !== today) {
    patch.daily_ad_date = today; patch.daily_ad_count = 0; changed = true
  }
  if (user.daily_feed_date !== today) {
    patch.daily_feed_date = today; patch.daily_feed_count = 0; changed = true
  }
  return { changed, patch }
}

async function ensureUserInTransaction(transaction, uid) {
  const user = await findUser(transaction, uid)
  if (!user) throw new PiankeError('用户不存在', ERROR_CODES.USER_NOT_FOUND)
  const { changed, patch } = checkAndResetDaily(user)
  if (changed) {
    await transaction.collection('user').doc(uid).update(patch)
    return { ...user, ...patch }
  }
  return user
}

async function checkRateLimit(key, limit, windowSeconds) {
  const normalizedKey = String(key || '').trim()
  const maxCount = Math.max(1, safeInt(limit, 1))
  const windowMs = Math.max(1, safeInt(windowSeconds, 1)) * 1000
  if (!normalizedKey) throw new PiankeError('频率限制参数无效', ERROR_CODES.INVALID_PARAMS)

  const recordId = stableId('ratelimit', normalizedKey)
  const timestamp = now()

  // 频率计数本身也必须具备事务隔离，否则并发请求可同时读到旧 count 并全部放行。
  await runTransaction(async (transaction) => {
    const result = await transaction.collection('rate_limit').doc(recordId).get()
    const record = result.data?.[0] || result.data

    if (record && timestamp - safeInt(record.window_start) < windowMs) {
      const count = safeInt(record.count)
      if (count >= maxCount) throw new PiankeError('操作过于频繁，请稍后再试', ERROR_CODES.RATE_LIMIT_EXCEEDED)
      await transaction.collection('rate_limit').doc(recordId).update({
        count: count + 1,
        updated_at: timestamp
      })
      return
    }

    await transaction.collection('rate_limit').doc(recordId).set({
      _id: recordId,
      key: normalizedKey,
      count: 1,
      window_start: timestamp,
      created_at: timestamp,
      updated_at: timestamp
    })
  })
}

function evaluateInterstitialFrequency(record, frequencyMinutes, dailyLimit, timestamp = now()) {
  const today = getTodayString(timestamp)
  if (!record) return { canShow: true, reason: 'ok' }
  const count = record.today_date === today ? safeInt(record.today_count) : 0
  if (count >= dailyLimit) return { canShow: false, reason: 'daily_limit' }
  const lastShowAt = safeInt(record.last_show_at)
  if (lastShowAt > 0 && timestamp - lastShowAt < frequencyMinutes * 60000) return { canShow: false, reason: 'frequency_limit' }
  return { canShow: true, reason: 'ok' }
}

function relaxationGrantPatch(user, seconds, timestamp = now()) { 
  return { relaxation_time: safeInt(user.relaxation_time) + safeInt(seconds), updated_at: timestamp } 
}

async function writeLog(collection, data, dbLike = null) {
  const db = dbLike || uniCloud.database()
  const id = data._id || stableId(collection, data.trans_id || `${data.user_id}:${now()}`)
  const record = { _id: id, ...data, created_at: data.created_at || now() }
  await db.collection(collection).doc(id).set(record)
  return id
}

async function addGoldLog(data, dbLike) { return writeLog('gold_logs', data, dbLike) }
async function addInviteAttemptLog(data, dbLike) { return writeLog('invite_attempt_log', data, dbLike) }
async function addRewardGrant(data) { 
  const db = data.db || uniCloud.database(); const payload = { ...data }; delete payload.db
  return writeLog('reward_grants', payload, db) 
}
async function addAdLog(data) { 
  const db = data.db || uniCloud.database(); const payload = { ...data }; delete payload.db
  return writeLog('ad_log', payload, db) 
}
async function addSecurityAuditLog(data, dbLike = null) {
  const timestamp = now()
  const payload = {
    _id: data._id || stableId('audit', `${data.action}:${timestamp}`),
    action: String(data.action || 'unknown'),
    severity: data.severity || 'info',
    result: data.result || 'success',
    user_id: data.user_id || data.uid || '',
    meta: data.meta || {},
    created_at: timestamp
  }
  const db = dbLike || uniCloud.database()
  try {
    await db.collection('security_audit_logs').doc(payload._id).set(payload)
  } catch (auditError) {
    console.error('[pianke-common] security audit write failed', { user_id: payload.user_id, trace_id: payload.request_id || '', error_stack: String(auditError.stack || auditError.message || auditError) })
    throw auditError
  }
  return payload._id
}

function buildAssetPayload(user, timestamp = now()) {
  return buildAssetDTO(user, timestamp)
}

async function latestAssetPayload(uid, timestamp = now(), dbLike = null) {
  const db = dbLike || uniCloud.database()
  const user = await findUser(db, uid)
  return buildAssetPayload(user, timestamp)
}

module.exports = {
  RELEASE, ERROR_CODES, AD_CONFIG, INVITE_CONFIG, CHECKIN_CONFIG, COUPON_CONFIG,
  AD_EVENT_TYPES, AD_EVENTS, AD_SCENES, PiankeError,
  now, safeInt, stableId, hash, getTodayString, getYesterdayString, findUser,
  addLedger, addRelaxationLedger, processRewardedVideoCallback, grantInviteReward, transitions, assertTransition, canTransition,
  SCENE_POLICIES, getScenePolicy, normalizeRewardContext, assertScene,
  getIdempotencyKey, assertRequestedUid, requestId, requestToken, safeAdminSecretCompare,
  clientDeviceId, clientIp, createUserInTransaction, createUserSession, requireAuth, assertAccountActive,
  getClientInfo, runTransaction, getOperationConfig, getOperationNumber,
  getOperationString, getBatchConfigs, checkAndResetDaily, ensureUserInTransaction, checkRateLimit, evaluateInterstitialFrequency,
  relaxationGrantPatch, writeLog, addGoldLog, addInviteAttemptLog, addRewardGrant, addAdLog,
  addSecurityAuditLog, buildAssetPayload, latestAssetPayload, ok, fail, assert,
  ...quotaService
}
