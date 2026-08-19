# PianKe 重构联合规范摘要

来源：用户提供的《片刻PianKeAPK全面梳理、架构重构与落地方案》与《片刻PianKeAPK架构重构与修复指令集.md》。

## 严格顺序
必须按 Phase 0 → Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 执行，不得跳步；未指示的业务逻辑保持不变。

## Phase 0 强制项
1. getFeedAds 签发 feed_exposure_session 时必须包含 slot_id、session_id、_id、user_id、adpid、scene、status、created_at、expires_at；禁止空 catch；写入失败需记录 ad_log 并向上返回错误。
2. claimFeedExposure 不得无 session 自建；start 仅允许 issued → active，且 session_id、slot_id、expires_at 完整。
3. rate_limit 统一使用 window_start，并写入 created_at；cleanupRateLimit 按 window_start 清理。
4. ad_log schema 与 constants 统一，补充 reward_duplicate、exposure_expired、exposure_rewarded 等事件。
5. feed session schema status 增加 expired；cleanupFeedSessions 更新和 ad_log 必须同一事务，日志必须含 status。
6. interstitial_frequency_request 必须保存 request_id；同一 request_id 重复请求返回相同结果且不重复计数。
7. 全局禁止空捕获；关键写入错误必须记录 user_id、trace_id、error_stack，并向上抛出。

## Phase 1 强制项
签到奖励仅由 operation_config.checkin_rewards 下发；恢复订单使用 pending_recovery，created_at，固定 10 分钟；邀请自动和补领统一调用 pianke-common/invite.js 的 grantInviteReward；离线放松 pending 改为可累加、带幂等键的队列。

## Phase 2 强制项
隐私弹窗在 onLaunch 第一顺位；同意前禁止 initUser、统计初始化、广告预加载、设备标识生成/上传；AssetDTO 白名单仅返回 user_id、balance_gold、balance_relax_seconds、activation_status、invite_code、daily_ad_count、daily_feed_count、last_ad_date、last_feed_date。

## Phase 3 强制项
按 user、asset、ad/rewarded、ad/feed、ad/interstitial、ad/log、invite、operation、feedback、system 物理重组云函数；抽取 auth、idempotency、transaction、logger、validator、asset、session；统一返回结构和错误码；废弃表停止写入。

## 已完成 Phase 0 静态检查
- 云函数 CommonJS `node --check`：通过。
- database/*.json 解析：通过。
- 全局空 catch 模式扫描：通过。
- 已修改的关键文件：feed_exposure_session.schema.json、getFeedAds/index.js、claimFeedExposure/index.js、rate_limit 共享逻辑、cleanupRateLimit/index.js、ad_log.schema.json、constants.js、cleanupFeedSessions/index.js、checkInterstitialAdFrequency/index.js、rewardedVideoService.js、utils/ad.js 及若干前端空捕获。

注意：真实 uniCloud/广告平台 E2E、测试环境部署、真机隐私验证和灰度发布无法仅在本地源码环境证明，需在用户测试环境执行并在最终交付中明确区分。
