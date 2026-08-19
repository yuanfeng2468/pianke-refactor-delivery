# PianKe V3.1.1 激励视频与奖励闭环专项审计报告

## 一、审计目标

本专项针对 `pianke-apk-v3.1.1-delivery.zip` 中所有激励视频、奖励订单、服务端回调、钱包/时长入账、每日限额、重复回调、失败恢复和客户端提示进行全链路排查。审计结论以服务端广告回调为奖励唯一可信来源，客户端 `isEnded` 或 `onClose` 不得直接发奖。

## 二、确认的闭环断点与修复

| 编号 | 问题 | 修复 |
|---|---|---|
| R1 | 交付包只有 `uni-ad-callback` 自定义入口，未提供官方推荐的 `userAdCallback` 业务云函数入口；若 uni-ad 控制台配置的业务函数名称不是当前自定义目录，平台自动部署的 `uniAdCallback` 无法命中奖励代码 | 新增 `uniCloud-alipay/cloudfunctions/userAdCallback/index.js` 和 `package.json`，通过共享 `rewardCallback.js` 进入统一奖励内核；保留并改造旧 `uni-ad-callback` 作为兼容入口 |
| R2 | 回调验签、参数别名归一化分散在旧入口，容易出现 `trans_id`、`transId`、`transaction_id`、`signature` 等平台字段差异导致合法回调被丢弃 | 新增共享 `rewardCallback.js`，统一归一化交易号、用户号、广告位、extra 和签名别名，执行 `sha256(secret:trans_id)` 安全比较 |
| R3 | 奖励事务提交后，非核心 `ad_log` 写入失败会让整个回调抛错并返回 `{isValid:false}`，广告平台会重复回调，用户表现为奖励未完成 | `rewardedVideoService` 将事务后的广告日志改为 best-effort；奖励一旦事务提交，日志异常不再反向否定成功结果 |
| R4 | 组件、金币页和放松页在 `meta.late` 延迟核验场景显示“奖励已到账”，与实际 `pending` 状态矛盾 | 移除 late 分支的成功到账提示，只有 `rewarded` 结果分支显示到账；`pending` 保留“正在核验，请稍后刷新”提示 |
| R5 | 首次播放、取消订单、异常回调、查询恢复和每日限额链路需要持续防回归 | 扩展 `scripts/reward-closure-test.js`，加入首次 `load`、订单状态机、权威 `user_daily_stats`、回调入口、字段兼容、唯一索引、事务发奖和 pending UI 门禁 |

## 三、当前奖励状态机

```text
created
  ├─ client_completed ─┐
  ├─ verifying         ├─ verified ── rewarded
  ├─ pending_review ───┘       └────── pending_review
  └─ failed
```

客户端完整观看后只调用 `reportAdCompleted`，该函数最多将订单推进到 `client_completed`。真正发奖只允许在 `userAdCallback`/兼容入口完成官方服务端验签后调用 `processRewardedVideoCallback`。奖励事务同时写入 `reward_grants`、钱包账本、放松时长账本、每日统计和订单 `rewarded` 状态。

## 四、幂等与防重复发奖

`reward_grants` 对 `trans_id` 和 `order_id` 建立数据库唯一约束，`reward_orders` 使用用户范围的幂等键约束。回调内先查询交易号，重复回调直接返回 `isValid: true` 语义对应的已处理结果；同一订单不能再次写入奖励账本。订单状态、奖励记录和账本写入均在同一事务中执行，并保留事务重试与回滚机制。

## 五、验证证据

| 验证项 | 结果 |
|---|---|
| `pnpm test:reward-closure` | 通过 |
| 激励视频专项断言 | 23 项通过 |
| 云函数 `node --check` | 全部通过 |
| `git diff --check` | 通过 |
| App-only 编译 | 通过，`DONE Build complete` |
| H5 编译 | 未执行 |
| App 输出 | `dist/build/app` |

最终日志：`/home/ubuntu/pianke-reward-audit/reward-closure-final.log`、`/home/ubuntu/pianke-reward-audit/cloudfunctions-syntax-final.log`、`/home/ubuntu/pianke-reward-audit/app-build.log`。

## 六、真实环境必须完成的发布门禁

> 沙箱静态检查不能证明广告平台已经把回调路由到正确的 uniCloud 服务空间，也不能伪造广告平台 secret、真实用户身份和 Android SDK 生命周期。

正式发布前必须在 uni-ad 控制台确认：激励视频广告位已开启服务器回调，回调服务空间与当前 uniCloud Space 一致，业务回调函数配置为 `userAdCallback`，而不是仅保留一个未绑定的自定义目录。必须将 `PIANKE_AD_CALLBACK_SECRET` 配置为该广告位真实 secret，并使用测试广告完成一次真实观看，核对 `uniAdCallback` 和 `userAdCallback` 日志、`trans_id`、订单号、用户号、`reward_grants`、钱包账本、放松时长和 `reward_orders.status=rewarded`。

还必须重复发送同一个回调验证只产生一笔奖励；在广告关闭但未完成、网络中断、回调延迟、每日限额达到和应用被杀进程后验证客户端恢复查询及 `reconcileRewardOrders`。如果真实回调函数名称或平台配置仍指向其他函数，不能将发布状态标记为闭环完成。

隐私政策地址、uniCloud schema/index 部署、Android 签名和真机广告 SDK 测试仍属于环境验收，不在本地 APK 编译成功的证明范围内。
