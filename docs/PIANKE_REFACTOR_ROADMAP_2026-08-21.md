# PianKe 生产重构落地路线图（2026-08-21）

## A. 目标

将当前 release/v3.1.1-production 从“源码重构 + 静态验证通过的 RC”推进为“真实 uniCloud + 广告平台 + Android 真机可验证的生产版本”。

## B. 不可逆动作前置原则

1. 不直接删除旧云函数入口。
2. 不直接删除历史数据。
3. 不在真实数据库未备份前修改事实字段。
4. 不把客户端完成回调升级成发奖依据。
5. 不在没有唯一索引验证前开放高价值奖励。

## C. Phase 1：基线与数据治理

- 建立 production schema/index 快照。
- 导出 user、reward_orders、reward_grants、wallet_ledger、relaxation_ledger、invite_logs、invite_records、user_daily_stats。
- 建立重复幂等键扫描。
- 建立余额与账本对账脚本。
- 建立 reward_orders ↔ reward_grants ↔ wallet_ledger 对账脚本。
- 建立 invite relationship 一致性扫描。

验收：无未解释的资产差异；唯一键冲突已分类；旧字段写入方明确。

## D. Phase 2：公共基础设施收口

### 目标目录

```text
cloudfunctions/common/pianke-common/
  auth/
  asset/
  ad/
  reward/
  invite/
  state/
  transaction/
  idempotency/
  audit/
  config/
  dto/
```

兼容 `index.js` 继续存在，但只作为 façade，不再承载新增领域逻辑。

### 统一契约

成功：`{ code: 0, message, data, requestId }`

失败：`{ code, message, data: null, requestId }`

## E. Phase 3：核心领域顺序

### 1. User

服务端负责身份、session、activation、profile；客户端只保存 token 和投影。

### 2. Asset

所有余额/时长变化走 transaction + immutable ledger + idempotency；user 中余额只作为 snapshot。

### 3. Rewarded Ad

`createOrder → SDK → callback → verify → grant → ledger → query/recovery`。

### 4. Invite

`bind → activation → valid behavior → pending → grant`。

每个业务事实使用不可变记录，用户布尔值只作为兼容快照。

## F. Phase 4：Feed / Task / Scene / Coupon

信息流曝光必须拥有独立 session 生命周期；任务完成必须由服务端验证；场景配置必须服务端决定奖励；优惠券扣款必须使用同一资产事务。

## G. Phase 5：测试矩阵

| 测试 | 最低要求 |
|---|---|
| Schema | 全部 schema/index 部署并验证 |
| Unit | 状态机、幂等键、奖励规则、业务日 |
| Integration | 云函数 + 数据库 |
| Replay | callback、invite、exchange、feed claim |
| Concurrency | 同订单 20 并发、同用户限额 20 并发 |
| Rollback | 事务中途注入失败 |
| Recovery | APP kill、断网、重启 |
| Security | uid 越权、金额篡改、重放、签名错误 |
| E2E | 真机从启动到广告到账完整闭环 |

## H. Phase 6：真实环境发布顺序

```text
备份
 ↓
schema/index
 ↓
common modules
 ↓
user/asset
 ↓
ad/reward
 ↓
invite/feed
 ↓
operation config
 ↓
ad callback binding
 ↓
real device
 ↓
APK signing
 ↓
灰度
 ↓
监控
 ↓
正式发布
```

任何阶段失败均停止推进，不跨阶段发布。

## I. 必须保留的回滚点

- 上一稳定云函数版本。
- 数据库 schema/index 版本。
- operation_config 版本与哈希。
- 广告回调 secret 配置版本。
- APK versionCode。
- 灰度用户集合。

## J. Production Gate

只有以下条件全部满足，才允许从 RC 标记为 Production：

1. 真 uniCloud Space 部署成功。
2. 所有数据库索引存在且唯一约束生效。
3. 真实广告 callback 签名验证成功。
4. callback 重放不重复发奖。
5. 资产并发不出现 lost update/duplicate grant。
6. invite 重放不重复发奖。
7. APP 被杀/断网后状态可恢复。
8. 隐私拒绝门禁通过。
9. APK 签名、安装、升级覆盖通过。
10. 监控和回滚演练完成。
