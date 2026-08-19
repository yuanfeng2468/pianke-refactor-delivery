/**
 * utils.js - 工具函数库
 */

/**
 * 格式化秒数为 HH:MM:SS
 */
export function formatTime(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

/**
 * 格式化时长为中文描述
 */
export function formatDuration(seconds) {
  const s = Math.max(0, Math.floor(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  
  if (h > 0) return `${h}小时${m}分钟`
  if (m > 0) return `${m}分钟${sec > 0 ? sec + '秒' : ''}`
  return `${sec}秒`
}

/**
 * 格式化时间为 MM月DD日 HH:mm
 */
export function formatDateTime(val) {
  if (!val) return ''
  const date = new Date(val)
  if (isNaN(date.getTime())) return String(val)
  
  const month = date.getMonth() + 1
  const day = date.getDate()
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')
  return `${month}月${day}日 ${hour}:${minute}`
}

/**
 * 防抖函数
 */
export function debounce(fn, delay = 300) {
  let timer = null
  return function (...args) {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      fn.apply(this, args)
    }, delay)
  }
}

/**
 * 节流函数
 */
export function throttle(fn, delay = 300) {
  let lastTime = 0
  return function (...args) {
    const now = Date.now()
    if (now - lastTime >= delay) {
      lastTime = now
      fn.apply(this, args)
    }
  }
}

/**
 * 生成唯一ID
 */
export function generateId(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`
}

/**
 * 安全获取系统信息
 */
export function getSystemInfo() {
  try {
    return uni.getSystemInfoSync()
  } catch (e) {
    return {
      screenWidth: 375,
      screenHeight: 812,
      statusBarHeight: 44,
      platform: 'android'
    }
  }
}

/**
 * 判断是否为深色模式
 */
export function isDarkMode() {
  try {
    const sysInfo = uni.getSystemInfoSync()
    return sysInfo.theme === 'dark'
  } catch (e) {
    return true // 默认深色
  }
}

/**
 * 播放震动反馈（短震动）
 */
export function vibrateShort() {
  try {
    uni.vibrateShort({ type: 'light' })
  } catch (e) {
    // 忽略震动失败
  }
}

/**
 * 显示提示信息
 */
export function showToast(title, icon = 'none') {
  if (!title) return
  uni.showToast({
    title,
    icon,
    duration: 2000
  })
}

/**
 * 全局错误上报 (占位)
 */
export function reportError(err, context = {}) {
  console.error('[Global Error]', err, context)
  // 未来可对接日志服务
}

/**
 * 性能打点 (占位)
 */
const perfMarks = {}
export function markPerf(name) {
  perfMarks[name] = Date.now()
}

export function measurePerf(startMark, endMark) {
  if (perfMarks[startMark] && perfMarks[endMark]) {
    const duration = perfMarks[endMark] - perfMarks[startMark]
    console.log(`[Perf] ${startMark} to ${endMark}: ${duration}ms`)
    return duration
  }
  return 0
}

/**
 * 统一处理云函数返回结果
 */
export function normalizeResult(res) {
  if (!res) return { code: -1, message: '请求失败' }
  
  // uniCloud.callFunction 返回的是 { result: { code, message, data } }
  const result = res.result || res
  
  // 如果 code 已经是数字 0，则认为是成功
  if (result.code !== undefined) {
    return {
      code: Number(result.code),
      message: result.message || '',
      data: result.data || null
    }
  }
  
  // 兜底逻辑
  return {
    code: -1,
    message: result.errMsg || '未知错误',
    data: result
  }
}
