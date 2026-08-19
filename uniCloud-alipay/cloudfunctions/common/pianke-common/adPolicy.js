'use strict'

const { PiankeError, ERROR_CODES } = require('./constants')

/**
 * 核心业务广告场景策略
 * 仅保留：放松(relax)、领金币(coin_page_quick_earn)、信息流(coin_page_feed)、插屏(interstitial_exit_coin)
 * 修正：激励视频场景固定奖励 100 金币 + 300 秒(5分钟) 放松时间
 */
const SCENE_POLICIES = Object.freeze({
  // 激励视频场景：放松入口
  relax: { 
    reward_type: 'gold_and_time', 
    category: 'video', 
    grant_gold: true, 
    grant_time: true,
    fixed_gold: 100,
    fixed_time: 300 // 5分钟
  },
  // 激励视频场景：领金币入口
  coin_page_quick_earn: { 
    reward_type: 'gold_and_time', 
    category: 'video', 
    grant_gold: true, 
    grant_time: true,
    fixed_gold: 100,
    fixed_time: 300 // 5分钟
  },
  
  // 信息流曝光场景
  coin_page_feed: { 
    reward_type: 'gold_and_time', 
    category: 'feed', 
    grant_gold: true, 
    grant_time: true,
    fixed_gold: 10,
    fixed_time: 60 // 1分钟
  },
  
  // 插屏广告场景 (保持原有逻辑)
  interstitial_exit_coin: { 
    reward_type: 'none', 
    category: 'interstitial', 
    grant_gold: false, 
    grant_time: false 
  }
})

function getScenePolicy(scene) {
  const key = String(scene || '').trim()
  return SCENE_POLICIES[key] || null
}

/**
 * 简化后的奖励上下文归一化
 */
function normalizeRewardContext(input = {}) {
  let value = input
  if (typeof value === 'string') {
    try { value = JSON.parse(value) } catch (_) { value = {} }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  
  const result = {}
  const allowedKeys = ['reward_type', 'base_reward']
  for (const key of allowedKeys) {
    if (value[key] === undefined || value[key] === null) continue
    if (key === 'base_reward') {
      const number = Number(value[key])
      if (Number.isFinite(number) && number >= 0) result[key] = Math.trunc(number)
      continue
    }
    const text = String(value[key]).trim()
    if (text && text.length <= 128) result[key] = text
  }
  return result
}

function assertScene(scene) {
  const policy = getScenePolicy(scene)
  if (!policy) throw new PiankeError('不支持的广告场景', ERROR_CODES.INVALID_PARAM)
  return policy
}

function resolveScenePolicy(scene, config = {}) {
  const policy = assertScene(scene)
  const resolved = { ...policy }
  if (resolved.category === 'feed') {
    const configured = Number(config.feed_exposure_reward_time?.value ?? config.feed_exposure_reward_time)
    if (Number.isFinite(configured) && configured >= 1) resolved.fixed_time = Math.trunc(configured)
  }
  return Object.freeze(resolved)
}

module.exports = { SCENE_POLICIES, getScenePolicy, resolveScenePolicy, normalizeRewardContext, assertScene }
