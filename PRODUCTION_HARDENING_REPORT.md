# 片刻 PianKe APK 生产加固报告

> **状态声明（APK V3 重构后）**：本报告记录早期生产加固阶段，最终状态以 `V3_APK_REFACTOR_FINAL_REPORT.md` 为准。本次任务按要求不执行 H5 构建。

## 结论

本分支已依据《片刻 PianKe APK 架构重构与修复执行指令》完成一轮生产加固。重点覆盖奖励订单单调状态机、广告回调幂等与对账、Asia/Shanghai 业务日、用户每日统计、优惠券跨日限制、信息流会话幂等、运营配置审计、隐私启动门禁、AssetDTO 最小化和构建脚本。

当前源码通过静态门禁和 App 目标构建，可进入 APK 构建机和云端灰度部署准备阶段；本次 APK-only 重构未执行 H5，且未在真实 uniCloud、广告供应商回调和 Android 真机上完成联调，因此不应直接宣称已完成生产发布。

## 已实施的关键修复

| 范围 | 实施内容 | 证据路径 |
|---|---|---|
| 奖励订单 | 扩展 created → client_completed → verifying → verified → rewarded/pending_review/failed 的单调状态机，增加 reconciliation 元数据 | `uniCloud-alipay/cloudfunctions/common/pianke-common/orderState.js`、`database/reward_orders.schema.json` |
| 广告回调 | 采用事务内重复检查、奖励流水幂等键和 pending_review 恢复路径；修正 rewarded_at 时间字段 | `uniCloud-alipay/cloudfunctions/common/pianke-common/rewardedVideoService.js` |
| 对账 | 新增受管理密钥保护的 `reconcileRewardOrders`，通过同一奖励内核重放待复核订单 | `uniCloud-alipay/cloudfunctions/reconcileRewardOrders/index.js` |
| 业务日 | 统一 `Asia/Shanghai` 业务日帮助函数 | `uniCloud-alipay/cloudfunctions/common/pianke-common/utils.js` |
| 每日统计 | 新增 `user_daily_stats`、广告回调事件和配置审计 schema/index；优惠券兑换使用用户+业务日计数 | `database/user_daily_stats.*`、`database/ad_callback_events.*`、`cloudfunctions/exchangeCoupon/index.js` |
| 信息流 | 使用用户、广告、业务日、页面维度的稳定会话键，并增加用户级节流 | `cloudfunctions/getFeedAds/index.js`、`database/feed_exposure_session.schema.json` |
| 运营配置 | 增加关键配置 fail-closed helper；运营配置更新记录版本和旧/新哈希 | `cloudfunctions/common/pianke-common/index.js`、`cloudfunctions/adminOperationConfig/index.js` |
| 隐私与数据 | 保留 consent-first 启动门禁，并继续使用最小 AssetDTO 白名单 | `App.vue`、`cloudfunctions/common/pianke-common/assetDto.js` |
| 构建链路 | 增加 `dev`、`build`、`build:h5`、`build:app` 脚本，修正 wrapper 显式传递平台参数 | `package.json`、`scripts/build-uni.cjs` |

## 验证证据

| 检查项 | 结果 |
|---|---|
| 30 个数据库 JSON schema/index 解析 | 通过 |
| 全部云函数 JavaScript 语法检查 | 通过 |
| Phase 4 合约测试 | 通过：`schemas_checked=30`、AssetDTO 白名单、隐私门禁、待恢复订单检查均通过 |
| App 目标构建 | 通过：`npm run build:app` 输出 `DONE Build complete` |
| H5 构建 | 本次 APK-only 重构未执行 |
| 真实云端事务、唯一索引、定时器、广告回调和 Android 真机 | 未执行，需部署环境验证 |

## 发布前门禁

在 uniCloud 控制台建立新增集合并部署对应 schema/index 后，必须执行同一用户同一业务日的并发兑换、重复广告回调、跨日切换、待复核订单次日重放和事务失败回滚测试。对账函数必须配置至少 32 字符的高熵 `PIANKE_ADMIN_KEY` 或 `UNICLOUD_ADMIN_KEY`，不得将密钥提交到仓库。

Android 发布前需要在 HBuilderX 中导入 `dist/build/app`，执行安装、隐私同意拒绝/同意、广告回调、后台恢复、网络失败和升级覆盖测试，并确认 `androidPrivacy.json` 在最终原生构建产物中生效。H5 不属于本次任务范围；其构建状态不作为本次 APK 交付判定依据。

## 回滚策略

云函数和数据库 schema/index 发布必须分开记录版本。若奖励回调或账本对账出现异常，应先暂停广告奖励入口和对账任务，再回滚云函数到上一个已验证版本；不得直接删除 `reward_orders`、`reward_grants`、`ledger`、`user_daily_stats` 或 `ad_callback_events` 数据。配置变更应利用 `operation_config_audit` 的旧哈希和版本记录进行反向恢复。

## 当前限制

本报告中的“通过”仅表示本地静态、契约或 App 构建门禁通过，不等同于真实生产环境验收。uniCloud 数据库权限、索引部署、事务语义、广告供应商签名字段、定时触发器和 Android 原生 SDK 仍必须在目标环境中完成验收。
