# PianKe APK v3.1.1 构建交付说明

本交付包面向 Android APK，不包含 H5 构建结果。本地已完成 uni-app App 目标编译，产物位于 `dist/build/app`。

## 在构建机生成签名 APK

使用与项目 uni-app/Android SDK 版本匹配的 HBuilderX，导入本包根目录或直接导入 `dist/build/app`，确认 `manifest.json` 中 `versionName=3.1.3`、`versionCode=313`，配置正式 Android 签名证书后执行云端打包或本地打包。不得在没有签名配置和真实应用包名确认的情况下替换正式 APK。

## 构建后验收

安装 APK 后必须依次验证隐私政策拒绝和同意、首次启动不初始化用户和广告、同意后初始化、广告重复回调不重复发奖、信息流并发 claim/close、后台恢复、网络失败、版本覆盖升级和真实广告 SDK 回调。uniCloud 目标 Space 必须先部署 schema/index、`pianke-common@3.1.3` 公共模块、云函数和 `reconcileRewardOrders` 对账 timer，并确认 `PIANKE_RECONCILE_TIMER_ENABLED=true`。

## 当前明确限制

沙箱已完成 App 编译、JSON/语法/契约/空 catch/版本门禁，但没有 Android 原生签名环境、真实 uniCloud 数据库事务环境或广告供应商回调环境。因此交付包不虚构一个未经签名或未经真机验收的 APK。
