'use strict'

const fs = require('fs')
const path = require('path')
const root = path.resolve(__dirname, '..')

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'))
}

const pkg = readJson('package.json')
const manifest = readJson('manifest.json')
if (pkg.version !== '3.1.2' || manifest.versionName !== '3.1.2' || Number(manifest.versionCode) !== 312) throw new Error('APK version metadata is not unified at 3.1.2/312')

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

const app = fs.readFileSync(path.join(root, 'App.vue'), 'utf8')
if (app.indexOf('const privacyAgreed = await ensurePrivacyConsent()') > app.indexOf('userStore.initUser()')) throw new Error('privacy gate is not before initUser')
if (/setTimeout\([^\n]*checkPrivacyPolicy/.test(app) || /checkPrivacyPolicy\(\)/.test(app)) throw new Error('legacy delayed privacy prompt remains')

const query = fs.readFileSync(path.join(root, 'uniCloud-alipay/cloudfunctions/queryRewardOrder/index.js'), 'utf8')
if (!query.includes("['created', 'client_completed', 'verifying', 'verified', 'pending_review']") || !query.includes('10 * 60 * 1000') || !query.includes('created_at: order.created_at')) throw new Error('pending recovery contract failed')

console.log(JSON.stringify({ schemas_checked: schemas.length, asset_whitelist: true, privacy_gate: true, pending_recovery: true, apk_version: '3.1.2/312', admin_config_transaction: true }))
