'use strict'

const { PiankeError, ERROR_CODES } = require('./constants')

const transitions = {
  reward_orders: {
    created: ['client_completed', 'verifying', 'pending_review', 'failed'],
    client_completed: ['verifying', 'pending_review', 'failed'],
    verifying: ['verified', 'pending_review', 'failed'],
    verified: ['rewarded', 'pending_review', 'failed'],
    pending_review: ['verifying', 'verified', 'rewarded', 'failed'],
    rewarded: [],
    failed: []
  },
  exchange_orders: {
    created: ['paid', 'failed'],
    paid: ['processing', 'failed'],
    processing: ['success', 'failed'],
    success: [],
    failed: []
  }
}

function assertTransition(collection, from, to) {
  const allowed = transitions[collection]?.[from] || []
  if (!allowed.includes(to)) throw new PiankeError(`非法状态流转：${from} -> ${to}`, ERROR_CODES.INVALID_PARAM)
  return true
}

function canTransition(collection, from, to) { return Boolean(transitions[collection]?.[from]?.includes(to)) }

function isTerminalRewardStatus(status) { return status === 'rewarded' || status === 'failed' }

module.exports = { transitions, assertTransition, canTransition, isTerminalRewardStatus }
