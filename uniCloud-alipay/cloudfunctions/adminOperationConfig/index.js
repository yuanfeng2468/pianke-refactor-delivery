const {
  ERROR_CODES,
  stableId,
  now,
  runTransaction,
  safeAdminSecretCompare,
  checkRateLimit,
  addSecurityAuditLog,
  requestId,
  clientIp,
  hash
} = require('pianke-common')

const CONFIG_RULES = {
  daily_ad_limit: value => isValueNumber(value, 1, 100),
  daily_feed_limit: value => isValueNumber(value, 1, 100),
  feed_exposure_min_ms: value => isValueNumber(value, 1000, 3600000),
  feed_exposure_reward_time: value => isValueNumber(value, 1, 3600),
  interstitial_frequency_minutes: value => isValueNumber(value, 0, 1440),
  interstitial_daily_limit: value => isValueNumber(value, 0, 1000),
  rewarded_video_reward: value => isRewardObject(value),
  coupon_15min: value => isCouponObject(value),
  coupon_60min: value => isCouponObject(value),
  adpid_rewarded: value => isAdpidObject(value),
  adpid_feed: value => isAdpidObject(value),
  adpid_interstitial: value => isAdpidObject(value),
  ad_enabled_rewarded: value => isBooleanObject(value),
  ad_enabled_feed: value => isBooleanObject(value),
  ad_enabled_interstitial: value => isBooleanObject(value),
  legal_terms_url: value => isUrlObject(value),
  legal_privacy_url: value => isUrlObject(value),
  invite_reward_gold: value => isValueNumber(value, 0, 100000),
  ad_reward_gold: value => isValueNumber(value, 0, 100000),
  ad_reward_time: value => isValueNumber(value, 0, 86400)
}

function unauthorized() {
  return { code: ERROR_CODES.ADMIN_UNAUTHORIZED, message: '管理鉴权失败' }
}

function isStrongSecret(value) {
  const secret = String(value || '')
  if (secret.length < 32 || secret.length > 512) return false
  return new Set(secret).size >= 12
}

function validateKey(value) {
  const key = String(value || '').trim()
  return Object.prototype.hasOwnProperty.call(CONFIG_RULES, key) ? key : ''
}

function isObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function isValueNumber(value, min, max) {
  return isObject(value) && Number.isFinite(Number(value.value)) && Number.isInteger(Number(value.value)) && Number(value.value) >= min && Number(value.value) <= max
}

function isBooleanObject(value) {
  return isObject(value) && typeof value.value === 'boolean'
}

function isUrlObject(value) {
  if (!isObject(value) || typeof value.value !== 'string') return false
  try {
    const url = new URL(value.value)
    return url.protocol === 'https:' && url.hostname.length > 0 && value.value.length <= 2048
  } catch (_) {
    return false
  }
}

function isAdpidObject(value) {
  return isObject(value) && typeof value.value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value.value)
}

function isRewardObject(value) {
  if (!isObject(value)) return false
  const gold = Number(value.gold)
  const time = Number(value.time ?? value.seconds)
  return Number.isInteger(gold) && gold >= 0 && gold <= 100000 && Number.isInteger(time) && time >= 0 && time <= 86400
}

function isCouponObject(value) {
  if (!isObject(value)) return false
  const cost = Number(value.cost)
  const time = Number(value.time)
  const dailyLimit = Number(value.dailyLimit)
  return Number.isInteger(cost) && cost >= 0 && cost <= 1000000 && Number.isInteger(time) && time >= 0 && time <= 86400 && Number.isInteger(dailyLimit) && dailyLimit >= 0 && dailyLimit <= 1000
}

async function auditSafely(record) {
  try {
    await addSecurityAuditLog(record)
  } catch (error) {
    console.error('[adminOperationConfig] audit failed', { action: record.action, message: error.message })
  }
}

exports.main = async (event = {}, context = {}) => {
  const rid = requestId(event, context)
  const ip = clientIp(context)
  try {
    await checkRateLimit(`admin:${ip || 'unknown'}`, 30, 300)
  } catch (error) {
    await auditSafely({
      event_id: `admin_rate_limited:${rid}`,
      action: 'admin_rate_limited',
      severity: 'high',
      result: 'rejected',
      actor_type: 'admin',
      request_id: rid,
      ip_address: ip,
      meta: { code: Number(error.code) || ERROR_CODES.SYSTEM_ERROR }
    })
    return unauthorized()
  }

  const configuredSecret = String(process.env.PIANKE_ADMIN_KEY || process.env.UNICLOUD_ADMIN_KEY || '').trim()
  const token = String(event.admin_token || event.adminToken || '').trim()
  if (!isStrongSecret(configuredSecret) || !safeAdminSecretCompare(configuredSecret, token)) {
    await auditSafely({
      event_id: `admin_auth_failed:${rid}`,
      action: 'admin_auth_failed',
      severity: 'high',
      result: 'rejected',
      actor_type: 'admin',
      request_id: rid,
      ip_address: ip,
      meta: { secret_configured: Boolean(configuredSecret), secret_strength_valid: isStrongSecret(configuredSecret) }
    })
    return unauthorized()
  }

  const action = String(event.action || 'list').trim()
  const actor = String(event.updated_by || context.CLIENTIP || 'admin').trim().slice(0, 128)
  const db = uniCloud.database()
  try {
    if (action === 'list') {
      const key = validateKey(event.config_key)
      if (event.config_key && !key) return { code: ERROR_CODES.CONFIG_INVALID, message: '不支持的配置键' }
      const query = key ? { config_key: key } : {}
      const result = await db.collection('operation_config').where(query).orderBy('config_key', 'asc').get()
      return { code: ERROR_CODES.SUCCESS, message: 'success', data: { configs: result.data || [] } }
    }

    if (action !== 'upsert') return { code: ERROR_CODES.CONFIG_INVALID, message: '不支持的配置操作' }
    const configKey = validateKey(event.config_key)
    const configValue = event.config_value
    if (!configKey || !CONFIG_RULES[configKey](configValue)) return { code: ERROR_CODES.CONFIG_INVALID, message: '配置键或配置值无效' }

    const updatedAt = now()
    await runTransaction(async (transaction) => {
      const collection = transaction.collection('operation_config')
      const existing = await collection.where({ config_key: configKey }).limit(1).get()
      const previous = existing.data?.[0] || null
      const configVersion = Math.max(0, Number(previous?.config_version || 0)) + 1
      const payload = { config_key: configKey, config_value: configValue, config_version: configVersion, updated_by: actor, updated_at: updatedAt }
      if (existing.data && existing.data.length) {
        await collection.doc(existing.data[0]._id).update(payload)
      } else {
        await collection.doc(stableId('config', configKey)).set({ _id: stableId('config', configKey), ...payload })
      }
      await transaction.collection('operation_config_audit').doc(stableId('config_audit', `${configKey}:${configVersion}:${rid}`)).set({
        _id: stableId('config_audit', `${configKey}:${configVersion}:${rid}`),
        config_key: configKey,
        config_version: configVersion,
        old_value_hash: hash(JSON.stringify(previous?.config_value ?? null)),
        new_value_hash: hash(JSON.stringify(configValue)),
        operator: actor,
        request_id: rid,
        ip,
        timestamp: updatedAt,
        created_at: updatedAt
      })
      await addSecurityAuditLog({
        db: transaction,
        event_id: `config_update:${rid}`,
        action: 'operation_config_upsert',
        severity: 'high',
        result: 'success',
        actor_type: 'admin',
        actor_id: actor,
        resource: configKey,
        request_id: rid,
        ip_address: ip,
        meta: { config_hash: hash(JSON.stringify(configValue)) },
        created_at: updatedAt
      }, transaction)
    })

          return { code: ERROR_CODES.SUCCESS, message: '配置已更新', data: { config_key: configKey, config_version: configVersion, updated_by: actor, updated_at: updatedAt } }

  } catch (error) {
    await auditSafely({
      event_id: `admin_operation_failed:${rid}`,
      action: 'admin_operation_failed',
      severity: 'high',
      result: 'error',
      actor_type: 'admin',
      actor_id: actor,
      request_id: rid,
      ip_address: ip,
      meta: { action, config_key: String(event.config_key || '').slice(0, 80), message: String(error.message || '').slice(0, 200) }
    })
    console.error('[adminOperationConfig] failed', { action, request_id: rid, message: error.message })
    return { code: ERROR_CODES.SYSTEM_ERROR, message: '配置操作失败' }
  }
}
