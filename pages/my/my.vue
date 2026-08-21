<template>
  <view class="my-page">
    <view class="page-header"><text class="page-title">我的</text></view>
    <view class="content-wrapper">
      <view class="user-card">
        <view class="user-info-row">
          <view class="avatar-placeholder">片</view>
          <view class="user-text"><text class="user-name">片刻用户</text><text class="user-id">ID: {{ user._id }}</text></view>
        </view>
        <view class="stats-row">
          <view class="stat-item"><text class="stat-value gold">{{ user.gold_balance || 0 }}</text><text class="stat-label">金币</text></view>
          <view class="stat-item"><text class="stat-value blue">{{ userStore.formattedRelaxTime }}</text><text class="stat-label">剩余时间</text></view>
          <view class="stat-item"><text class="stat-value green">{{ Math.floor((user.total_relaxation_seconds || 0) / 60) }}m</text><text class="stat-label">累计放松</text></view>
        </view>
      </view>

      <view class="quick-actions">
        <view class="quick-action-btn" @click="switchTab('logs')"><text class="action-icon">流水</text><text class="action-label">金币记录</text></view>
        <view class="quick-action-btn" @click="goToFeedback"><text class="action-icon">反馈</text><text class="action-label">意见建议</text></view>
        <view class="quick-action-btn" @click="handleRefreshData"><text class="action-icon">刷新</text><text class="action-label">同步数据</text></view>
      </view>

      <view class="tab-nav">
        <view v-for="tab in tabs" :key="tab.id" class="tab-item" :class="{ active: activeTab === tab.id }" @click="switchTab(tab.id)">{{ tab.label }}</view>
      </view>

      <view v-if="activeTab === 'overview'" class="section-stack">
        <!-- 成就勋章 -->
        <view class="panel achievement-panel">
          <text class="section-label">成就勋章</text>
          <view class="achievement-grid">
            <view class="achievement-item" :class="{ locked: !achievements.pioneer }">
              <text class="achievement-icon">🌱</text>
              <text class="achievement-name">初识片刻</text>
            </view>
            <view class="achievement-item" :class="{ locked: !achievements.relaxMaster }">
              <text class="achievement-icon">🧘</text>
              <text class="achievement-name">放松达人</text>
            </view>
            <view class="achievement-item" :class="{ locked: !achievements.persistenceKing }">
              <text class="achievement-icon">👑</text>
              <text class="achievement-name">坚持之王</text>
            </view>
            <view class="achievement-item" :class="{ locked: !achievements.generous }">
              <text class="achievement-icon">💎</text>
              <text class="achievement-name">慷慨之人</text>
            </view>
          </view>
        </view>

        <view class="panel invite-card">
          <text class="section-label">邀请朋友</text>
          <view class="invite-code-box"><text class="invite-code">{{ user.invite_code || '加载中' }}</text><text class="copy-btn" @click="copyInviteCode">复制</text></view>
          <text class="invite-desc">邀请成功后，奖励由云端按首次有效行为原子结算。</text>
          <view class="share-btn" @click="shareInviteCode">复制分享文案</view>
        </view>
        <view class="panel">
          <text class="section-label">今日激励进度</text>
          <view class="progress-row"><text class="progress-label">激励视频</text><view class="progress-bar"><view class="progress-fill" :style="{ width: `${quotaProgress('rewarded_video')}%` }" /></view><text class="progress-text">{{ quotaValue('rewarded_video') }}</text></view>
          <view class="progress-row"><text class="progress-label">信息流曝光</text><view class="progress-bar"><view class="progress-fill feed-progress" :style="{ width: `${quotaProgress('feed_reward')}%` }" /></view><text class="progress-text">{{ quotaValue('feed_reward') }}</text></view>
          <text class="panel-desc">当前奖励规则由运营配置控制，资产以云端返回为准。</text>
        </view>
        <view class="panel">
          <text class="section-label">服务状态</text>
          <view class="data-row"><text>账户状态</text><text class="data-value">{{ user.activation_status === 'activated' ? '已激活' : '待激活' }}</text></view>
          <view class="data-row"><text>最近同步</text><text class="data-value">{{ userStore.serverTimestamp ? formatDateTime(userStore.serverTimestamp) : '未同步' }}</text></view>
          <view class="data-row"><text>数据来源</text><text class="data-value">云端权威状态</text></view>
        </view>
        <view class="panel legal-entry-card">
          <view class="legal-entry-heading"><view><text class="section-label">了解片刻</text><text class="legal-entry-desc">使用前请阅读相关协议与隐私说明</text></view><text class="legal-entry-mark">§</text></view>
          <view class="legal-entry-actions">
            <view class="legal-entry-btn" @click="openLegal('terms')"><text>服务协议</text><text class="entry-arrow">›</text></view>
            <view class="legal-entry-btn" @click="openLegal('privacy')"><text>隐私政策</text><text class="entry-arrow">›</text></view>
          </view>
        </view>
      </view>

      <view v-else-if="activeTab === 'coupon'" class="section-stack">
        <text class="section-label section-title">免广告加时兑换</text>
        <view class="coupon-card panel">
          <view><text class="coupon-title">{{ coupon15Minutes }} 分钟加时</text><text class="coupon-subtitle">服务端原子扣减金币并增加放松时长</text></view>
          <view class="coupon-side"><text class="coupon-price">{{ config.coupon_15min_cost }} 金币</text><text class="coupon-limit">今日 {{ quotaValue('coupon_15min') }}</text><view class="exchange-btn" :class="{ disabled: !canExchange15min }" @click="confirmExchange('15min')">{{ exchangeLabel('15min') }}</view></view>
        </view>
        <view class="coupon-card panel">
          <view><text class="coupon-title">{{ coupon60Minutes }} 分钟畅享</text><text class="coupon-subtitle">并发请求只允许一次成功扣款</text></view>
          <view class="coupon-side"><text class="coupon-price">{{ config.coupon_60min_cost }} 金币</text><text class="coupon-limit">今日 {{ quotaValue('coupon_60min') }}</text><view class="exchange-btn" :class="{ disabled: !canExchange60min }" @click="confirmExchange('60min')">{{ exchangeLabel('60min') }}</view></view>
        </view>
      </view>

      <view v-else class="section-stack">
        <view class="logs-head"><text class="section-title">金币流水</text><text class="logs-total">共 {{ userStore.goldLogsTotal }} 条</text></view>
        <view v-if="!goldLogs.length" class="empty-state">暂无金币流水</view>
        <view v-for="log in goldLogs" :key="log._id" class="log-item panel">
          <view><text class="log-desc">{{ log.description || log.source || '资产变更' }}</text><text class="log-time">{{ formatDateTime(log.created_at) }} · {{ log.trans_id || '无事务号' }}</text></view>
          <text class="log-amount" :class="log.amount > 0 ? 'income' : 'expense'">{{ log.amount > 0 ? '+' : '' }}{{ log.amount }}</text>
        </view>
        <view class="load-more" @click="loadLogs">加载更多</view>
      </view>
    </view>

    <view v-if="showDialog" class="dialog-mask" @click="closeDialog">
      <view class="dialog-box" @click.stop>
        <text class="dialog-title">确认兑换</text>
        <text class="dialog-desc">{{ dialogDesc }}</text>
        <view class="dialog-balance"><text>当前金币</text><text class="dialog-gold">{{ user.gold_balance }}</text></view>
        <view class="dialog-footer"><view class="dialog-btn cancel" @click="closeDialog">取消</view><view class="dialog-btn confirm" @click="doExchange">确认</view></view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { useUserStore } from '@/store/user.js'
import { formatDateTime } from '@/utils/index.js'

const userStore = useUserStore()
const user = computed(() => userStore.user || {})
const config = computed(() => userStore.config)
const goldLogs = computed(() => userStore.goldLogs)
const canExchange15min = computed(() => userStore.canExchange15min)
const canExchange60min = computed(() => userStore.canExchange60min)
const coupon15Minutes = computed(() => Math.round(Number(config.value.coupon_15min_time || 900) / 60))
const coupon60Minutes = computed(() => Math.round(Number(config.value.coupon_60min_time || 3600) / 60))
const tabs = [{ id: 'overview', label: '概览' }, { id: 'coupon', label: '兑换' }, { id: 'logs', label: '流水' }]
const activeTab = ref('overview')
const showDialog = ref(false)
const selectedCoupon = ref('')

const achievements = computed(() => ({
  pioneer: true,
  relaxMaster: (user.value.total_relaxation_seconds || 0) >= 3600,
  persistenceKing: (user.value.continuous_checkin || 0) >= 7,
  generous: (user.value.total_ad_views || 0) >= 50
}))
function quotaSnapshot(type, fallbackUsed, fallbackLimit) {
  return userStore.dailyQuota[type] || { used_count: Number(fallbackUsed || 0), limit_count: Number(fallbackLimit || 0) }
}

function quotaValue(type) {
  const fallback = {
    rewarded_video: [user.value.daily_ad_count, userStore.dailyAdLimit],
    feed_reward: [user.value.daily_feed_count, userStore.dailyFeedLimit],
    coupon_15min: [user.value.coupon_15min_today, config.value.coupon_15min_daily_limit],
    coupon_60min: [user.value.coupon_60min_today, config.value.coupon_60min_daily_limit]
  }[type] || [0, 0]
  const quota = quotaSnapshot(type, fallback[0], fallback[1])
  return `${quota.used_count}/${quota.limit_count}`
}

function quotaProgress(type) {
  const fallback = {
    rewarded_video: [user.value.daily_ad_count, userStore.dailyAdLimit],
    feed_reward: [user.value.daily_feed_count, userStore.dailyFeedLimit]
  }[type] || [0, 0]
  const quota = quotaSnapshot(type, fallback[0], fallback[1])
  return quota.limit_count > 0 ? Math.min(100, Math.round((quota.used_count / quota.limit_count) * 100)) : 0
}

let logPage = 1

onShow(() => {
  void userStore.getUserInfo()
  if (activeTab.value === 'logs') void loadLogs(true)
})

function switchTab(tabId) {
  activeTab.value = tabId
  if (tabId === 'logs') void loadLogs(true)
}

async function handleRefreshData() {
  uni.showLoading({ title: '同步中' })
  const result = await userStore.getUserInfo()
  if (activeTab.value === 'logs') await loadLogs(true)
  uni.hideLoading()
  uni.showToast({ title: result.success ? '已同步云端数据' : '同步失败', icon: 'none' })
}

function copyInviteCode() {
  if (!user.value.invite_code) return
  try { uni.vibrateShort({ type: 'light' }) } catch (error) { console.warn('[my] vibration failed', { user_id: '', trace_id: '', error_stack: String(error?.stack || error?.message || error) }) }
  uni.setClipboardData({ 
    data: user.value.invite_code, 
    showToast: false,
    success: () => uni.showToast({ title: '邀请码已复制', icon: 'success' }) 
  })
}

function shareInviteCode() {
  const text = `我在使用片刻放松工具，邀请码：${user.value.invite_code}`
  try { uni.vibrateShort({ type: 'light' }) } catch (error) { console.warn('[my] vibration failed', { user_id: '', trace_id: '', error_stack: String(error?.stack || error?.message || error) }) }
  uni.setClipboardData({ 
    data: text, 
    showToast: false,
    success: () => uni.showToast({ title: '文案已复制', icon: 'success' }) 
  })
}

function openLegal(type) {
  uni.navigateTo({ url: `/pages/legal/legal?type=${type}` })
}

function goToFeedback() {
  uni.navigateTo({ url: '/pages/feedback/feedback' })
}

async function loadLogs(reset = false) {
  if (reset) logPage = 1
  const result = await userStore.fetchGoldLogs({ page_num: logPage, page_size: 20 })
  if (result.success) {
    // 无论是重置还是加载更多，成功后都指向下一页
    logPage += 1
  }
  return result
}

function exchangeLabel(type) {
  const allowed = type === '15min' ? canExchange15min.value : canExchange60min.value
  if (allowed) return '立即兑换'
  const cost = type === '15min' ? config.value.coupon_15min_cost : config.value.coupon_60min_cost
  const count = type === '15min' ? user.value.coupon_15min_today : user.value.coupon_60min_today
  const limit = type === '15min' ? config.value.coupon_15min_daily_limit : config.value.coupon_60min_daily_limit
  return Number(user.value.gold_balance) < Number(cost) ? '金币不足' : `今日已达 ${limit} 次`
}

function confirmExchange(type) {
  const allowed = type === '15min' ? canExchange15min.value : canExchange60min.value
  if (!allowed) return
  try { uni.vibrateShort({ type: 'medium' }) } catch (error) { console.warn('[my] vibration failed', { user_id: '', trace_id: '', error_stack: String(error?.stack || error?.message || error) }) }
  selectedCoupon.value = type
  showDialog.value = true
}

function closeDialog() {
  showDialog.value = false
  selectedCoupon.value = ''
}

async function doExchange() {
  if (!selectedCoupon.value || userStore.isLoading) return
  uni.showLoading({ title: '兑换中...', mask: true })
  const result = await userStore.exchangeCoupon(selectedCoupon.value)
  uni.hideLoading()
  closeDialog()
  
  if (result.success) {
    try { uni.vibrateShort({ type: 'success' }) } catch (error) { console.warn('[my] vibration failed', { user_id: '', trace_id: '', error_stack: String(error?.stack || error?.message || error) }) }
  } else {
    try { uni.vibrateShort({ type: 'error' }) } catch (error) { console.warn('[my] vibration failed', { user_id: '', trace_id: '', error_stack: String(error?.stack || error?.message || error) }) }
  }
  
  uni.showToast({ 
    title: result.message || (result.success ? '兑换成功' : '兑换失败'), 
    icon: result.success ? 'success' : 'none',
    duration: 2000
  })
}

const dialogDesc = computed(() => {
  if (selectedCoupon.value === '15min') return `消耗 ${config.value.coupon_15min_cost} 金币兑换 ${coupon15Minutes.value} 分钟放松时长`
  if (selectedCoupon.value === '60min') return `消耗 ${config.value.coupon_60min_cost} 金币兑换 ${coupon60Minutes.value} 分钟放松时长`
  return ''
})
</script>

<style scoped>
.my-page{min-height:100vh;padding:70rpx 0 180rpx;background:#0d0d1a;color:#fff}.page-header{display:flex;justify-content:center;padding-bottom:34rpx}.page-title{font-size:36rpx;letter-spacing:8rpx;color:rgba(255,255,255,.85)}.content-wrapper{max-width:700rpx;margin:auto;padding:0 30rpx}.user-card,.panel,.quick-action-btn{border:1rpx solid rgba(255,255,255,.1);border-radius:26rpx;background:rgba(26,26,46,.84);box-shadow:0 10rpx 28rpx rgba(0,0,0,.2)}.user-card{padding:32rpx;margin-bottom:22rpx}.user-info-row{display:flex;align-items:center;gap:20rpx;margin-bottom:28rpx}.avatar-placeholder{width:76rpx;height:76rpx;display:flex;align-items:center;justify-content:center;border-radius:50%;background:rgba(230,198,109,.16);color:#e6c66d;font-size:28rpx}.user-text{display:flex;flex-direction:column;gap:8rpx}.user-name{font-size:28rpx}.user-id{max-width:480rpx;overflow:hidden;color:rgba(255,255,255,.38);font-size:21rpx}.stats-row{display:flex;gap:12rpx}.stat-item{flex:1;padding:16rpx;text-align:center;border-radius:16rpx;background:rgba(255,255,255,.045)}.stat-value{display:block;font-size:32rpx;font-weight:700;color:#b8e8ff}.stat-value.gold{color:#e6c66d}.stat-value.green{color:#81c784}.stat-label{display:block;margin-top:6rpx;color:rgba(255,255,255,.45);font-size:20rpx}

/* 成就系统样式 */
.achievement-panel { padding: 28rpx; }
.achievement-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16rpx; margin-top: 24rpx; }
.achievement-item { display: flex; flex-direction: column; align-items: center; gap: 8rpx; transition: all 0.3s ease; }
.achievement-icon { font-size: 44rpx; filter: drop-shadow(0 0 8rpx rgba(255,255,255,0.2)); }
.achievement-name { font-size: 18rpx; color: rgba(255,255,255,0.6); text-align: center; white-space: nowrap; }
.achievement-item.locked { opacity: 0.2; filter: grayscale(1); }
.quick-actions{display:flex;gap:14rpx;margin-bottom:22rpx}.quick-action-btn{flex:1;padding:18rpx;text-align:center}.action-icon{display:block;color:#e6c66d;font-size:24rpx}.action-label{display:block;margin-top:6rpx;color:rgba(255,255,255,.55);font-size:21rpx}.tab-nav{display:flex;padding:8rpx;margin-bottom:22rpx;border-radius:18rpx;background:rgba(255,255,255,.06)}.tab-item{flex:1;padding:16rpx;text-align:center;color:rgba(255,255,255,.5);font-size:25rpx}.tab-item.active{border-radius:12rpx;background:rgba(230,198,109,.16);color:#e6c66d}.section-stack{display:flex;flex-direction:column;gap:18rpx}.panel{padding:28rpx}.section-label,.section-title{display:block;color:rgba(255,255,255,.78);font-size:28rpx;font-weight:700}.invite-code-box{display:flex;align-items:center;justify-content:space-between;margin:18rpx 0;padding:18rpx 20rpx;border-radius:14rpx;background:rgba(255,255,255,.06)}.invite-code{color:#e6c66d;font-size:34rpx;letter-spacing:5rpx}.copy-btn,.share-btn,.load-more{color:#8ec5df;font-size:23rpx}.invite-desc,.panel-desc{display:block;color:rgba(255,255,255,.48);font-size:22rpx;line-height:1.55}.share-btn{margin-top:18rpx;padding:16rpx;text-align:center;border:1rpx solid rgba(142,197,223,.28);border-radius:14rpx}.progress-row{display:flex;align-items:center;gap:16rpx;margin-top:20rpx}.progress-label{width:132rpx;color:rgba(255,255,255,.58);font-size:21rpx}.progress-bar{flex:1;height:10rpx;overflow:hidden;border-radius:99rpx;background:rgba(255,255,255,.1)}.progress-fill{height:100%;border-radius:99rpx;background:linear-gradient(90deg,#d9b450,#f4dc8a)}.feed-progress{background:linear-gradient(90deg,#8ec5df,#b8e8ff)}.progress-text,.logs-total{color:rgba(255,255,255,.55);font-size:22rpx}.panel-desc{margin-top:14rpx}.legal-entry-card{padding-bottom:22rpx}.legal-entry-heading{display:flex;align-items:flex-start;justify-content:space-between}.legal-entry-desc{display:block;margin-top:8rpx;color:rgba(255,255,255,.42);font-size:21rpx}.legal-entry-mark{display:flex;width:48rpx;height:48rpx;align-items:center;justify-content:center;border-radius:50%;background:rgba(217,180,80,.12);color:#e6c66d;font-size:28rpx}.legal-entry-actions{display:flex;gap:12rpx;margin-top:22rpx}.legal-entry-btn{display:flex;flex:1;align-items:center;justify-content:space-between;padding:17rpx 18rpx;border:1rpx solid rgba(142,197,223,.18);border-radius:15rpx;background:rgba(255,255,255,.035);color:rgba(255,255,255,.72);font-size:22rpx}.entry-arrow{color:#d9b450;font-size:30rpx;line-height:1}.data-row{display:flex;justify-content:space-between;padding:18rpx 0;border-bottom:1rpx solid rgba(255,255,255,.08);color:rgba(255,255,255,.5);font-size:23rpx}.data-row:last-child{border-bottom:0}.data-value{color:rgba(255,255,255,.8)}.coupon-card{display:flex;justify-content:space-between;gap:20rpx}.coupon-title{display:block;font-size:28rpx;font-weight:700}.coupon-subtitle,.coupon-limit{display:block;margin-top:8rpx;color:rgba(255,255,255,.45);font-size:21rpx}.coupon-side{display:flex;flex-direction:column;align-items:flex-end;min-width:190rpx}.coupon-price{color:#e6c66d;font-size:25rpx}.exchange-btn{margin-top:14rpx;padding:13rpx 18rpx;border-radius:999rpx;background:#d9b450;color:#0d0d1a;font-size:22rpx}.exchange-btn.disabled{background:rgba(255,255,255,.12);color:rgba(255,255,255,.42)}.logs-head{display:flex;justify-content:space-between;align-items:center}.log-item{display:flex;justify-content:space-between;align-items:center}.log-desc{display:block;font-size:24rpx}.log-time{display:block;max-width:480rpx;margin-top:8rpx;color:rgba(255,255,255,.38);font-size:19rpx;overflow:hidden}.log-amount{font-size:30rpx;font-weight:700}.income{color:#a8dfb2}.expense{color:#f18c8c}.empty-state{padding:70rpx 0;text-align:center;color:rgba(255,255,255,.4);font-size:24rpx}.load-more{padding:24rpx;text-align:center}.dialog-mask{position:fixed;inset:0;z-index:20;display:flex;align-items:center;justify-content:center;padding:40rpx;background:rgba(0,0,0,.7)}.dialog-box{width:100%;padding:34rpx;border-radius:24rpx;background:#202039}.dialog-title{display:block;font-size:32rpx;font-weight:700}.dialog-desc{display:block;margin:16rpx 0;color:rgba(255,255,255,.58);font-size:23rpx;line-height:1.5}.dialog-balance{display:flex;justify-content:space-between;padding:18rpx 0;color:rgba(255,255,255,.5)}.dialog-gold{color:#e6c66d;font-size:28rpx}.dialog-footer{display:flex;gap:14rpx;margin-top:22rpx}.dialog-btn{flex:1;padding:18rpx;text-align:center;border-radius:14rpx}.dialog-btn.cancel{background:rgba(255,255,255,.08);color:rgba(255,255,255,.65)}.dialog-btn.confirm{background:#d9b450;color:#0d0d1a}
</style>
