'use strict'

const { ERROR_CODES, PiankeError } = require('./constants')

function ok(data = null, message = 'success') {
  return { code: ERROR_CODES.SUCCESS, message, data }
}

function fail(error, fallbackMessage = '系统繁忙，请稍后重试') {
  const code = Number(error?.code) || ERROR_CODES.SYSTEM_ERROR
  return {
    code,
    message: String(error?.message || fallbackMessage),
    data: error?.data || null
  }
}

function assert(condition, message, code = ERROR_CODES.INVALID_PARAMS, data = null) {
  if (!condition) throw new PiankeError(message, code, data)
}

module.exports = { ok, fail, assert }
