const PREFIX = '[FeedAds][AndroidBase]'

function isAndroidApp() {
  return typeof plus !== 'undefined' && plus.os && plus.os.name === 'Android'
}

function safeValue(value) {
  if (value === undefined || value === null) return value
  if (typeof value !== 'object') return value
  if (Array.isArray(value)) return value.slice(0, 20).map(safeValue)
  const output = {}
  Object.keys(value).slice(0, 30).forEach((key) => {
    if (['uid', 'user_id', 'session_id', 'sessionId'].includes(key)) {
      output[key] = String(value[key]).slice(0, 8) + '…'
    } else if (key === 'error' && value[key] instanceof Error) {
      output[key] = value[key].message
    } else {
      output[key] = safeValue(value[key])
    }
  })
  return output
}

export function feedDebug(event, payload = {}) {
  if (!isAndroidApp()) return
  console.log(PREFIX, event, safeValue(payload))
}

export function feedDebugError(event, error, payload = {}) {
  if (!isAndroidApp()) return
  console.error(PREFIX, event, safeValue({ ...payload, error: error?.message || String(error || '') }))
}
