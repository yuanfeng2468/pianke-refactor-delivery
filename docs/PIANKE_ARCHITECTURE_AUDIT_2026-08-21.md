# PianKe 片刻全面架构审计与重构基线（2026-08-21）

> 审计基线：`release/v3.1.1-production`。本文件是第一阶段“先分析、后修改”的基线报告；不把静态检查等同于真实生产验收。

## 1. 审计范围与证据

已检查当前 release 分支的 APP 启动入口、Pinia 用户 Store、uniCloud 云函数领域划分、核心用户/邀请/广告/奖励/资产代码、数据库 schema/index，以及已有生产加固与验证报告。

当前分支已经形成较明显的领域化重构边界：user、asset、ad/rewarded、ad/feed、ad/interstitial、ad/log、invite、operation、feedback、system，并通过 `pianke-common` 提供 auth、transaction、idempotency、logger、validator、asset DTO 等公共能力。

## 2. 当前真实架构

```text
App.vue
  ├─ 隐私同意门禁
  ├─ userStore.initUser()
  │    └─ initUser
  │         ├─ requireAuth / device bootstrap
  │         ├─ user + user_sessions
  │         └─ AssetDTO
  ├─ pending reward recovery
  └─ rewarded ad preload

Pinia store/user.js
  ├─ 本地 token / installationId / pending relaxation
  ├─ uniCloud.callFunction()
  ├─ applyAsset() → UI 状态
  └─ getUserInfo / checkIn / exchangeCoupon / syncRelaxStats

uniCloud
  ├─ user: initUser / getUserInfo / activateWithInviteCode
  ├─ asset: wallet ledger / exchange / relaxation
  ├─ ad/rewarded: createRewardOrder → userAdCallback → rewardedVideoService
  ├─ ad/feed: getFeedAds → feed session → claim
  ├─ invite: activation + first-valid-behavior reward
  └─ operation / feedback / system

Database
  ├─ user / user_sessions
  ├─ reward_orders / reward_grants / ad_callback_events / ad_log
  ├─ wallet_ledger / gold_logs / relaxation_ledger
  ├─ invite_records / invite_logs / invite_attempts
  ├─ user_daily_stats
  └─ operation_config / security_audit_logs / risk_records
```

## 3. APP 启动与用户初始化真实逻辑

`App.vue` 在 `onLaunch` 第一阶段执行隐私同意；未同意时不执行用户初始化、广告预加载和统计同步。取得同意后调用 `userStore.initUser()`，失败会静默重试一次；成功后恢复未完成奖励订单并预加载激励视频。

`initUser` 优先复用已有 auth token；若 token 有效，则通过 `requireAuth` 返回用户资产。否则以 installation/device id 做 bootstrap，服务端在事务内创建/读取 user，再建立 user session。用户 ID 由服务端稳定生成，不接受客户端自定义。

## 4. Pinia 与云端关系

Pinia 是缓存/UI projection，不是资产权威源。`applyAsset()` 把服务端 AssetDTO 映射到本地状态；关键资产在云函数侧维护。需要特别注意：当前 Store 的 `checkIn()` 与 `exchangeCoupon()` 仍存在乐观 UI 更新，因此它们必须只作为可回滚显示优化，绝不能成为业务事实来源；服务端成功响应必须覆盖最终状态。

## 5. 广告奖励真实链路

```text
createRewardOrder
  ↓
reward_orders(created)
  ↓
客户端播放/完成（仅遥测）
  ↓
userAdCallback
  ↓
secret + trans_id 签名验证
  ↓
processRewardedVideoCallback
  ↓
事务：订单状态 + daily stats + user + wallet ledger + relaxation ledger + reward grant
  ↓
rewarded / pending_review
  ↓
客户端 queryRewardOrder / recovery
```

当前实现明确禁止客户端 `isEnded` 直接发奖。回调以 `trans_id` 幂等，并且订单状态机包含 created、client_completed、verifying、verified、pending_review、rewarded、failed。官方要求与项目实现文档也明确要求重复回调返回成功语义，避免广告平台重试风暴。

## 6. 资产系统真实状态

`wallet_ledger` 使用唯一 `idempotency_key`；资产写入要求在事务内执行。账本记录 before_balance、delta、after_balance、business_type、order_id 和幂等键。理论上形成“业务事件 → 资产流水 → 余额”的审计链。

但当前实现仍需在真实 uniCloud 环境验证唯一索引、事务隔离与并发语义，尤其要验证两个并发 reward callback 不会因先查后写造成竞态。

## 7. 邀请系统

激活流程：认证 → 验证邀请码 → 禁止自邀 → 激活用户 → 写 invited_by → 发激活奖励。首次有效广告行为后，`grantInviteReward` 可在广告奖励事务内同时向邀请人和受邀人发放邀请奖励，并以 invite log / reward grant / wallet ledger 做幂等存证。

当前需要重点修正的架构风险是：`invite_reward_claimed` 是用户级布尔状态，而邀请奖励的真正事实同时存在 invite_logs、reward_grants、wallet_ledger。未来应把“奖励事实”完全下沉到唯一业务订单/奖励记录，布尔值只作为派生缓存。

## 8. 数据一致性审计重点

当前已经存在多个“事实/派生”字段并存：user.gold_balance 与 wallet_ledger；user.daily_ad_count 与 user_daily_stats.ad_count；user.invite_reward_claimed 与 invite_logs/reward_grants；reward_orders 状态与 reward_grants；relaxation_time 与 relaxation_ledger。

这不是必然错误，但必须明确单一事实来源：

- 金币：wallet_ledger + user.gold_balance 快照；ledger 是审计事实。
- 广告奖励：reward_orders + reward_grants + wallet_ledger；reward_orders 是订单状态事实。
- 每日广告次数：user_daily_stats 是统计事实，user.daily_ad_count 只能是兼容快照。
- 邀请奖励：invite_logs/reward_grants 是事实，invite_reward_claimed 是派生兼容字段。
- 放松时长：relaxation_ledger 是变更事实，user.relaxation_time 是当前余额快照。

## 9. P0/P1/P2/P3 基线问题

### P0

当前代码证据中未确认“必然导致 APP 无法启动/核心云函数必然崩溃”的 P0。已有报告也明确将真实云端、广告环境和真机作为未完成门禁。

### P1

1. **生产环境绑定门禁未闭环**：公共模块、schema/index、广告回调云函数和 uniCloud 控制台配置必须在目标 Space 逐项验证；当前只能判定 RC/候选发布。
2. **多事实源并存**：每日广告次数、邀请奖励领取、资产余额/流水、放松时长存在快照与账本双写，需要明确事实源并增加对账。
3. **邀请码关系模型过度依赖 user.invited_by + invite_code 查询**：建议建立不可变 invite relationship 记录并将用户字段降级为快照。
4. **Pinia 仍有乐观资产修改**：虽然会回滚，但会产生短暂错误状态；对资产类 UI 应改为 pending 状态而非先改余额。
5. **回调签名方案必须以真实广告平台回调样本验收**：代码按 `sha256(secret:trans_id)` 实现，但不能用源码推断线上平台配置已正确。

### P2

1. 配置存在 60 秒缓存与 fallback；关键奖励配置虽然有 fail-closed helper，但普通路径仍可能读取 fallback，生产应区分“安全默认值”和“必须存在的配置”。
2. user schema 同时包含历史 VIP、多个 daily 字段、last_* 审计字段和 props 扩展字段，领域边界偏宽，应拆分兼容字段。
3. ad_log 与 security_audit_logs 都承担日志/审计语义，需明确遥测、业务审计、安全审计三类数据边界。
4. 共享 `pianke-common/index.js` 仍是较大的兼容门面；后续新增代码应直接依赖小型领域模块，逐步收缩门面。

### P3

1. 建立统一错误码目录和 API envelope。
2. 统一 trace_id/request_id 命名。
3. 为每个业务状态机增加 transition contract test。
4. 增加数据库对账任务与异常告警。
5. 增加真实环境的 concurrency/E2E 测试矩阵。

## 10. 白皮书符合度

当前 release 分支中未检索到 `PIANKE_PROJECT_WHITEPAPER_V17` 文件，因此本轮不能声称完成严格白皮书逐条符合度判定。已存在的产品/规范型文档可以作为工程约束，但不能替代用户指定的 v17 白皮书。

因此：

- 工程架构约束：已部分明确。
- 广告回调规则：已有专项规范，基本形成闭环。
- 资产幂等原则：已有代码与 schema 支撑。
- v17 产品业务符合度：**待白皮书原文进入审计证据集**。

## 11. 推荐目标架构

```text
APP
 ├─ Presentation
 ├─ Pinia projection store
 ├─ domain API client
 └─ SDK adapters
       ↓
Cloud Functions / Domain Facade
 ├─ auth
 ├─ user
 ├─ ad
 ├─ reward
 ├─ asset
 ├─ invite
 ├─ task
 ├─ scene
 ├─ coupon
 └─ operation
       ↓
Application Services
 ├─ idempotency
 ├─ state machine
 ├─ transaction
 ├─ authorization
 ├─ audit
 └─ reconciliation
       ↓
Data
 ├─ authoritative business records
 ├─ immutable ledgers
 ├─ projections/snapshots
 └─ operational logs
```

核心原则：客户端只提交意图和必要证明；服务端计算奖励、验证状态、决定资产变化；所有资产变化绑定唯一业务事件和幂等键；所有状态转移通过统一 transition guard；所有派生快照可以重算。

## 12. 推荐数据模型

| 领域 | 权威记录 | 快照/派生 | 关键唯一键 |
|---|---|---|---|
| user | user + user_sessions | AssetDTO | user._id / token_hash |
| ad order | reward_orders | UI pending state | order_id / idempotency_key |
| callback | ad_callback_events | ad_log | trans_id |
| wallet | wallet_ledger | user.gold_balance | idempotency_key |
| reward | reward_grants | user.last_reward_at | grant business key |
| invite | invite_records / invite_logs | user.invited_by / invite_reward_claimed | invitee_id |
| feed | feed_exposure_session | user_daily_stats | session_id |
| relax | relaxation_ledger | user.relaxation_time | idempotency_key |

## 13. 统一 API Envelope

建议所有云函数最终统一：

```json
{"code":0,"message":"OK","data":{},"requestId":"..."}
```

错误也必须固定 `data:null`，并在服务端日志记录 user_id/requestId/error_stack；客户端不应看到敏感堆栈。

## 14. 实施路线

### Phase 0 — 冻结事实源
冻结旧分支，建立 schema/云函数/页面/Store/API 清单和业务事件目录。

### Phase 1 — 数据一致性基础
确认唯一索引、事务、账本和对账模型；补充 invite relationship、reward business key、daily stats 对账。

### Phase 2 — 核心域收口
user → asset → ad/reward → invite 的顺序重构；禁止客户端资产乐观写入成为事实。

### Phase 3 — 辅助业务
scene/task/coupon/operation/feedback 领域化，并清理历史兼容逻辑。

### Phase 4 — 测试
schema、transition、idempotency、concurrency、replay、rollback、offline recovery、E2E。

### Phase 5 — 发布
先 schema/index，再公共模块，再云函数，再配置，再真实广告回调，再 APK 真机，最后灰度。

## 15. 发布验收

必须全部通过：

- 同一用户同一订单重复 callback：只产生一笔奖励。
- 同一 trans_id 跨用户重放：拒绝且产生安全审计。
- 同一 idempotency_key 并发：只产生一笔 wallet ledger。
- 每日上限竞争：不超过服务端限制。
- 邀请奖励重放：不重复。
- APP 被杀/断网后恢复：订单状态可恢复。
- 事务失败：余额、账本、奖励、订单状态整体回滚。
- 非法状态跳转：被拒绝。
- 隐私拒绝：无初始化、设备标识上传、广告预加载和统计同步。
- 真实 uniCloud + 广告平台 + Android 真机闭环通过。

## 16. 当前发布判定

**不是正式生产通过。** 当前最合理状态是：源码重构基础较完整、静态验证较强、真实云端/广告/Android 门禁未完成，属于“候选发布 / RC”。
