'use strict'

const path = require('path')
const os = require('os')
const log = require('electron-log')

const LOG_DIR = path.join(os.homedir(), 'clevervnc-log')

function isoDate () {
  return new Date().toISOString().slice(0, 10)
}

// One log file per day, e.g. ~/clevervnc-log/2026-09-11.log
log.transports.file.resolvePathFn = () => path.join(LOG_DIR, isoDate() + '.log')
log.transports.file.maxSize = 5 * 1024 * 1024
log.transports.console.format = '[{h}:{i}:{s}.{ms}] [{level}] {text}'

module.exports = log
