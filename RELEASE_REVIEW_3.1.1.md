# v3.1.1 Production 发布评审与修复说明

## 评审范围

本次评审针对 `release/v3.1.1-production` 分支，基线提交为 `bc3bbe9`（`fix: repair rewarded video callback passthrough from real logs`）。评审覆盖前端构建、云函数语法、奖励闭环、订单恢复契约、数据库 schema、隐私门禁、版本元数据以及信息流曝光奖励链路。

## 结论摘要

> **当前代码变更已通过本地自动化验证，但信息流曝光奖励修复仍需在目标 uniCloud-Alipay 生产环境完成云函数部署和真实设备回归后，才能视为正式发布就绪。**

本次发现并修复了一个与真实日志相符的生产部署风险：`claimFeedExposure` 直接通过相对路径加载 `dailyStats`，而该云函数同时通过 `pianke-common` 依赖加载其余公共能力。生产云函数的依赖打包结构可能与仓库本地目录结构不同，导致模块解析失败或运行时行为不一致。现已将 `getDailyStat` 与 `incrementDailyStat` 纳入 `pianke-common` 统一导出，并让 `claimFeedExposure` 只从统一入口加载公共模块。

此外，订单恢复契约测试仍要求旧的单状态字符串 `query.status = 'created'`，与当前实现覆盖 `created`、`client_completed`、`verifying`、`verified` 和 `pending_review` 的多状态恢复逻辑不一致。测试已改为验证当前真实契约，避免在正确实现上产生误报。

## 代码变更

| 文件 | 变更 | 目的 |
|---|---|---|
| `uniCloud-alipay/cloudfunctions/common/pianke-common/index.js` | 导出 `getDailyStat` 和 `incrementDailyStat` | 统一公共模块 API，支持云函数依赖稳定加载 |
| `uniCloud-alipay/cloudfunctions/claimFeedExposure/index.js` | 删除 `../common/pianke-common/dailyStats` 相对路径导入，改从 `pianke-common` 导入 | 消除生产打包目录差异导致的模块解析风险 |
| `scripts/phase4-contract-test.js` | 将待恢复订单契约改为验证五种未终结状态 | 使测试与当前订单状态机及恢复逻辑一致 |

本次修改未改变曝光奖励的业务规则、奖励金额、每日上限、幂等键或事务边界。奖励发放仍在同一事务内更新每日统计、放松时长账本、金币账本、奖励记录和曝光会话状态。

## 验证结果

| 检查项 | 结果 | 说明 |
|---|---:|---|
| `pnpm install --frozen-lockfile` | 通过 | 依赖可按锁文件安装 |
| `pnpm test:reward-closure` | 通过 | 输出 `REWARD_CLOSURE_PASS` |
| `node scripts/phase4-contract-test.js` | 通过 | 检查 30 个 schema，版本为 `3.1.1/311` |
| 全部云函数 `node --check` | 通过 | 未发现 JavaScript 语法错误 |
| `pnpm build:h5` | 通过 | H5 构建完成 |
| `git diff --check` | 通过 | 未发现空白字符错误 |

## 发布前必须完成的生产验证

本地验证无法替代 uniCloud-Alipay 生产环境验证。上线前应先部署公共模块和 `claimFeedExposure` 云函数，再使用真实登录会话执行以下闭环：调用 `getFeedAds` 获取广告及 `sessionId`；调用 `claimFeedExposure` 的 `start`、`claim` 和必要时的 `close` 动作；确认 `feed_exposure_session` 状态正确转换；确认 `user_daily_stats`、`relaxation_ledger`、`wallet_ledger` 和 `reward_grants` 在同一事务中形成一致记录；重复提交相同 `sessionId`，确认不会重复发奖。

同时应保存生产云函数日志，重点关注 `[claimFeedExposure] failed`、`Cannot find module`、事务回滚和数据库权限错误。若生产环境仍返回通用的“用户函数代码语法或逻辑异常”，应优先查看云函数部署包中 `pianke-common` 的实际内容和版本，而不是继续修改前端分页或广告展示逻辑。

## 风险评估

| 风险 | 等级 | 处理建议 |
|---|---:|---|
| 生产云函数未部署本次公共模块导出修复 | 高 | 将公共模块与 `claimFeedExposure` 一起部署，并立即执行真实设备回归 |
| 生产数据库缺少 `feed_exposure_session` 或每日统计相关 schema/索引 | 高 | 发布前核对数据库结构及唯一约束 |
| 广告平台回调字段或签名配置变化 | 中 | 使用真实回调日志验证 `userAdCallback` 和奖励状态机 |
| H5 构建通过但 Android 自定义基座行为差异 | 中 | 在目标 Android 版本上完成曝光、播放、切后台和重复点击测试 |
| 运营配置缺失导致奖励入口拒绝服务 | 中 | 确认 `feed_exposure_reward_time`、`daily_feed_limit` 等关键配置已配置 |

## 建议的发布判定

在完成生产云函数部署、真实设备闭环和重复请求幂等验证之前，建议将版本标记为“**候选发布**”，而不是直接判定为“生产已验证”。完成上述验证且日志中不再出现 `claimFeedExposure` 模块或事务异常后，可将发布结论升级为“**通过**”。

## 变更清单

当前工作区包含以下未提交修改：

- `uniCloud-alipay/cloudfunctions/common/pianke-common/index.js`
- `uniCloud-alipay/cloudfunctions/claimFeedExposure/index.js`
- `scripts/phase4-contract-test.js`
- `RELEASE_REVIEW_3.1.1.md`

本次任务未自动提交或推送到远程仓库，以避免在未完成生产环境回归前改变用户的发布分支历史。

## References

[1]: https://github.com/yuanfeng2468/pianke-refactor-delivery/tree/release/v3.1.1-production "pianke-refactor-delivery release/v3.1.1-production"
[2]: https://github.com/yuanfeng2468/pianke-refactor-delivery/commit/bc3bbe9 "Baseline commit: repair rewarded video callback passthrough from real logs"
