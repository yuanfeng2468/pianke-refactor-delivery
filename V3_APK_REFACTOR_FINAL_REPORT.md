# 片刻 PianKe APK V3 重构最终报告

## 结论

本次工作针对 `release/v3.1.1-production` 完成了面向 Android APK 的代码、配置、事务审计、版本元数据和构建链路收口。用户明确要求不构建 H5，因此本次验证**只执行 App 目标构建，不执行 H5 构建**。

源码层面已关闭本报告依据中可直接确认的 P1 缺陷；App 编译产物已生成到 `dist/build/app`。由于当前沙箱没有 HBuilderX Android 原生签名环境、真实 uniCloud Space 和广告 SDK 回调环境，当前交付物是**可导入 HBuilderX 的 App 构建目录与完整源码**，不是未经签名的最终 APK 文件。不得将本地 App 编译通过冒充 Android 真机或广告生产验收。

## 本次实际修改

| 范围 | 修改 | 自检结果 |
|---|---|---|
| 运营配置 P1 | `adminOperationConfig` 改为接收事务返回值，`configVersion` 不再越过词法作用域使用 | 已通过静态契约检查 |
| 安全审计事务 | `auditSafely` 支持传入 `dbLike`；运营配置成功路径通过当前 transaction 写 `security_audit_logs` | 已通过源码检查 |
| APK 版本 | `package.json` 统一为 `3.1.1`；`manifest.json` 统一为 `versionName=3.1.1`、`versionCode=311` | 已通过版本门禁 |
| 原生隐私 | 关闭 `uniStatistics` 默认开关，避免原生统计在 JS consent gate 前处理数据 | 已写入 App manifest |
| 契约门禁 | 新增版本一致性、运营配置事务返回值和安全审计事务调用断言 | 已通过 |
| 文档收敛 | 新增本权威报告和 APK 执行清单，历史报告标记为非本次最终状态依据 | 已完成 |

## 验证证据

本次执行的最终自检日志为 `/home/ubuntu/v3-apk-final-gates.log`；隐私地址验证记录为 `/home/ubuntu/pianke-v3-privacy-validation.log`。

| 门禁 | 结果 |
|---|---|
| package、manifest、androidPrivacy JSON 解析 | 通过 |
| 数据库和云函数 JSON 解析 | 通过 |
| 全部云函数 JavaScript 语法检查 | 通过 |
| 空 catch 扫描 | 通过 |
| Phase 4 契约测试 | 通过：30 个 schema；AssetDTO 白名单、隐私启动门禁、待恢复订单、APK 版本和运营配置事务检查均通过 |
| App 目标构建 | 通过：`pnpm run build:app`，输出 `DONE Build complete` |
| H5 构建 | **按用户要求未执行** |
| App 构建目录 | 已生成 `dist/build/app`，包含 `manifest.json`、`androidPrivacy.json`、App service/view 文件 |

## 隐私 URL 状态

`androidPrivacy.json` 目前使用的法律页面地址为旧静态空间 `env-00jy6ojekxqo`。在本次网络验证中，服务协议和隐私政策均返回 HTTP 200 且有正文；manifest 中当前 uniCloud Space 为 `env-00jy6ozy1390`，该 Space 对应的两个同路径地址返回 HTTP 404。因此不能把两个 Space 说成同一个空间，也不能在没有部署法律页面前擅自把 URL 改成 404 地址。

这意味着：**当前 APK 产物使用的是已验证可访问的法律页面，但正式发布前必须由运营方确认旧静态空间仍属于正式法律页面托管环境，或将同一版本法律页面部署到当前正式空间并更新 `androidPrivacy.json`。** 验证记录见 `/home/ubuntu/pianke-v3-privacy-validation.log`。

## 仍需真实环境完成的发布门禁

以下事项不是本地源码检查可以替代的步骤：在目标 uniCloud Space 部署全部 schema/index 和云函数；执行同一用户重复广告回调、跨用户相同 `trans_id`、信息流并发 `claim/close/expire`、每日限额竞争、Asia/Shanghai 午夜切换、事务冲突重试、pending_review 定时对账和唯一索引冲突测试；在 HBuilderX 中导入 `dist/build/app` 完成 Android 签名、安装、拒绝/同意隐私、后台恢复、网络失败和覆盖升级测试；使用真实广告 SDK 验证回调签名、奖励到账、重放拒绝和对账恢复；确认隐私页面归属、SDK 清单和商店合规材料。

## 交付判定

源码重构和 APK 目标编译：**完成**。最终签名 APK、真实 uniCloud、真实广告回调和 Android 真机：**尚未在本沙箱完成，保留为发布门禁**。只有完成上述环境验收后，才可将本版本从 RC 推进为正式发布。
