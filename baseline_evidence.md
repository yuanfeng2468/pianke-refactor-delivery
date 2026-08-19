# Baseline
Wed Aug 19 00:07:33 UTC 2026
## Required files
OK uniCloud-alipay/cloudfunctions/getFeedAds/index.js
OK uniCloud-alipay/cloudfunctions/claimFeedExposure/index.js
OK uniCloud-alipay/cloudfunctions/common/pianke-common/index.js
OK uniCloud-alipay/cloudfunctions/common/pianke-common/constants.js
OK uniCloud-alipay/cloudfunctions/cleanupFeedSessions/index.js
OK uniCloud-alipay/cloudfunctions/checkInterstitialAdFrequency/index.js
OK uniCloud-alipay/cloudfunctions/queryRewardOrder/index.js
OK uniCloud-alipay/cloudfunctions/inviteReward/index.js
OK store/user.js
OK App.vue
OK pages/coin/coin.vue
## Cloud function count
26
## Silent catches
./pages/coin/coin.vue:558:    interstitialAd.load().catch(() => {})
./pages/coin/coin.vue:602:    await interstitialAd.load().catch(() => {})
./uniCloud-alipay/cloudfunctions/getFeedAds/index.js:88:        }).catch(() => {})
## Schema/status fields
uniCloud-alipay/database/ad_log.schema.json:11:    "event_type": { "description": "标准广告事件", "bsonType": "string", "enum": ["request", "fill", "start", "show", "click", "complete", "close", "error", "middle_exit", "reward_success", "reward_fail", "exposure_start", "exposure_rewarded", "skipped", "reward"] },
uniCloud-alipay/database/interstitial_frequency_request.schema.json:3:  "required": ["_id", "request_id", "user_id", "scene", "result", "created_at"],
uniCloud-alipay/database/interstitial_frequency_request.schema.json:7:    "request_id": { "description": "客户端/服务端请求幂等键", "bsonType": "string" },
uniCloud-alipay/database/invite_attempt_log.schema.json:10:    "result": { "description": "校验结果", "bsonType": "string", "enum": ["success", "failed", "expired", "exceeded"] },
uniCloud-alipay/database/invite_attempts.schema.json:10:    "result": { "bsonType": "string", "enum": ["success", "failed", "expired", "exceeded"] },
uniCloud-alipay/database/rate_limit.schema.json:3:  "required": ["_id", "key", "count", "window_start", "created_at", "updated_at"],
uniCloud-alipay/database/rate_limit.schema.json:14:    "window_start": { "bsonType": "long" },
uniCloud-alipay/database/security_audit_logs.schema.json:15:    "request_id": { "description": "请求关联 ID", "bsonType": "string" },
uniCloud-alipay/cloudfunctions/addAdReward/index.js:33:      await auditSafely({ event_id: `direct_reward_invalid:${rid}`, action: 'client_direct_reward_rejected', severity: 'high', result: 'rejected', actor_type: 'client', actor_id: uid, user_id: uid, request_id: rid, ip_address: ip, device_id: deviceId, resource: 'rewarded_video', meta: { reason: 'missing_transaction_id' } })
uniCloud-alipay/cloudfunctions/addAdReward/index.js:52:    await auditSafely({ event_id: `direct_reward_rejected:${transId}`, action: 'client_direct_reward_rejected', severity: 'critical', result: 'rejected', actor_type: 'client', actor_id: uid, user_id: uid, request_id: rid, ip_address: ip, device_id: deviceId, resource: 'rewarded_video', meta: { reason: 'server_callback_required' } })
uniCloud-alipay/cloudfunctions/addAdReward/index.js:55:    await auditSafely({ event_id: `direct_reward_failed:${rid}`, action: 'client_direct_reward_failed', severity: 'high', result: 'error', actor_type: 'client', request_id: rid, ip_address: ip, device_id: deviceId, resource: 'rewarded_video', meta: { code: Number(error.code) || ERROR_CODES.SYSTEM_ERROR, message: String(error.message || '').slice(0, 200) } })
uniCloud-alipay/cloudfunctions/adminOperationConfig/index.js:113:      request_id: rid,
uniCloud-alipay/cloudfunctions/adminOperationConfig/index.js:129:      request_id: rid,
uniCloud-alipay/cloudfunctions/adminOperationConfig/index.js:172:        request_id: rid,
uniCloud-alipay/cloudfunctions/adminOperationConfig/index.js:188:      request_id: rid,
uniCloud-alipay/cloudfunctions/adminOperationConfig/index.js:192:    console.error('[adminOperationConfig] failed', { action, request_id: rid, message: error.message })
uniCloud-alipay/cloudfunctions/checkInterstitialAdFrequency/index.js:53:      response = { can_show: decision.canShow, reason: decision.reason, request_id: requestKey }
uniCloud-alipay/cloudfunctions/cleanupFeedSessions/index.js:15:      const expiredResult = await db.collection('feed_exposure_session')
uniCloud-alipay/cloudfunctions/cleanupFeedSessions/index.js:23:      const sessions = expiredResult.data || []
uniCloud-alipay/cloudfunctions/cleanupFeedSessions/index.js:34:          status: 'expired',
uniCloud-alipay/cloudfunctions/cleanupFeedSessions/index.js:35:          result: { session_id: session.session_id || session._id, status: 'expired', reason: 'timeout_expired' },
uniCloud-alipay/cloudfunctions/cleanupFeedSessions/index.js:40:            event_id: `feed_expired:${session.session_id || session._id}_${timestamp}`,
uniCloud-alipay/cloudfunctions/cleanupFeedSessions/index.js:44:            event_type: 'exposure_expired',
uniCloud-alipay/cloudfunctions/cleanupRateLimit/index.js:25:      request_id: context.requestId || `cron_${timestamp}`,
uniCloud-alipay/cloudfunctions/cleanupRateLimit/package.json:4:  "description": "Clean up expired rate limit records",
uniCloud-alipay/cloudfunctions/common/pianke-common/constants.js:57:  'exposure_start', 'exposure_rewarded'
uniCloud-alipay/cloudfunctions/common/pianke-common/index.js:31:  return String(event.idempotency_key || event.trans_id || event.request_id || '').trim() 
uniCloud-alipay/cloudfunctions/common/pianke-common/index.js:43:  return String(event.request_id || context.REQUEST_ID || context.requestId || stableId('req', `${Date.now()}:${Math.random()}`)).slice(0, 160)
uniCloud-alipay/cloudfunctions/common/pianke-common/index.js:265:    if (record && timestamp - safeInt(record.start_time) < windowMs) {
uniCloud-alipay/cloudfunctions/common/pianke-common/index.js:279:      start_time: timestamp,
uniCloud-alipay/cloudfunctions/common/pianke-common/rewardedVideoService.js:212:    event_type: result.status === 'rewarded' ? 'reward_success' : 'reward_duplicate',
uniCloud-alipay/cloudfunctions/initUser/index.js:70:          request_id: rid,
uniCloud-alipay/cloudfunctions/initUser/index.js:79:          event_id: `session_expired:${rid}`,
uniCloud-alipay/cloudfunctions/initUser/index.js:80:          action: 'user_session_expired_rebootstrap',
uniCloud-alipay/cloudfunctions/initUser/index.js:84:          request_id: rid,
uniCloud-alipay/cloudfunctions/initUser/index.js:118:      request_id: rid,
uniCloud-alipay/cloudfunctions/initUser/index.js:133:      request_id: rid,
uniCloud-alipay/cloudfunctions/initUser/index.js:139:    console.error('[initUser] failed', { request_id: rid, code: error.code, message: error.message })
uniCloud-alipay/cloudfunctions/queryRewardOrder/index.js:26:    console.error('[queryRewardOrder] failed:', { code: Number(error.code) || ERROR_CODES.SYSTEM_ERROR, message: String(error?.message || ''), request_id: getIdempotencyKey(event) || '' })
