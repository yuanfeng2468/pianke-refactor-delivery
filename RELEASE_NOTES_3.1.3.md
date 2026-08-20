# PianKe 3.1.3 发布说明

## 发布定位

3.1.3 基于 `release/v3.1.2-production`，用于收口上一轮端到端审计发现的奖励闭环、放松时长同步、订单恢复和版本元数据问题。本版本重点保证重复请求、响应丢失、页面并发和延迟回调不会造成跨表统计、资产或客户端 pending 状态不一致。

## 主要修复

| 范围 | 修复内容 | 闭环结果 |
|---|---|---|
| 信息流曝光奖励 | 终结会话不再被复用；重复 claim 返回既有授予结果；每日统计不再重复增加 | session、grant、钱包和统计保持同一奖励键语义 |
| 放松时长同步 | 客户端保留发送中不可变批次；重试复用同一幂等键；并发新增时长进入下一批次；服务端按首次应用/幂等重放返回实际扣减秒数 | pending 清理与服务端真实扣减结果一致 |
| 订单恢复 | `queryRewardOrder` 覆盖 `created`、`client_completed`、`verifying`、`verified`、`pending_review`，一次返回最多 20 笔；客户端逐笔恢复 | 多订单、延迟回调和并发播放均有恢复路径 |
| 对账任务 | 扫描全部未终结状态；缺少官方 `trans_id` 时等待外部证据，不伪造回调；允许 `verified` 订单进入统一发奖段 | 对账不再只覆盖 `pending_review`，且不把证据缺失误标为失败 |
| 日期契约 | 资产 DTO 统一返回 Asia/Shanghai 业务日期 `server_date` | 客户端签到和每日限额不再回退到 UTC |
| 用户提示 | 信息流奖励提示使用服务端实际到账时长 | 动态运营配置与用户提示一致 |
| 发布元数据 | 应用、公共模块、云函数 RELEASE 和契约测试统一至 3.1.3/313 | 客户端、云函数和发布产物可交叉核对 |

## 版本元数据

| 项目 | 值 |
|---|---|
| package.json | `3.1.3` |
| Android versionName | `3.1.3` |
| Android versionCode | `313` |
| pianke-common | `3.1.3` |
| cloud_module_version | `pianke-common@3.1.3` |
| 发布分支 | `release/v3.1.3-production` |
| 基线分支 | `release/v3.1.2-production` |

## 本地验证

以下验证在提交前通过：

| 检查 | 结果 |
|---|---|
| `node scripts/phase4-contract-test.js` | 通过，30 个 schema，版本 3.1.3/313 |
| `node scripts/reward-closure-test.js` | 通过，输出 `REWARD_CLOSURE_PASS` |
| 全部云函数 `node --check` | 通过 |
| `pnpm build:h5` | 通过，`DONE Build complete.` |
| `git diff --check` | 通过 |

## 上线前必须完成的真实环境验证

源码和本地门禁无法替代目标 uniCloud 服务空间中的真实交叉验证。部署时必须同时上传 `pianke-common`、奖励相关云函数和 `reconcileRewardOrders` 定时触发器，并确认生产环境变量 `PIANKE_RECONCILE_TIMER_ENABLED=true`、管理密钥和广告平台回调配置已生效。

上线后应使用真实 Android 设备验证以下场景：完整观看并到账、重复 claim、关闭页面后恢复、响应丢失后的相同批次重试、并发新增放松时长、余额不足后的剩余 pending、延迟广告回调、北京时间午夜前后签到与每日限额，以及对账任务的最近一次执行日志。还应核对 `reward_orders`、`reward_grants`、钱包账本、放松时长账本和 `user_daily_stats` 的订单号、交易号、幂等键和业务日期一致。

> 本地验证证明的是源码契约和构建可用性；广告平台官方签名、uniCloud 事务、定时触发器和真实 Android SDK 行为仍需在目标生产服务空间验证。
