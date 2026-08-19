# 激励视频服务端回调官方要求

本专项审计依据 DCloud 官方文档：<https://uniapp.dcloud.net.cn/uni-ad/ad-rewarded-video.html>。

官方要求明确：客户端 `isEnded` 只能作为参考，不能依据客户端通知直接发放奖励；必须使用激励视频服务器回调判断广告是否真实播放完成。客户端完成后应向业务服务器查询，业务服务器根据服务端回调结果告知客户端是否已发奖。

官方回调字段包括 `adpid`、`provider`、`platform`、`sign`、`trans_id`、`user_id`、`extra` 和可选的 `cpm`。签名规则为 `sha256(secret:trans_id)`，其中 `secret` 在 uni-ad 广告位的服务器回调配置中查看。回调处理必须验签、以 `trans_id` 去重、完成事务内发奖，并返回 JSON `{ "isValid": true }`；重复回调也应返回 `isValid: true`，避免广告平台因响应不正确或超时重复回调。

官方还指出，uni-ad 在 uniCloud 业务中会通过 `uniAdCallback` 接收广告商回调并调用业务云函数；需要在 uniCloud 控制台确认该回调云函数存在、服务空间配置正确并查看其日志。官方文档说明同一次观看可能收到两次相同 `trans_id` 回调，因此数据库去重是必要条件。

本项目对应实现：

| 官方要求 | 项目实现 |
|---|---|
| 客户端完成不直接发奖 | `reportAdCompleted` 仅推进 `client_completed`，真正发奖由 `processRewardedVideoCallback` 执行 |
| 验签 | `uni-ad-callback/index.obj.js` 使用 `sha256(secret:trans_id)` 和定时安全比较 |
| 服务端交易号去重 | `reward_grants.trans_id` 唯一索引 |
| 订单级去重 | `reward_grants.order_id` 唯一稀疏索引 |
| 重复回调幂等 | `reward_grants` 查询和已 `rewarded` 状态短路 |
| 客户端查询到账 | `queryRewardOrder` 返回订单状态；恢复查询覆盖所有未终结状态 |
| 事务内发奖 | 钱包账本、放松时长账本、奖励记录、订单状态在同一事务中写入 |

本文件仅记录外部规范；实际 uniCloud 控制台中的 `uniAdCallback` 与业务云函数绑定、广告位 secret 和回调测试仍必须在真实环境完成。
