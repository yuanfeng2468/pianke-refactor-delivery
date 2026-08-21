# 片刻云函数与云数据库设计说明

## 1. 设计目标

本实现以《片刻应用业务逻辑、上下游关系与UI设计指导书》为业务基线，采用 **uniCloud-Alipay 云函数 + uniCloud DB**，并保持现有 uni-app 客户端的函数名称、返回结构和资产字段兼容。服务端是金币、放松时长、每日配额、广告订单与邀请关系的唯一裁决方；客户端只负责展示、播放广告、上报曝光或提交带幂等键的消费片段。

> 资产变更必须通过事务、不可变账本和幂等键完成；客户端广告关闭事件不能直接触发发奖。

## 2. 数据分层

| 数据域 | 核心集合 | 一致性要求 | 主要读写入口 |
|---|---|---|---|
| 用户与会话 | `user`、`user_sessions` | 账户状态与激活状态分离；会话令牌只存哈希 | `initUser`、`getUserInfo`、`activateWithInviteCode` |
| 金币资产 | `wallet_ledger`、兼容读取表 `gold_logs` | 账本追加写入，余额更新与流水同事务 | `checkIn`、广告回调、邀请奖励、`exchangeCoupon` |
| 放松时长 | `relaxation_ledger` | 服务端校验余额；消费操作幂等 | `syncRelaxStats`、广告回调、`exchangeCoupon` |
| 配额 | `daily_quota` 与 `user` 日计数字段 | 以服务端日期计算；`daily_quota` 提供统一快照，旧字段保持客户端兼容 | `getDailyQuota`、各业务入口 |
| 激励视频 | `reward_orders`、`reward_grants`、`ad_log` | 订单状态机、平台签名验证、`trans_id` 去重 | `createRewardOrder`、`uni-ad-callback`、`queryRewardOrder` |
| 信息流 | `feed_ads`、`feed_exposure_session` | 服务端计时，60 秒门槛，单次和每日上限 | `getFeedAds`、`claimFeedExposure`、`cleanupFeedSessions` |
| 邀请 | `invite_code_whitelist`、`invite_records`、`invite_attempts`、`invite_logs` | 禁止自邀请；激活一次；首次有效广告奖励一次 | `activateWithInviteCode`、`inviteReward` |
| 运营与风控 | `operation_config`、`risk_records`、`rate_limit`、`security_audit_logs` | 配置服务端读取；异常请求留痕 | `getAppConfig`、`adminOperationConfig`、各风控入口 |

## 3. 新增配额模型

新增集合 `daily_quota`，唯一键为 `user_id + quota_date + quota_type`。支持 `rewarded_video`、`feed_reward`、`coupon_15min`、`coupon_60min` 和 `interstitial` 五类配额。集合权限全部关闭，只允许云函数访问；文档 ID 使用稳定哈希，避免重复创建。

当前客户端仍读取 `user.daily_ad_count`、`user.daily_feed_count` 和兑换计数字段，因此新模型采用兼容镜像策略：`getDailyQuota` 首次读取某用户当日配额时，将旧用户日计数字段镜像为 `daily_quota` 快照；后续新入口可以逐步将写入迁移到该集合，而不破坏已发布客户端。资产账本仍是金币和放松时长的审计权威，`daily_quota` 只负责次数型资源。

## 4. 云函数目录

| 函数 | 责任 | 关键防护 |
|---|---|---|
| `initUser` | 按设备稳定初始化用户、邀请码与会话 | 设备幂等、隐私字段不下发 |
| `activateWithInviteCode` | 校验邀请码并完成激活及激活奖励 | 事务、自邀请拦截、一次性激活 |
| `getDailyQuota` | 返回服务端日期、时间戳和五类配额快照 | 会话鉴权、服务端日期、最小响应字段 |
| `createRewardOrder` | 创建激励视频订单和 passback | 日上限、广告间隔、场景白名单 |
| `uni-ad-callback` | 验签、去重、发奖、更新订单 | SHA-256 签名、`trans_id` 幂等、事务 |
| `queryRewardOrder` | 查询订单状态供客户端轮询 | 只读、超时可恢复 |
| `getFeedAds` | 返回素材并预创建曝光 session | session 绑定用户与素材 |
| `claimFeedExposure` | 结算信息流有效曝光 | 服务端计时、60 秒门槛、日上限 |
| `checkIn` | 计算连续签到并入金币账本 | 服务端日期、每日一次 |
| `exchangeCoupon` | 金币兑换放松时长 | 余额、每日券配额、双账本事务 |
| `syncRelaxStats` | 结算放松消费片段 | 30–360 秒片段、余额保护、幂等 |
| `checkInterstitialAdFrequency` | 判断插屏频控 | 两分钟间隔、每日五次、展示后占用 |
| `inviteReward` | 首次有效激励视频后的双方奖励 | 奖励凭证、双方账本、一次性标记 |

## 5. 关键不变量

第一，任何金币或放松时长变化都必须同时写入对应账本，并且与用户余额更新处于同一事务中。第二，广告平台回调是激励视频的发奖触发源，客户端 `onClose` 只能启动查询。第三，订单、奖励凭证、邀请奖励、放松消费片段和兑换记录都必须有可重试的幂等键。第四，跨日逻辑以服务器自然日为准，不信任客户端时间。第五，账户被禁用时，所有资产变更入口必须拒绝；查询受限状态和协议隐私仍可用。

## 6. 部署步骤

在 HBuilderX 中将 `uniCloud-alipay/database` 下新增或变更的 schema、index 和 init data 上传到 Alipay 云服务空间。随后上传 `uniCloud-alipay/cloudfunctions` 下的公共模块与云函数，并在运营后台确认广告密钥、广告位、回调地址和配置项。生产发布前应先执行重复回调、延迟回调、跨日重置、网络恢复和账户禁用验收，再进行小范围灰度。

上线时建议按 **数据库结构 → 公共模块 → 读接口 → 写接口 → 广告回调** 的顺序发布。配置调整只影响新订单和新操作；已有订单应继续使用创建时的奖励快照。回滚时保留旧函数入口，避免客户端因函数名消失而断裂。

## 7. 验证结果

本次实现已通过 JSON schema/index/init-data 解析检查、现有 Phase 4 合约测试以及全部云函数 JavaScript 语法检查。合约测试结果为 `schemas_checked: 28`，并继续验证资产 DTO 白名单、隐私门禁和待处理广告订单恢复契约。

## 参考资料

[1]: file:///home/ubuntu/upload/%23片刻应用业务逻辑、上下游关系与UI设计指导书.md "片刻应用业务逻辑、上下游关系与UI设计指导书 v1.0"
