<template>
  <view class="exchange-records-page">
    <!-- 顶部导航 -->
    <view class="header-bar glass-strong">
      <view class="header-back" @click="handleBack">
        <text>← 返回</text>
      </view>
      <text class="header-title">兑换记录</text>
      <view class="header-spacer"></view>
    </view>

    <!-- 筛选标签 -->
    <view class="filter-bar">
      <view
        v-for="filter in filters"
        :key="filter.value"
        class="filter-tag"
        :class="{ 'filter-active': selectedFilter === filter.value }"
        @click="handleFilterChange(filter.value)"
      >
        <text>{{ filter.label }}</text>
      </view>
    </view>

    <!-- 记录列表 -->
    <scroll-view class="records-container" scroll-y>
      <view v-if="records.length === 0" class="empty-state">
        <text class="empty-icon">📋</text>
        <text class="empty-text">暂无兑换记录</text>
      </view>

      <view v-for="record in records" :key="record._id" class="record-item">
        <view class="record-header">
          <text class="record-type" :class="`type-${record.exchange_type}`">
            {{ getTypeLabel(record.exchange_type) }}
          </text>
          <text class="record-time">{{ formatDate(record.created_at) }}</text>
        </view>

        <view class="record-details">
          <view class="detail-row">
            <text class="detail-label">消耗金币</text>
            <text class="detail-value gold">-{{ record.gold_consumed }}</text>
          </view>
          <view class="detail-row">
            <text class="detail-label">获得时间</text>
            <text class="detail-value time">+{{ formatDuration(record.time_added) }}</text>
          </view>
        </view>
      </view>

      <!-- 加载更多 -->
      <view v-if="hasMore && !isLoading" class="load-more-button">
        <button @click="handleLoadMore">加载更多</button>
      </view>

      <view v-if="isLoading" class="loading-indicator">
        <text>加载中...</text>
      </view>
    </scroll-view>

    <!-- 底部安全区 -->
    <view class="safe-bottom"></view>
  </view>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useUserStore } from '@/store/user'

const userStore = useUserStore()

const records = ref([])
const selectedFilter = ref('all')
const isLoading = ref(false)
const hasMore = ref(true)
const currentPage = ref(1)
const pageSize = 10

const filters = [
  { label: '全部', value: 'all' },
  { label: '15分钟券', value: '15min' },
  { label: '60分钟券', value: '60min' }
]

/**
 * 获取类型标签
 */
function getTypeLabel(type) {
  return type === '15min' ? '15分钟加时券' : '60分钟畅享券'
}

/**
 * 格式化日期
 */
function formatDate(timestamp) {
  const date = new Date(timestamp)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day} ${hours}:${minutes}`
}

/**
 * 格式化时间长度
 */
function formatDuration(seconds) {
  if (seconds < 60) {
    return `${seconds}秒`
  } else if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60)
    return `${minutes}分钟`
  } else {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    return `${hours}小时${minutes}分钟`
  }
}

/**
 * 加载记录
 */
async function loadRecords(pageNum = 1) {
  isLoading.value = true

  try {
    const data = {
      page_num: pageNum,
      page_size: pageSize
    }
    if (selectedFilter.value !== 'all') data.exchange_type = selectedFilter.value

    const response = await userStore.invoke('getExchangeRecords', data)
    const responseData = response.data || {}
    if (pageNum === 1) records.value = responseData.records || []
    else records.value.push(...(responseData.records || []))
    hasMore.value = Boolean(responseData.has_more)
    currentPage.value = pageNum
  } catch (e) {
    uni.showToast({ title: e.message || '网络错误，请稍后重试', icon: 'none' })
  } finally {
    isLoading.value = false
  }
}

/**
 * 处理筛选变化
 */
function handleFilterChange(filterValue) {
  selectedFilter.value = filterValue
  currentPage.value = 1
  loadRecords(1)
}

/**
 * 加载更多
 */
function handleLoadMore() {
  if (!isLoading.value && hasMore.value) {
    loadRecords(currentPage.value + 1)
  }
}

/**
 * 返回
 */
function handleBack() {
  uni.navigateBack()
}

onMounted(() => {
  loadRecords(1)
})
</script>

<style scoped>
.exchange-records-page {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background-color: #0d0d1a;
}

.header-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12rpx 16rpx;
  margin: 10rpx 16rpx 0;
  border-radius: 12rpx;
  margin-bottom: 16rpx;
}

.header-back {
  font-size: 26rpx;
  color: #4a8db7;
  font-weight: 600;
}

.header-title {
  font-size: 32rpx;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.95);
}

.header-spacer {
  width: 60rpx;
}

.filter-bar {
  display: flex;
  gap: 12rpx;
  padding: 0 16rpx 16rpx;
  overflow-x: auto;
}

.filter-tag {
  background-color: rgba(255, 255, 255, 0.06);
  border: 1rpx solid rgba(255, 255, 255, 0.12);
  border-radius: 20rpx;
  padding: 8rpx 16rpx;
  white-space: nowrap;
}

.filter-tag text {
  font-size: 26rpx;
  color: rgba(255, 255, 255, 0.6);
}

.filter-active {
  background: linear-gradient(135deg, #4a8db7 0%, #5a9dc7 100%);
  border-color: #4a8db7;
}

.filter-active text {
  color: white;
}

.records-container {
  flex: 1;
  padding: 0 16rpx;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80rpx 0;
}

.empty-icon {
  font-size: 80rpx;
  margin-bottom: 20rpx;
}

.empty-text {
  font-size: 28rpx;
  color: rgba(255, 255, 255, 0.4);
}

.record-item {
  background-color: rgba(255, 255, 255, 0.06);
  border: 1rpx solid rgba(255, 255, 255, 0.08);
  border-radius: 12rpx;
  padding: 16rpx;
  margin-bottom: 12rpx;
}

.record-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12rpx;
}

.record-type {
  font-size: 26rpx;
  font-weight: 600;
  padding: 4rpx 12rpx;
  border-radius: 6rpx;
}

.type-15min {
  background-color: rgba(74, 141, 183, 0.2);
  color: #4a8db7;
}

.type-60min {
  background-color: rgba(217, 180, 80, 0.2);
  color: #d9b450;
}

.record-time {
  font-size: 24rpx;
  color: rgba(255, 255, 255, 0.4);
}

.record-details {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.detail-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.detail-label {
  font-size: 24rpx;
  color: rgba(255, 255, 255, 0.5);
}

.detail-value {
  font-size: 26rpx;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.detail-value.gold {
  color: #ef4444;
}

.detail-value.time {
  color: #22c55e;
}

.load-more-button {
  text-align: center;
  padding: 20rpx 0;
}

.load-more-button button {
  background-color: rgba(74, 141, 183, 0.2);
  border: 1rpx solid rgba(74, 141, 183, 0.4);
  color: #4a8db7;
  font-size: 26rpx;
  padding: 12rpx 40rpx;
  border-radius: 8rpx;
}

.loading-indicator {
  text-align: center;
  padding: 20rpx 0;
}

.loading-indicator text {
  font-size: 26rpx;
  color: rgba(255, 255, 255, 0.4);
}

.safe-bottom {
  height: 100rpx;
}
</style>
