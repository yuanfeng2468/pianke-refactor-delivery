# 片刻 PianKe APK 重构交付与验证报告

## 交付结论

本次重构严格以两份用户提供的规范文档为联合要求，已在解压后的源码工作区完成 Phase 0 至 Phase 4 的代码整改与静态验证，并保留原有云函数入口名称，避免部署期间发生调用断裂。当前源码可作为候选发布分支继续进行真实云端联调；由于工作区不包含 Android/uni-app 完整构建环境、真实云数据库和广告平台回调环境，本报告不将静态通过误写为 APK 已签名或生产联调通过。

## 已完成事项

| 阶段 | 完成内容 | 验证方式 |
|---|---|---|
| Phase 0 | feed exposure session 严格 issued→active→rewarded；清理任务事务化；rate_limit 使用 window_start；广告事件枚举统一；interstitial request_id 幂等；后端与前端空 catch 消除 | 全量 Node CommonJS 语法检查、空 catch 扫描 |
| Phase 1 | 签到奖励从 operation_config.checkin_rewards 读取；自动邀请与手动邀请统一使用 grantInviteReward；离线放松时长采用累计 pending 秒数并复用幂等键；pending_recovery 固定十分钟窗口并返回 created_at | 全量语法检查、关键契约扫描 |
| Phase 2 | 隐私同意前置为 onLaunch 第一项；未同意时阻止 initUser、设备标识上传、广告预加载和统计同步；响应侧使用最小 AssetDTO 白名单 | 27 个 JSON schema 解析、AssetDTO 白名单测试、启动顺序测试 |
| Phase 3 | 增加 api.js 统一响应/断言边界；增加 architecture.js 域门面；增加云函数领域映射文档；保留旧入口以支持灰度部署和回滚 | 共享模块加载测试、全量语法检查 |
| Phase 4 | 建立可重复的契约测试脚本，覆盖 schema、隐私门禁、AssetDTO、pending recovery 和空 catch 禁止项 | `node scripts/phase4-contract-test.js` |

## 验证结果

本次验证输出为：27 个数据库 schema 成功解析；AssetDTO 白名单检查通过；隐私门禁检查通过；pending recovery 契约检查通过；全部云函数通过 `node --check`；源码未发现空 catch 块；共享架构门面加载成功。

## 重要发布边界

> 静态检查通过不等于真实云环境上线通过。发布前必须使用测试数据库执行重复请求、并发请求、事务回滚、广告回调重放、邀请奖励重放、离线累计同步和清理任务对账，并核验 `wallet_ledger`、`relaxation_ledger`、`reward_grants`、`invite_logs` 与用户资产余额的一致性。

真实 APK 构建还需要在 uni-app/Android 构建机完成 debug 包、release 包、签名、安装回归和隐私弹窗人工验收；这些步骤不在当前源码沙箱内虚构为已完成。

## 可重复命令

```bash
cd /home/ubuntu/pianke-refactor
node scripts/phase4-contract-test.js
for f in $(find uniCloud-alipay/cloudfunctions -name '*.js' -type f | sort); do node --check "$f"; done
```

## 主要新增或重构边界

`uniCloud-alipay/cloudfunctions/common/pianke-common/assetDto.js` 提供最小资产响应；`invite.js` 提供统一邀请奖励事务内核；`api.js` 提供统一成功、失败和断言辅助；`architecture.js` 提供认证、幂等、事务、日志、校验、资产和会话域门面；`ARCHITECTURE.md` 记录云函数领域映射；`scripts/phase4-contract-test.js` 提供确定性契约测试。

## 发布前人工清单

| 检查项 | 状态 |
|---|---|
| 测试库部署全部 schema 并验证索引 | 待真实云环境 |
| 双用户邀请奖励并发与重放 | 待真实云环境 |
| feed session 过期清理与奖励防重 | 待真实云环境 |
| 广告平台回调重放和异常回调 | 待真实广告环境 |
| 隐私拒绝后无网络请求、无设备标识上传 | 待真机验收 |
| APK debug/release 构建与签名 | 待 uni-app/Android 构建机 |
| 生产灰度、监控、回滚演练 | 待发布流程 |
