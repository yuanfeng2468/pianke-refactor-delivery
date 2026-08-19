

## 官方 API 对照结论

DCloud 官方文档：<https://uniapp.dcloud.net.cn/uni-ad/ad-rewarded-video.html>；旧版 API 文档：<https://uniapp.dcloud.net.cn/api/a-d/rewarded-video.html>。

官方 `uni.createRewardedVideoAd(options)` 的 `options` 明确包含 `urlCallback`，其中 `userId` 和 `extra` 透传到服务器端。官方示例是在创建实例时传入：`uni.createRewardedVideoAd({ adpid, urlCallback: { userId: '...', extra: '...' } })`。不能在实例创建后仅通过 `adInstance.urlCallback = ...` 赋值来保证原生 SDK 透传。

用户真实日志验证了该实现断点：`uniAdCallback` 收到 `trans_id`，但 `user_id: ''`、`extra: ''`；原始 HTTP query 中也出现 `userId: ''`，说明客户端透传没有进入广告请求。该问题会使奖励核心无法根据 `user_id` 和 `extra.order_id` 匹配订单，属于 P0 奖励闭环缺陷。

因此第二轮必须将 `urlCallback` 放入每次订单对应的 `uni.createRewardedVideoAd({ adpid, urlCallback })` 创建参数；预加载实例不能跨订单复用，除非实例 API 能在每次展示前可靠更新原生透传参数。最安全的实现是订单创建后销毁/放弃旧预加载实例，以带当前订单参数的新实例加载和展示。
