# 片刻云函数 Phase 3 架构边界

## 领域目录映射

| 领域 | 现有云函数入口 | 共享边界 |
|---|---|---|
| user | initUser、getUserInfo、activateWithInviteCode | auth、asset、session |
| asset | exchangeCoupon、syncRelaxStats、getWalletLedger、getGoldLogs | asset、transaction、idempotency |
| ad/rewarded | createRewardOrder、uni-ad-callback、reportAdCompleted、queryRewardOrder、cancelRewardOrder、addAdReward | auth、idempotency、transaction、logger |
| ad/feed | getFeedAds、claimFeedExposure、cleanupFeedSessions | session、logger、validator |
| ad/interstitial | checkInterstitialAdFrequency | transaction、idempotency、logger |
| ad/log | logAdEvent | logger、validator |
| invite | inviteReward | grantInviteReward |
| operation | getAppConfig、adminOperationConfig | validator、logger |
| feedback | submitFeedback | auth、logger |
| system | cleanupRateLimit、getRelaxSentences | logger、transaction |

## 共享模块

`architecture.js` 是新代码的域边界兼容门面；`api.js` 统一成功、失败和断言语义；`assetDto.js` 负责最小化资产响应；`invite.js` 负责自动邀请与手动补领的同一事务内核。现有 `index.js` 保留为兼容入口，后续新增云函数不得继续扩展其中的业务逻辑。

## 返回契约

成功返回 `{ code: 0, message, data }`，失败返回 `{ code, message, data: null }`。错误必须携带服务端日志中的 `user_id`、`trace_id` 和 `error_stack`，客户端不得依据本地广告回调直接发奖。

## 废弃写入

重构期间不删除旧入口，避免云端部署期间出现调用断裂；发布前必须通过数据库写入审计确认废弃表零写入，再执行云端停用与回滚演练。


## 激励视频回调部署门禁（V3.1.1 修复）

uni-ad 平台自动部署的 `uniAdCallback` 负责接收广告商 HTTP 回调并校验平台签名，uniCloud 业务侧必须配置开发者云函数 `userAdCallback`。本项目的 `userAdCallback/index.js` 是正式业务入口，统一调用 `pianke-common/rewardCallback.js`，完成交易号归一化、业务 secret 验签、订单匹配、事务发奖和幂等响应。`uni-ad-callback/index.obj.js` 仅作为历史兼容入口，不得替代 uni-ad 控制台中的 `userAdCallback` 配置。

部署前必须在 uniCloud 控制台确认：`userAdCallback` 已上传到与广告位绑定的服务空间；`PIANKE_AD_CALLBACK_SECRET` 已配置为对应广告位 secret；同一 `trans_id` 重试返回成功且不重复写入奖励；真实日志能看到 `reward_orders.status=rewarded` 和对应账本记录。
