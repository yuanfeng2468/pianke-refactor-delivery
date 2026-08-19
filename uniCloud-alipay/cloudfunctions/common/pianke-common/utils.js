'use strict'

const crypto = require('crypto')

const BUSINESS_TIME_ZONE = 'Asia/Shanghai'

function now() { return Date.now() }
function safeInt(value, fallback = 0) { const number = Number(value); return Number.isFinite(number) ? Math.trunc(number) : fallback }
function stableId(prefix, value) { return `${prefix}_${crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 40)}` }
function hash(value) { return crypto.createHash('sha256').update(String(value)).digest('hex') }

function getBusinessDate(timestamp = now()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date(timestamp))
}

function getTodayString(timestamp = now()) { return getBusinessDate(timestamp) }
function getYesterdayString(timestamp = now()) {
  return getBusinessDate(timestamp - 86400000)
}

function isTransientTransactionError(error = {}) {
  const code = String(error.code || error.errCode || '').toLowerCase()
  const name = String(error.name || '').toLowerCase()
  const message = String(error.message || '').toLowerCase()
  return Boolean(
    error.transient === true ||
    ['conflict', 'transaction_conflict', 'writeconflict', 'temporarily_unavailable', 'timeout', 'e11000'].some(token => code.includes(token) || name.includes(token) || message.includes(token))
  )
}

async function findUser(dbLike, uid) {
  const result = await dbLike.collection('user').doc(uid).get()
  return (result.data && result.data.length ? result.data[0] : result.data) || null
}

module.exports = {
  now,
  safeInt,
  stableId,
  hash,
  BUSINESS_TIME_ZONE,
  getBusinessDate,
  getTodayString,
  isTransientTransactionError,
  getYesterdayString,
  findUser
}
