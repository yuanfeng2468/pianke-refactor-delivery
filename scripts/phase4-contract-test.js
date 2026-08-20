'use strict'

const fs = require('fs')
const path = require('path')
const root = path.resolve(__dirname, '..')

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'))
}

const pkg = readJson('package.json')
const manifest = readJson('manifest.json')
const commonPkg = readJson('uniCloud-alipay/cloudfunctions/common/pianke-common/package.json')
const release = require(path.join(root, 'uniCloud-alipay/cloudfunctions/common/pianke-common/constants')).RELEASE
if (pkg.version !== '3.1.3' || manifest.versionName !== '3.1.3' || Number(manifest.versionCode) !== 313 || commonPkg.version !== '3.1.3' || release.schema_version !== '3.1.3' || release.cloud_module_version !== 'pianke-common@3.1.3') throw new Error('release metadata is not unified at 3.1.3/313')

const adminConfig = fs.readFileSync(path.join(root, 'uniCloud-alipay/cloudfunctions/adminOperationConfig/index.js'), 'utf8')
if (!adminConfig.includes('const transactionResult = await runTransaction')) throw new Error('admin config transaction result contract failed')
if (!adminConfig.includes('config_version: transactionResult.configVersion')) throw new Error('admin config version scope contract failed')
if (!adminConfig.includes('addSecurityAuditLog({') || !adminConfig.includes('}, transaction)')) throw new Error('admin security audit transaction contract failed')

const schemaDir = path.join(root, 'uniCloud-alipay/database')
const schemas = fs.readdirSync(schemaDir).filter((name) => name.endsWith('.schema.json'))
for (const name of schemas) readJson(path.join('uniCloud-alipay/database', name))

const dto = require(path.join(root, 'uniCloud-alipay/cloudfunctions/common/pianke-common/assetDto'))
const payload = dto.buildAssetDTO({
  _id: 'u1', gold_balance: 10, relaxation_time: 20, activation_status: 'activated',
  invite_code: 'ABC', daily_ad_count: 1, daily_feed_count: 2,
  daily_ad_date: '2026-08-19', daily_feed_date: '2026-08-19',
  phone: 'must-not-leak', openid: 'must-not-leak'
}, 123)
const allowed = new Set(['user_id', 'balance_gold', 'balance_relax_seconds', 'activation_status', 'invite_code', 'daily_ad_count', 'daily_feed_count', 'last_ad_date', 'last_feed_date'])
for (const key of Object.keys(payload.user)) if (!allowed.has(key)) throw new Error(`AssetDTO leaked field: ${key}`)
if (payload.user.balance_gold !== 10 || payload.user.balance_relax_seconds !== 20) throw new Error('AssetDTO mapping failed')
if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.server_date)) throw new Error('AssetDTO server_date contract failed')

const app = fs.readFileSync(path.join(root, 'App.vue'), 'utf8')
if (app.indexOf('const privacyAgreed = await ensurePrivacyConsent()') > app.indexOf('userStore.initUser()')) throw new Error('privacy gate is not before initUser')
if (/setTimeout\([^\n]*checkPrivacyPolicy/.test(app) || /checkPrivacyPolicy\(\)/.test(app)) throw new Error('legacy delayed privacy prompt remains')

const query = fs.readFileSync(path.join(root, 'uniCloud-alipay/cloudfunctions/queryRewardOrder/index.js'), 'utf8')
if (!query.includes("['created', 'client_completed', 'verifying', 'verified', 'pending_review']") || !query.includes('10 * 60 * 1000') || !query.includes('orders')) throw new Error('pending recovery contract failed')
const feed = fs.readFileSync(path.join(root, 'uniCloud-alipay/cloudfunctions/getFeedAds/index.js'), 'utf8')
if (!feed.includes("['rewarded', 'closed', 'expired']") || !feed.includes('Math.random()')) throw new Error('feed terminal session immutability contract failed')
const relax = fs.readFileSync(path.join(root, 'uniCloud-alipay/cloudfunctions/syncRelaxStats/index.js'), 'utf8')
if (!relax.includes('idempotent_replay') || !relax.includes('synced_seconds')) throw new Error('relax sync idempotency contract failed')

console.log(JSON.stringify({ schemas_checked: schemas.length, asset_whitelist: true, server_date: true, privacy_gate: true, pending_recovery: true, feed_terminal_immutable: true, relax_sync_idempotent: true, apk_version: '3.1.3/313', admin_config_transaction: true }))
