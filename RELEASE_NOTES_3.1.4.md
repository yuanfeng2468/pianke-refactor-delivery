# PianKe v3.1.4 Production 发布说明

## 发布定位

v3.1.4 是基于 `release/v3.1.3-production` 的生产修复版本，重点处理**鉴权边界、终态会话并发、奖励回调幂等、兑换并发一致性、公共模块依赖和发布契约**。本版本没有改变客户端奖励策略：奖励仍然只能在服务端广告回调或对账完成验证后发放。

> **版本标识：** `package.json=3.1.4`、`manifest.json.versionName=3.1.4`、`manifest.json.versionCode=314`、`pianke-common@3.1.4`。

## 主要修复

| 优先级 | 范围 | 修复内容 | 结果 |
|---|---|---|---|
| P0 | feed 广告会话 | 将会话签发写入逐会话事务；已终结、已过期或不可复用会话不再被覆盖或复活，重新签发使用新的业务键。 | 降低清理任务与重新签发并发时重复 claim、旧会话复活和奖励串单风险。 |
| P0 | feed claim 重试 | 终态会话先返回既有结果，再执行过期判断；重复 claim/close 不会因过期字段遮蔽而错误失败。 | 客户端丢响应后的重试保持幂等。 |
| P0 | 兑换事务 | 将 `exchange_record` 幂等检查、日统计、金币扣减、放松时长发放和记录写入统一放入同一事务，并绑定 `exchange_type`。 | 同一 `trans_id` 的并发重放不会重复扣款、重复发放或重复日统计。 |
| P1 | 兑换数据库约束 | 为 `exchange_record.trans_id` 增加唯一索引，并在 schema 中声明必需字段。 | 将业务幂等键提升为数据库级门禁。 |
| P1 | 奖励回调日志 | 为 `pending_review` 日志补齐 `ad_log.status=pending` schema 枚举；feed 加载失败日志统一写入 `failed`。 | 消除日志写入值与 schema 枚举不一致的运行时断链。 |
| P1 | 维护任务鉴权 | `cleanupFeedSessions`、`cleanupRateLimit` 增加代码级 `triggerType=timer` 边界；`reconcileRewardOrders` 保持 timer 或强管理员密钥二选一。 | 非定时任务或非管理员不能调用维护入口。 |
| P1 | 公共模块依赖 | `reconcileRewardOrders` 显式声明 `pianke-common` file 依赖。 | 独立部署云函数时不再依赖隐式工作区解析。 |
| P1 | 用户反馈入口 | `submitFeedback` 支持仅凭有效 token 的已登录用户提交反馈，用户 ID 仍由服务端 session 确定。 | 修复 token-only 客户端请求被前置参数判断错误拒绝的问题。 |

## 鉴权与功能重合审查

本版本对全部云函数入口进行了鉴权覆盖审查。用户数据、资产、广告频控、feed 会话、奖励订单和反馈入口均通过 `requireAuth`，并对客户端提供的 UID 使用 `assertRequestedUid` 做一致性校验。管理员配置入口使用强度检查和 timing-safe secret comparison；对账任务允许受控平台 timer 或强管理员密钥；两个清理任务只允许 timer 触发。公开入口仅返回公开配置或内置金句投影，不直接返回用户资产、管理密钥或内部凭证。[1] [2]

广告奖励入口经过重复入口审查。`userAdCallback` 与历史 `uni-ad-callback` 都只转发到共享的 `handleRewardCallback`；实际验签、字段归一化、订单状态机、奖励账本和奖励凭证均由同一个 `processRewardedVideoCallback` 内核完成。`addAdReward` 不再允许客户端直接发奖，只记录未验证尝试并返回“必须由服务端回调验证”的错误。[3] [4]

## 并发与幂等审查结论

feed 重新签发和清理路径现在都基于会话状态与数据库写入结果做保护：可复用范围仅限未终结且未过期的 `issued/active` 会话，终态或已过期会话生成新的 `session_id`，清理更新还会检查实际更新结果。奖励回调和 `reconcileRewardOrders` 共享同一事务奖励内核，使用奖励凭证、钱包账本和订单状态共同形成幂等闭环。[5] [6]

放松同步使用不可变批次和服务端幂等重放；兑换使用独立的事务幂等键、钱包账本写入和 `exchange_record.trans_id` 唯一索引。两条路径不会通过客户端累计值直接覆盖权威资产，交叉并发时由事务和账本键阻止重复资产变更。[7] [8]

## 验证结果

| 检查项 | 结果 |
|---|---|
| `node scripts/phase4-contract-test.js` | 通过，输出 `apk_version=3.1.4/314`，并覆盖 feed、兑换、奖励日志 schema、timer 边界等门禁。 |
| `node scripts/reward-closure-test.js` | 通过，输出 `REWARD_CLOSURE_PASS`。 |
| 全部云函数 `node --check` | 通过。 |
| `git diff --check` | 通过。 |
| `pnpm build:h5` | 通过，H5 编译完成。 |
| 版本四点统一 | 通过：根包、Android manifest、公共常量、公共模块 package 均为 3.1.4/314。 |

## 部署与验收要求

部署前必须先发布数据库 schema/index，尤其是 `exchange_record.trans_id` 唯一索引和 `ad_log.status=pending` 枚举，然后发布 `pianke-common@3.1.4` 及依赖它的云函数。`reconcileRewardOrders` 需要配置 `PIANKE_RECONCILE_TIMER_ENABLED=true` 才能启用平台 timer；`cleanupFeedSessions` 和 `cleanupRateLimit` 必须配置为 timer 触发。生产环境还应使用真实 uniCloud 事务、真实广告平台回调和真机完成重复回调、并发 claim/close、后台恢复、网络失败及版本覆盖升级验收。

本沙箱已完成代码、契约和 H5 构建验证，但不具备正式 Android 签名证书、真实 uniCloud 数据库事务环境或广告供应商回调环境。因此 v3.1.4 发布说明不宣称已生成或签名正式 APK。[9]

## 参考文件

[1]: ./uniCloud-alipay/cloudfunctions/ARCHITECTURE.md "云函数架构与鉴权边界"
[2]: ./scripts/phase4-contract-test.js "版本与发布契约测试"
[3]: ./uniCloud-alipay/cloudfunctions/common/pianke-common/rewardCallback.js "广告回调适配器"
[4]: ./uniCloud-alipay/cloudfunctions/common/pianke-common/rewardedVideoService.js "奖励回调事务内核"
[5]: ./uniCloud-alipay/cloudfunctions/getFeedAds/index.js "feed 会话签发"
[6]: ./uniCloud-alipay/cloudfunctions/claimFeedExposure/index.js "feed claim/close 状态机"
[7]: ./uniCloud-alipay/cloudfunctions/syncRelaxStats/index.js "放松时长批次同步"
[8]: ./uniCloud-alipay/cloudfunctions/exchangeCoupon/index.js "兑换事务与幂等"
[9]: ./APK_BUILD_DELIVERY_GUIDE.md "APK 构建交付说明"
