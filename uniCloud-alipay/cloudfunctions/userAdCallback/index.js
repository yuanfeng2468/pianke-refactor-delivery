'use strict'

const { handleRewardCallback } = require('pianke-common/rewardCallback')

/**
 * uni-ad 自动部署的 uniAdCallback 会通过 callFunction 调用业务云函数。
 * 该入口必须只返回 { isValid: boolean } 兼容格式，真正奖励由共享事务内核完成。
 */
exports.main = async (event = {}, context = {}) => {
  void context
  return handleRewardCallback(event)
}
