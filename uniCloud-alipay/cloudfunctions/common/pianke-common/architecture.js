'use strict'

// Phase 3 compatibility facade. New functions should import these domain entry points
// instead of reaching into the monolithic index implementation directly.
const common = require('./index')

module.exports = {
  auth: {
    requireAuth: common.requireAuth,
    assertRequestedUid: common.assertRequestedUid,
    getClientInfo: common.getClientInfo
  },
  idempotency: {
    getIdempotencyKey: common.getIdempotencyKey,
    requestId: common.requestId,
    requestToken: common.requestToken
  },
  transaction: {
    runTransaction: common.runTransaction
  },
  logger: {
    writeLog: common.writeLog,
    addAdLog: common.addAdLog,
    addSecurityAuditLog: common.addSecurityAuditLog
  },
  validator: {
    assert: require('./api').assert,
    assertScene: common.assertScene,
    assertTransition: common.assertTransition
  },
  asset: {
    buildAssetPayload: common.buildAssetPayload,
    latestAssetPayload: common.latestAssetPayload
  },
  session: {
    createUserSession: common.createUserSession,
    createUserInTransaction: common.createUserInTransaction
  }
}
