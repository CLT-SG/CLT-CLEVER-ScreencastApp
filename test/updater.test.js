const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('events')
const path = require('path')
const {
  createUpdater,
  summarizeUpdateError,
  detectLinuxInstallKind,
  validateUpdatePackage,
  ensureExecutablePermissions,
  installLinuxDebPackage,
  LINUX_INSTALL_FAILED,
  STATES,
  MESSAGES
} = require('../lib/updater')

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
    this.downloadedUpdateHelper = null
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

function memoryFs(files) {
  const store = new Map(Object.entries(files || {}))
  return {
    constants: { R_OK: 4 },
    existsSync(filePath) {
      return store.has(filePath)
    },
    readFileSync(filePath, _encoding) {
      if (!store.has(filePath)) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
      const entry = store.get(filePath)
      return typeof entry === 'string' ? entry : entry.content
    },
    statSync(filePath) {
      if (!store.has(filePath)) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
      const entry = store.get(filePath)
      if (typeof entry === 'string') {
        return { isFile: () => true, size: entry.length, mode: 0o644 }
      }
      return {
        isFile: () => entry.isFile !== false,
        size: entry.size != null ? entry.size : Buffer.byteLength(String(entry.content || '')),
        mode: entry.mode != null ? entry.mode : 0o644
      }
    },
    accessSync(filePath, _mode) {
      if (!store.has(filePath)) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
      const entry = store.get(filePath)
      if (entry && entry.unreadable) throw Object.assign(new Error('EACCES'), { code: 'EACCES' })
    },
    chmodSync(filePath, mode) {
      if (!store.has(filePath)) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
      const entry = store.get(filePath)
      if (typeof entry === 'string') {
        store.set(filePath, { content: entry, size: entry.length, mode })
      } else {
        entry.mode = mode
      }
    },
    _store: store
  }
}

test('summarizeUpdateError maps offline and missing-release failures', () => {
  assert.match(summarizeUpdateError({ message: 'getaddrinfo ENOTFOUND github.com' }), /unreachable/i)
  assert.match(summarizeUpdateError({ message: '404 latest.yml' }), /No published GitHub release/i)
  assert.match(summarizeUpdateError(new Error('HTTP 500 url: https://api.github.com')), /Update request failed 500/)
})

test('summarizeUpdateError maps Linux exit code 127 to a useful Ubuntu message', () => {
  const error = new Error('Command pkexec exited with code 127')
  assert.equal(summarizeUpdateError(error, 'linux'), LINUX_INSTALL_FAILED)
  assert.equal(
    summarizeUpdateError(Object.assign(new Error('Command failed'), { status: 127 }), 'linux'),
    LINUX_INSTALL_FAILED
  )
})

test('detectLinuxInstallKind prefers APPIMAGE then package-type then extension', () => {
  assert.equal(detectLinuxInstallKind({ env: { APPIMAGE: '/opt/app.AppImage' } }), 'AppImage')

  const resourcesPath = '/tmp/resources'
  const fsApi = memoryFs({
    [path.join(resourcesPath, 'package-type')]: 'deb'
  })
  assert.equal(detectLinuxInstallKind({
    env: {},
    fs: fsApi,
    resourcesPath,
    updatePath: '/cache/app.deb'
  }), 'deb')

  assert.equal(detectLinuxInstallKind({
    env: {},
    fs: memoryFs({}),
    resourcesPath: '/missing',
    updatePath: '/cache/CLEVER-Screencast-linux-x86_64-2.5.5.AppImage'
  }), 'AppImage')
})

test('validateUpdatePackage rejects missing, empty, and wrong-format packages', () => {
  const updatePath = '/cache/update.AppImage'
  const fsApi = memoryFs({
    [updatePath]: { content: 'elf', size: 4096, mode: 0o755 }
  })
  const ok = validateUpdatePackage(updatePath, 'AppImage', fsApi)
  assert.equal(ok.size, 4096)
  assert.equal(ok.executable, true)

  assert.throws(
    () => validateUpdatePackage('/missing.AppImage', 'AppImage', fsApi),
    /was not found/i
  )
  assert.throws(
    () => validateUpdatePackage(updatePath, 'deb', fsApi),
    /unexpected format/i
  )

  const emptyFs = memoryFs({
    '/cache/empty.AppImage': { content: '', size: 0, mode: 0o644 }
  })
  assert.throws(
    () => validateUpdatePackage('/cache/empty.AppImage', 'AppImage', emptyFs),
    /empty or incomplete/i
  )
})

test('ensureExecutablePermissions restores the AppImage executable bit', () => {
  const updatePath = '/cache/update.AppImage'
  const fsApi = memoryFs({
    [updatePath]: { content: 'elf', size: 2048, mode: 0o644 }
  })
  const before = validateUpdatePackage(updatePath, 'AppImage', fsApi)
  assert.equal(before.executable, false)
  const after = ensureExecutablePermissions(updatePath, fsApi)
  assert.equal(after.executable, true)
  assert.equal((fsApi.statSync(updatePath).mode & 0o111) !== 0, true)
})

test('installLinuxDebPackage uses pkexec without --disable-internal-agent', () => {
  const calls = []
  const result = installLinuxDebPackage('/cache/app.deb', {
    getuid: () => 1000,
    execFileSync(cmd, args) {
      calls.push({ cmd, args })
      return ''
    }
  })
  assert.equal(result.method, 'pkexec-dpkg')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].cmd, 'pkexec')
  assert.equal(calls[0].args[0], '/bin/bash')
  assert.equal(calls[0].args[1], '-c')
  assert.match(calls[0].args[2], /dpkg -i '\/cache\/app\.deb'/)
  assert.equal(calls[0].args.includes('--disable-internal-agent'), false)
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
    platform: 'win32',
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

test('Windows install path still uses quitAndInstall', () => {
  const autoUpdater = new MockAutoUpdater()
  const updater = createUpdater({
    autoUpdater,
    app: { isPackaged: true, getVersion: () => '2.5.5' },
    isPackaged: true,
    platform: 'win32',
    logger: { info() {}, warn() {} },
    checkDelayMs: 999999,
    checkIntervalMs: 0,
    timers: fakeTimers()
  })
  updater.start()
  updater.installUpdate()
  assert.equal(autoUpdater.installed, true)
  updater.stop()
})

test('Linux AppImage install validates package, restores +x, then quitAndInstall', async () => {
  const updatePath = '/cache/CLEVER-Screencast-linux-x86_64-2.5.6.AppImage'
  const fsApi = memoryFs({
    [updatePath]: { content: 'elf-appimage', size: 8192, mode: 0o644 }
  })
  const autoUpdater = new MockAutoUpdater()
  autoUpdater.result = 'available'
  autoUpdater.nextInfo = { version: '2.5.6' }
  autoUpdater.downloadedUpdateHelper = { file: updatePath }

  const updater = createUpdater({
    autoUpdater,
    app: { isPackaged: true, getVersion: () => '2.5.5', relaunch() {}, quit() {} },
    isPackaged: true,
    platform: 'linux',
    env: { APPIMAGE: '/home/user/CLEVER-Screencast-linux-x86_64-2.5.5.AppImage' },
    fs: fsApi,
    logger: { info() {}, warn() {} },
    autoDownload: false,
    checkDelayMs: 999999,
    checkIntervalMs: 0,
    timers: fakeTimers()
  })
  updater.start()
  await updater.checkForUpdates({ reason: 'manual' })
  await updater.downloadUpdate()
  assert.equal(updater.getStatus().state, STATES.READY)
  updater.installUpdate()
  assert.equal(autoUpdater.installed, true)
  assert.equal((fsApi.statSync(updatePath).mode & 0o111) !== 0, true)
  updater.stop()
})

test('Linux .deb install bypasses DebUpdater pkexec --disable-internal-agent', async () => {
  const updatePath = '/cache/CLEVER-Screencast-linux-amd64-2.5.6.deb'
  const resourcesPath = '/opt/CLEVER_Screencast/resources'
  const fsApi = memoryFs({
    [updatePath]: { content: 'deb-package', size: 4096, mode: 0o644 },
    [path.join(resourcesPath, 'package-type')]: 'deb'
  })
  const calls = []
  let relaunched = false
  let quit = false
  const timers = fakeTimers()
  const autoUpdater = new MockAutoUpdater()
  autoUpdater.result = 'available'
  autoUpdater.nextInfo = { version: '2.5.6' }
  autoUpdater.downloadedUpdateHelper = { file: updatePath }

  const updater = createUpdater({
    autoUpdater,
    app: {
      isPackaged: true,
      getVersion: () => '2.5.5',
      relaunch() { relaunched = true },
      quit() { quit = true }
    },
    isPackaged: true,
    platform: 'linux',
    env: {},
    fs: fsApi,
    resourcesPath,
    getuid: () => 1000,
    execFileSync(cmd, args) {
      calls.push({ cmd, args })
      return ''
    },
    logger: { info() {}, warn() {} },
    autoDownload: false,
    checkDelayMs: 999999,
    checkIntervalMs: 0,
    timers
  })
  updater.start()
  assert.equal(autoUpdater.autoInstallOnAppQuit, false)
  await updater.checkForUpdates({ reason: 'manual' })
  await updater.downloadUpdate()
  updater.installUpdate()
  assert.equal(autoUpdater.installed, false)
  assert.equal(calls[0].cmd, 'pkexec')
  assert.equal(calls[0].args.includes('--disable-internal-agent'), false)
  assert.equal(relaunched, true)
  const quitTask = timers.timeouts[timers.timeouts.length - 1]
  assert.equal(typeof quitTask, 'function')
  quitTask()
  assert.equal(quit, true)
  updater.stop()
})

test('Linux install fails gracefully when the downloaded package is missing', () => {
  const autoUpdater = new MockAutoUpdater()
  autoUpdater.downloadedUpdateHelper = { file: '/cache/missing.AppImage' }
  const updater = createUpdater({
    autoUpdater,
    app: { isPackaged: true, getVersion: () => '2.5.5' },
    isPackaged: true,
    platform: 'linux',
    env: { APPIMAGE: '/opt/app.AppImage' },
    fs: memoryFs({}),
    logger: { info() {}, warn() {} },
    checkDelayMs: 999999,
    checkIntervalMs: 0,
    timers: fakeTimers()
  })
  updater.start()
  const status = updater.installUpdate()
  assert.equal(status.state, STATES.ERROR)
  assert.match(status.error, /was not found|Unable to install the update on Ubuntu/i)
  assert.equal(autoUpdater.installed, false)
  updater.stop()
})

test('Linux pkexec failure keeps the app running with a useful error', () => {
  const updatePath = '/cache/app.deb'
  const resourcesPath = '/opt/resources'
  const fsApi = memoryFs({
    [updatePath]: { content: 'deb', size: 1024, mode: 0o644 },
    [path.join(resourcesPath, 'package-type')]: 'deb'
  })
  const autoUpdater = new MockAutoUpdater()
  autoUpdater.downloadedUpdateHelper = { file: updatePath }
  const updater = createUpdater({
    autoUpdater,
    app: { isPackaged: true, getVersion: () => '2.5.5', relaunch() {}, quit() {} },
    isPackaged: true,
    platform: 'linux',
    env: {},
    fs: fsApi,
    resourcesPath,
    getuid: () => 1000,
    execFileSync() {
      const error = new Error('Command pkexec exited with code 127')
      error.status = 127
      throw error
    },
    logger: { info() {}, warn() {} },
    checkDelayMs: 999999,
    checkIntervalMs: 0,
    timers: fakeTimers()
  })
  updater.start()
  const status = updater.installUpdate()
  assert.equal(status.state, STATES.ERROR)
  assert.equal(status.error, LINUX_INSTALL_FAILED)
  assert.equal(autoUpdater.installed, false)
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
