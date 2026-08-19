# PianKe 激励视频第二轮真实日志修复报告

## 结论

第二轮真实日志证明，上一版交付包仍存在一个会直接阻断奖励发放的 P0 客户端透传缺陷：广告实例先以 `uni.createRewardedVideoAd({ adpid })` 创建，随后再执行 `adInstance.urlCallback = ...`。DCloud 官方 API 要求 `urlCallback` 在创建参数中传入；运行时日志也明确显示 `uniAdCallback` 收到的 `user_id` 和 `extra` 均为空。因此服务端无法以用户和订单匹配广告交易，奖励核心必然拒绝发奖。

日志同时暴露了一个独立的 P1 审计故障：安全审计写入没有把 `event_id` 落入 `security_audit_logs` 文档，数据库唯一索引因 `event_id=null` 触发重复键错误。该异常不应反向阻断回调，也不能继续污染回调诊断。

## 真实证据与官方依据

用户提供的真实 uniCloud 日志包含以下关键现象：`uniAdCallback` 已收到 `trans_id`，但 `user_id: ''`、`extra: ''`；原始请求的 `userId` 也为空。日志还显示安全审计写入报 `event_id=null` 的唯一索引冲突。以上证据已原样收敛到 `REWARD_REAL_LOG_EVIDENCE.md`。

DCloud 官方激励视频文档规定，`uni.createRewardedVideoAd(options)` 的 `options` 包含 `urlCallback`，其中 `userId` 和 `extra` 由 SDK 透传到服务端；官方示例在创建实例时直接传入该对象。[1] 官方文档还规定回调的 `sign` 为 `sha256(secret:trans_id)`，成功处理必须返回 `{ isValid: true }`，重复回调也应返回成功。[1]

## 修复内容

| 缺陷 | 修复 |
|---|---|
| `urlCallback` 在创建后动态赋值，原生 SDK 不透传 | 每个奖励订单创建带当前用户和订单上下文的全新广告实例，并在 `createRewardedVideoAd({ adpid, urlCallback })` 参数中传入 `userId` 与紧凑 JSON `extra` |
| 预加载实例不属于任何订单，可能污染订单上下文 | 播放订单广告前主动销毁旧预加载实例；不再复用无订单绑定的广告实例 |
| `extra` 格式差异导致 order_id 解析失败 | 回调入口和奖励内核同时兼容 JSON、双重 JSON 及纯订单号字符串 |
| `security_audit_logs` 写入缺少 event_id 和 schema 必填字段 | 公共审计写入统一生成并落库非空 `event_id`、`actor_type`、`actor_id`、`resource`、`request_id` 等字段 |
| 审计写入失败导致非法回调路径抛异常 | 回调拒绝路径的审计写入改为 best-effort，仍稳定返回 `{ isValid: false }` |
| 真实日志根因未被自动门禁覆盖 | 专项测试新增 `urlCallback` 创建位置、禁止动态赋值、extra 订单透传、审计字段和异常兜底断言 |

## 验证结果

本轮执行了奖励专项门禁、全部云函数 JavaScript 语法检查、`git diff --check` 和 App-only 构建。奖励专项门禁共通过 30 项断言，输出 `REWARD_CLOSURE_PASS`；全部云函数语法检查通过；App 构建输出 `DONE Build complete` 并生成 `dist/build/app/app-service.js`。本轮未执行 H5 构建。

验证日志文件为 `reward-round2-gates.log` 和 `reward-round2-app-build.log`。源码变更集中在 `utils/ad.js`、`rewardCallback.js`、`rewardedVideoService.js`、公共 `index.js` 以及 `scripts/reward-closure-test.js`。

## 真实发布门禁

本轮修复解决了日志已经证明的源码断点，但必须重新上传共享公共模块和以下云函数到**广告位实际绑定的 uniCloud Space**：`userAdCallback`、`uni-ad-callback`、`createRewardOrder`、`reportAdCompleted`、`queryRewardOrder` 及其 `pianke-common`。随后在 uni-ad 控制台确认激励视频服务器回调已绑定到相同 Space，并配置真实 `PIANKE_AD_CALLBACK_SECRET`。

真实测试必须记录：创建订单返回的 `order_id`；广告关闭后客户端上报；uniAdCallback 日志中的非空 `user_id` 和包含 `order_id` 的 `extra`；签名校验成功；订单从 `client_completed/verifying` 到 `rewarded`；`wallet_ledger`、`relaxation_ledger`、`reward_grants` 和 `user_daily_stats` 各写入一次；重复相同 `trans_id` 不重复发奖；并在网络延迟或回调重试后通过 `reconcileRewardOrders` 恢复。

在真实回调日志同时出现非空用户、非空订单 extra、`isValid: true` 和 `rewarded` 之前，不应宣称生产广告链路已经闭环。

## References

[1]: https://uniapp.dcloud.net.cn/uni-ad/ad-rewarded-video.html "DCloud uni-ad 激励视频及服务器回调官方文档"
