'use strict'

const crypto = require('crypto')

function now() { return Date.now() }
function safeInt(value, fallback = 0) { const number = Number(value); return Number.isFinite(number) ? Math.trunc(number) : fallback }
function stableId(prefix, value) { return `${prefix}_${crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 40)}` }
function hash(value) { return crypto.createHash('sha256').update(String(value)).digest('hex') }
function getTodayString(timestamp = now()) { return new Date(timestamp).toISOString().slice(0, 10) }
function getYesterdayString(timestamp = now()) { return getTodayString(timestamp - 86400000) }

async function findUser(dbLike, uid) {
  const result = await dbLike.collection('user').doc(uid).get()
  return (result.data && result.data.length ? result.data[0] : result.data) || null
}

module.exports = {
  now,
  safeInt,
  stableId,
  hash,
  getTodayString,
  getYesterdayString,
  findUser
}
