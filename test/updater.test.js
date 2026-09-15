const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('events')
const { createUpdater, summarizeUpdateError, STATES, MESSAGES } = require('../lib/updater')

class MockAutoUpdater extends EventEmitter {
  constructor() {
    super()
    this.autoDownload = true
    this.autoInstallOnAppQuit = false
    this.allowDowngrade = true
    this.logger = null
    this.installed = false
    this.downloaded = false
    this.failCheck = null
    this.failDownload = null
    this.result = 'not-available'
    this.nextInfo = { version: '2.2.1' }
  }

  async checkForUpdates() {
    this.emit('checking-for-update')
    if (this.failCheck) {
      const error = this.failCheck
      this.emit('error', error)
      throw error
    }
    if (this.result === 'available') {
      this.emit('update-available', this.nextInfo)
    } else {
      this.emit('update-not-available', this.nextInfo)
    }
    return { updateInfo: this.nextInfo }
  }

  async downloadUpdate() {
    if (this.failDownload) {
      const error = this.failDownload
      this.emit('error', error)
      throw error
    }
    this.downloaded = true
    this.emit('download-progress', { percent: 40 })
    this.emit('update-downloaded', this.nextInfo)
    return this.nextInfo
  }

  quitAndInstall() {
    this.installed = true
  }
}

function fakeTimers() {
  const timeouts = []
  const intervals = []
  return {
    setTimeout(fn, _ms) {
      timeouts.push(fn)
      return timeouts.length
    },
    clearTimeout() {},
    setInterval(fn, _ms) {
      intervals.push(fn)
      return intervals.length
    },
    clearInterval() {},
    timeouts,
    intervals
  }
}

test('summarizeUpdateError maps offline and missing-release failures', () => {
  assert.match(summarizeUpdateError({ message: 'getaddrinfo ENOTFOUND github.com' }), /unreachable/i)
  assert.match(summarizeUpdateError({ message: '404 latest.yml' }), /No published GitHub release/i)
  assert.match(summarizeUpdateError(new Error('HTTP 500 url: https://api.github.com')), /Update request failed 500/)
})

test('unpackaged builds never contact GitHub', async () => {
  const autoUpdater = new MockAutoUpdater()
  let checked = false
  autoUpdater.checkForUpdates = async () => {
    checked = true
    throw new Error('should not be called')
  }
  const updater = createUpdater({
    autoUpdater,
    app: { isPackaged: false, getVersion: () => '2.2.0' },
    isPackaged: false,
    sendStatus: () => {},
    checkDelayMs: 0,
    checkIntervalMs: 0,
    timers: fakeTimers()
  })
  const status = await updater.checkForUpdates({ reason: 'manual' })
  assert.equal(status.state, STATES.DEV)
  assert.equal(status.message, MESSAGES.dev)
  assert.equal(checked, false)
})

test('manual check reports latest version when none is available', async () => {
  const autoUpdater = new MockAutoUpdater()
  autoUpdater.result = 'not-available'
  autoUpdater.nextInfo = { version: '2.2.0' }
  const updater = createUpdater({
    autoUpdater,
    app: { isPackaged: true, getVersion: () => '2.2.0' },
    isPackaged: true,
    logger: { info() {}, warn() {} },
    checkDelayMs: 999999,
    checkIntervalMs: 0,
    timers: fakeTimers()
  })
  updater.start()
  const status = await updater.checkForUpdates({ reason: 'manual' })
  assert.equal(status.state, STATES.UNAVAILABLE)
  assert.equal(status.message, MESSAGES.unavailable)
  updater.stop()
})

test('available update can be downloaded and marked ready without auto-restart', async () => {
  const autoUpdater = new MockAutoUpdater()
  autoUpdater.result = 'available'
  autoUpdater.nextInfo = { version: '2.3.0' }
  autoUpdater.autoDownload = false
  let ready = null
  const updater = createUpdater({
    autoUpdater,
    app: { isPackaged: true, getVersion: () => '2.2.0' },
    isPackaged: true,
    logger: { info() {}, warn() {} },
    autoDownload: false,
    onReadyToInstall: (status) => { ready = status },
    checkDelayMs: 999999,
    checkIntervalMs: 0,
    timers: fakeTimers()
  })
  updater.start()
  await updater.checkForUpdates({ reason: 'manual' })
  assert.equal(updater.getStatus().state, STATES.AVAILABLE)
  await updater.downloadUpdate()
  assert.equal(updater.getStatus().state, STATES.READY)
  assert.equal(updater.getStatus().progress, 100)
  assert.equal(ready.version, '2.3.0')
  assert.equal(autoUpdater.installed, false)
  updater.installUpdate()
  assert.equal(autoUpdater.installed, true)
  updater.stop()
})

test('GitHub failures are captured and do not throw to the caller', async () => {
  const autoUpdater = new MockAutoUpdater()
  autoUpdater.failCheck = Object.assign(new Error('getaddrinfo ENOTFOUND api.github.com'), { code: 'ENOTFOUND' })
  const updater = createUpdater({
    autoUpdater,
    app: { isPackaged: true, getVersion: () => '2.2.0' },
    isPackaged: true,
    logger: { info() {}, warn() {} },
    checkDelayMs: 999999,
    checkIntervalMs: 0,
    timers: fakeTimers()
  })
  updater.start()
  const status = await updater.checkForUpdates({ reason: 'manual' })
  assert.equal(status.state, STATES.ERROR)
  assert.match(status.error, /unreachable/i)
  updater.stop()
})

test('startup schedules a delayed check so service discovery is not blocked', () => {
  const timers = fakeTimers()
  const autoUpdater = new MockAutoUpdater()
  const updater = createUpdater({
    autoUpdater,
    app: { isPackaged: true, getVersion: () => '2.2.0' },
    isPackaged: true,
    logger: { info() {}, warn() {} },
    checkDelayMs: 12000,
    checkIntervalMs: 1000,
    timers
  })
  updater.start()
  assert.equal(timers.timeouts.length, 1)
  assert.equal(timers.intervals.length, 1)
  assert.equal(updater.getStatus().state, STATES.IDLE)
  updater.stop()
})
