'use strict'

const { PiankeError, ERROR_CODES } = require('./constants')

const transitions = {
  reward_orders: {
    created: ['rewarded', 'failed'],
    rewarded: [],
    failed: [],
  },
  exchange_orders: {
    created: ['paid', 'failed'],
    paid: ['processing', 'failed'],
    processing: ['success', 'failed'],
    success: [],
    failed: [],
  },
}

function assertTransition(collection, from, to) {
  const allowed = transitions[collection]?.[from] || []
  if (!allowed.includes(to)) throw new PiankeError(`非法状态流转：${from} -> ${to}`, ERROR_CODES.INVALID_PARAM)
  return true
}

function canTransition(collection, from, to) { return Boolean(transitions[collection]?.[from]?.includes(to)) }

module.exports = { transitions, assertTransition, canTransition }
