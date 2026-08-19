'use strict'

const { spawnSync } = require('node:child_process')
const path = require('node:path')

const target = process.argv[2] || 'h5'
const args = ['build']
if (target === 'app') args.push('-p', 'app')
if (!['h5', 'app'].includes(target)) {
  console.error(`Unsupported build target: ${target}`)
  process.exit(2)
}

const cli = path.resolve(__dirname, '..', 'node_modules', '.bin', process.platform === 'win32' ? 'uni.cmd' : 'uni')
const result = spawnSync(cli, args, {
  cwd: path.resolve(__dirname, '..'),
  env: { ...process.env, UNI_INPUT_DIR: path.resolve(__dirname, '..') },
  stdio: 'inherit'
})

if (result.error) {
  console.error(result.error.message)
  process.exit(1)
}
process.exit(result.status === null ? 1 : result.status)
