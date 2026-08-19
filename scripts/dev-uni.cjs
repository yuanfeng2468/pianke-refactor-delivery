'use strict'

const { spawn } = require('node:child_process')
const path = require('node:path')

const cli = path.resolve(__dirname, '..', 'node_modules', '.bin', process.platform === 'win32' ? 'uni.cmd' : 'uni')
const args = process.argv.slice(2)
const child = spawn(cli, args, {
  cwd: path.resolve(__dirname, '..'),
  env: {
    ...process.env,
    UNI_INPUT_DIR: path.resolve(__dirname, '..')
  },
  stdio: 'inherit'
})

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  process.exit(code ?? 1)
})
