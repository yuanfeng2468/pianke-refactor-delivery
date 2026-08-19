'use strict'

const { handleRewardCallback } = require('pianke-common/rewardCallback')

async function onAdReward(params = {}) {
  return handleRewardCallback(params)
}

module.exports = { onAdReward }
