# PianKe 3.1.2 发布说明

## 发布定位

3.1.2 是基于 `release/v3.1.1-production` 的修复版本，重点解决信息流曝光奖励云函数在生产部署环境中的公共模块加载风险，并将应用版本统一升级为 `3.1.2/312`。

## 修复内容

`claimFeedExposure` 现统一从 `pianke-common` 加载每日统计能力，不再直接依赖公共目录的相对路径。公共模块入口新增 `getDailyStat` 和 `incrementDailyStat` 导出，从而减少本地目录结构与云函数生产打包结构不一致造成的运行时模块解析风险。

订单恢复契约测试同步覆盖 `created`、`client_completed`、`verifying`、`verified` 和 `pending_review` 五种未终结状态，并保留十分钟恢复窗口及订单创建时间返回字段检查。

## 版本元数据

| 字段 | 值 |
|---|---:|
| npm 项目版本 | `3.1.2` |
| Android versionName | `3.1.2` |
| Android versionCode | `312` |
| 发布分支 | `release/v3.1.1-production` |

## 验证要求

发布前应运行以下检查：

```bash
pnpm install --frozen-lockfile
pnpm test:reward-closure
node scripts/phase4-contract-test.js
find uniCloud-alipay/cloudfunctions -name '*.js' -print0 | xargs -0 -n1 node --check
pnpm build:h5
git diff --check
```

此外，必须将 `pianke-common` 和 `claimFeedExposure` 一起部署到 uniCloud-Alipay，并使用真实登录会话完成广告获取、曝光开始、有效时长领取、关闭、重复请求幂等和数据库事务闭环测试。仅本地构建通过不能替代生产云函数验证。

## 上传说明

本版本将在验证通过后提交到现有 `release/v3.1.1-production` 分支，并推送至远程仓库。由于该分支名称仍包含 `v3.1.1`，版本识别应以仓库内的 `package.json`、`manifest.json` 和发布提交信息为准。
