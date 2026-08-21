# 片刻云函数 API 契约

## 通用请求与响应

除初始化接口外，业务函数要求请求携带 `auth_token`。服务端从 `user_sessions` 校验令牌，并以会话中的用户 ID 为准。客户端可以继续携带 `uid`，但服务端只允许它与会话身份一致。

成功响应统一为：

```json
{
  "code": 0,
  "message": "操作成功",
  "data": {}
}
```

失败响应统一为：

```json
{
  "code": 40001,
  "message": "业务错误",
  "data": null
}
```

客户端不得依据本地广告 SDK 的关闭事件或本地时间直接修改资产。遇到 `PROCESSING` 或网络错误时，应使用原始订单号、操作幂等键继续查询或重试。

## `getDailyQuota`

### 请求

```json
{
  "uid": "user_xxx",
  "auth_token": "session_token"
}
```

### 响应

```json
{
  "code": 0,
  "message": "获取每日配额成功",
  "data": {
    "server_timestamp": 1787280000000,
    "server_date": "2026-08-21",
    "quotas": [
      {
        "quota_type": "rewarded_video",
        "quota_date": "2026-08-21",
        "used_count": 3,
        "limit_count": 15,
        "remaining_count": 12,
        "exhausted": false
      }
    ]
  }
}
```

`quota_type` 取值包括 `rewarded_video`、`feed_reward`、`coupon_15min`、`coupon_60min` 和 `interstitial`。`limit_count` 为负数时代表无限制；当前默认配置分别为激励视频 15 次、信息流 20 次、15 分钟兑换 3 次、60 分钟兑换 1 次和插屏 5 次。

## 核心写接口幂等字段

| 接口 | 幂等字段 | 失败后的客户端动作 |
|---|---|---|
| `activateWithInviteCode` | `request_id` | 使用相同请求号查询用户状态，不重复提交激活奖励 |
| `createRewardOrder` | 服务端生成 `order_id` | 保存订单号并轮询 `queryRewardOrder` |
| `uni-ad-callback` | 平台 `trans_id` | 重复回调返回已处理，不再次发奖 |
| `claimFeedExposure` | `session_id` 与奖励记录 | 使用原 session 查询结果 |
| `exchangeCoupon` | `request_id` | 使用相同请求号重试或查询兑换记录 |
| `syncRelaxStats` | `idempotency_key` | 保留本地队列，网络恢复后重试 |

## 配置发布

运营配置写入 `operation_config`，推荐优先使用设计文档中的标准键：`videocount`、`setadtime.time`、`reward_coin_default`、`reward_time_default`、`feed_exposure_min_ms`、`feed_reward_gold`、`feed_reward_time`、`daily_feed_limit`、`coupon_15min_cost`、`coupon_15min_limit`、`coupon_60min_cost`、`coupon_60min_limit`、`invite_reward_gold`、`interstitial_frequency_minutes`、`interstitial_daily_limit` 和 `checkin_rewards`。旧版键仍保留，以兼容已发布客户端和历史订单。

## 发布前检查

| 检查项 | 命令或动作 | 通过标准 |
|---|---|---|
| JSON 结构 | 解析全部 schema、index、init data | 无解析错误 |
| 云函数语法 | `node --check` 遍历全部 `.js` | 无语法错误 |
| 配额契约 | `node scripts/daily-quota-contract-test.js` | 输出五类配额、稳定键和耗尽状态均为 true |
| 既有合约 | `node scripts/phase4-contract-test.js` | `schemas_checked` 包含新增 schema，其他契约均为 true |
| 发布验证 | HBuilderX 上传后执行 AC-01～AC-20、ER-01～ER-06 | 资产、配额、订单与账本一致 |
