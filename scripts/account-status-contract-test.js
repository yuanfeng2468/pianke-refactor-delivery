'use strict'

const assert = require('assert')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const schema = JSON.parse(fs.readFileSync(path.join(root, 'uniCloud-alipay/database/user.schema.json'), 'utf8'))
assert.deepStrictEqual(schema.properties.account_status.enum, ['active', 'disabled'])

const common = fs.readFileSync(path.join(root, 'uniCloud-alipay/cloudfunctions/common/pianke-common/index.js'), 'utf8')
const wallet = fs.readFileSync(path.join(root, 'uniCloud-alipay/cloudfunctions/common/pianke-common/walletService.js'), 'utf8')
const relaxation = fs.readFileSync(path.join(root, 'uniCloud-alipay/cloudfunctions/common/pianke-common/relaxationService.js'), 'utf8')
const reward = fs.readFileSync(path.join(root, 'uniCloud-alipay/cloudfunctions/createRewardOrder/index.js'), 'utf8')
const feed = fs.readFileSync(path.join(root, 'uniCloud-alipay/cloudfunctions/getFeedAds/index.js'), 'utf8')

assert(common.includes("account_status: 'active'"), 'new user default account status missing')
assert(common.includes('function assertAccountActive'), 'shared account guard missing')
assert(wallet.includes("user.account_status || 'active'"), 'wallet ledger account guard missing')
assert(relaxation.includes("user.account_status || 'active'"), 'relaxation ledger account guard missing')
assert(reward.includes('assertAccountActive(auth.user)'), 'reward order account guard missing')
assert(feed.includes('assertAccountActive(auth.user)'), 'feed ads account guard missing')

console.log(JSON.stringify({ account_status_schema: true, default_active: true, asset_guards: true, ad_guards: true }))
