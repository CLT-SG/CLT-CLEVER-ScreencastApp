'use strict'

const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const STATES = {
  IDLE: 'idle',
  CHECKING: 'checking',
  AVAILABLE: 'available',
  UNAVAILABLE: 'unavailable',
  DOWNLOADING: 'downloading',
  READY: 'ready',
  ERROR: 'error',
  DEV: 'dev'
}

const MESSAGES = {
  idle: 'Idle',
  checking: 'Checking for updates...',
  available: 'Update available',
  unavailable: 'You are using the latest version.',
  downloading: 'Downloading update...',
  ready: 'Update ready',
  error: 'Update failed',
  dev: 'Updates are checked in packaged releases'
}

const DEFAULT_CHECK_DELAY_MS = 12 * 1000
const DEFAULT_INTERVAL_MS = 6 * 60 * 60 * 1000
const INITIAL_RETRY_MS = 30 * 1000
const MAX_RETRY_MS = 60 * 60 * 1000

const LINUX_INSTALL_FAILED =
  'Unable to install the update on Ubuntu. Please try again or check the application update logs.'

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`
}

function exitStatusOf(error) {
  if (!error) return null
  if (typeof error.status === 'number') return error.status
  if (typeof error.code === 'number') return error.code
  const raw = String(error.message || error)
  const match = raw.match(/\bexited with code (\d+)\b/i) || raw.match(/\bcode[:= ]+(\d+)\b/i)
  return match ? Number(match[1]) : null
}

function isCommandNotFoundError(error) {
  const status = exitStatusOf(error)
  if (status === 127) return true
  const raw = String((error && error.message) || error || '')
  return /ENOENT/i.test(raw) && /spawn|exec|command|pkexec|dpkg|mv\b/i.test(raw)
}

function summarizeUpdateError(error, platform) {
  if (!error) {
    return 'Unknown update error'
  }
  const raw = String(error.message || error)
  const resolvedPlatform = platform || process.platform

  if (isCommandNotFoundError(error) || exitStatusOf(error) === 127) {
    if (resolvedPlatform === 'linux') {
      return LINUX_INSTALL_FAILED
    }
  }
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|ENETUNREACH|EAI_AGAIN|network/i.test(raw)) {
    return 'GitHub is unreachable. The application will keep running.'
  }
  if (/404/.test(raw) || /Cannot find latest/i.test(raw) || /latest\.yml/i.test(raw)) {
    return 'No published GitHub release was found.'
  }
  if (/invalid|yaml|yml|metadata/i.test(raw) && /update/i.test(raw)) {
    return 'Update metadata is invalid.'
  }
  if (/APPIMAGE env is not defined|ERR_UPDATER_OLD_FILE_NOT_FOUND/i.test(raw)) {
    return LINUX_INSTALL_FAILED
  }
  if (/empty or incomplete|was not found|path is missing|not readable|not executable/i.test(raw)) {
    return raw
  }

  const status = raw.match(/\b(\d{3})\b/)
  const code = error.code != null ? String(error.code) : ''
  const parts = ['Update request failed']
  if (status) parts.push(status[1])
  if (code && code !== (status && status[1])) parts.push(code)
  return parts.join(' ')
}

function currentVersionOf(app) {
  if (app && typeof app.getVersion === 'function') {
    return app.getVersion()
  }
  try {
    return require('../package.json').version
  } catch (_err) {
    return '0.0.0'
  }
}

function getDownloadedUpdatePath(autoUpdater) {
  if (!autoUpdater) return null
  const helper = autoUpdater.downloadedUpdateHelper
  if (helper && typeof helper.file === 'string' && helper.file) {
    return helper.file
  }
  return null
}

function detectLinuxInstallKind(options) {
  const opts = options || {}
  const env = opts.env || process.env
  const fsApi = opts.fs || fs
  const resourcesPath = opts.resourcesPath || process.resourcesPath
  const updatePath = opts.updatePath || null

  if (env && env.APPIMAGE) {
    return 'AppImage'
  }

  if (resourcesPath) {
    try {
      const identity = path.join(resourcesPath, 'package-type')
      if (fsApi.existsSync(identity)) {
        const type = String(fsApi.readFileSync(identity, 'utf8') || '').trim()
        if (type === 'deb' || type === 'rpm' || type === 'pacman' || type === 'AppImage') {
          return type
        }
      }
    } catch (_err) {
      // Fall through to path-based detection.
    }
  }

  if (updatePath) {
    if (/\.AppImage$/i.test(updatePath)) return 'AppImage'
    if (/\.deb$/i.test(updatePath)) return 'deb'
    if (/\.rpm$/i.test(updatePath)) return 'rpm'
  }

  return 'AppImage'
}

function validateUpdatePackage(filePath, kind, fsApi) {
  const api = fsApi || fs
  if (!filePath) {
    throw new Error('Downloaded update package path is missing.')
  }
  if (!api.existsSync(filePath)) {
    throw new Error(`Downloaded update package was not found (${path.basename(filePath)}).`)
  }

  let stat
  try {
    stat = api.statSync(filePath)
  } catch (error) {
    throw new Error(`Downloaded update package is not readable (${path.basename(filePath)}).`)
  }

  if (!stat || !stat.isFile()) {
    throw new Error(`Downloaded update package is not a file (${path.basename(filePath)}).`)
  }
  if (!stat.size || stat.size <= 0) {
    throw new Error('Downloaded update package is empty or incomplete.')
  }

  if (typeof api.accessSync === 'function' && api.constants && api.constants.R_OK != null) {
    try {
      api.accessSync(filePath, api.constants.R_OK)
    } catch (_err) {
      throw new Error(`Downloaded update package is not readable (${path.basename(filePath)}).`)
    }
  }

  const expected = String(kind || '').toLowerCase()
  if (expected === 'appimage' && !/\.AppImage$/i.test(filePath)) {
    throw new Error(`Downloaded update package has unexpected format (expected AppImage): ${path.basename(filePath)}`)
  }
  if (expected === 'deb' && !/\.deb$/i.test(filePath)) {
    throw new Error(`Downloaded update package has unexpected format (expected .deb): ${path.basename(filePath)}`)
  }

  return {
    path: filePath,
    size: stat.size,
    mode: stat.mode,
    executable: ((stat.mode || 0) & 0o111) !== 0
  }
}

function ensureExecutablePermissions(filePath, fsApi) {
  const api = fsApi || fs
  const info = validateUpdatePackage(filePath, null, api)
  if (info.executable) {
    return info
  }
  if (typeof api.chmodSync !== 'function') {
    throw new Error(`Downloaded update package is not executable (${path.basename(filePath)}).`)
  }
  api.chmodSync(filePath, 0o755)
  const after = api.statSync(filePath)
  return {
    path: filePath,
    size: after.size,
    mode: after.mode,
    executable: ((after.mode || 0) & 0o111) !== 0
  }
}

function installLinuxDebPackage(installerPath, options) {
  const opts = options || {}
  const execFile = opts.execFileSync || execFileSync
  const getuid = typeof opts.getuid === 'function' ? opts.getuid : process.getuid
  const quoted = shellQuote(installerPath)
  const script = `dpkg -i ${quoted} || apt-get install -f -y`

  if (typeof getuid === 'function' && getuid() === 0) {
    try {
      execFile('dpkg', ['-i', installerPath], { encoding: 'utf8' })
    } catch (_err) {
      execFile('apt-get', ['install', '-f', '-y'], { encoding: 'utf8' })
    }
    return { method: 'dpkg-root' }
  }

  // Avoid electron-updater DebUpdater's `pkexec --disable-internal-agent`, which
  // returns exit code 127 when no Polkit session agent is available.
  execFile('pkexec', ['/bin/bash', '-c', script], { encoding: 'utf8' })
  return { method: 'pkexec-dpkg' }
}

/**
 * Electron-updater wrapper. Isolated from CLEVER-Service, VNC, and monitor logic.
 * Dependencies are injected so the module can be unit-tested without Electron.
 */
function createUpdater(options) {
  const opts = options || {}
  const autoUpdater = opts.autoUpdater
  const app = opts.app
  const logger = opts.logger || console
  const sendStatus = typeof opts.sendStatus === 'function' ? opts.sendStatus : function () {}
  const onReadyToInstall = typeof opts.onReadyToInstall === 'function' ? opts.onReadyToInstall : null
  const isPackaged = opts.isPackaged != null ? !!opts.isPackaged : !!(app && app.isPackaged)
  const autoDownload = opts.autoDownload !== false
  const checkDelayMs = opts.checkDelayMs != null ? opts.checkDelayMs : DEFAULT_CHECK_DELAY_MS
  const checkIntervalMs = opts.checkIntervalMs != null ? opts.checkIntervalMs : DEFAULT_INTERVAL_MS
  const timers = opts.timers || {
    setTimeout,
    setInterval,
    clearTimeout,
    clearInterval
  }
  const fsApi = opts.fs || fs
  const platform = opts.platform || process.platform
  const env = opts.env || process.env
  const resourcesPath = opts.resourcesPath != null ? opts.resourcesPath : process.resourcesPath
  const execFile = opts.execFileSync || execFileSync
  const getuid = opts.getuid

  let status = {
    state: STATES.IDLE,
    message: MESSAGES.idle,
    progress: 0,
    version: null,
    currentVersion: currentVersionOf(app),
    error: null,
    packaged: isPackaged
  }
  let started = false
  let checking = false
  let retryDelay = INITIAL_RETRY_MS
  let retryTimer = null
  let intervalTimer = null
  let startupTimer = null
  let notifiedReadyVersion = null
  const listeners = []

  function logInfo(message, extra) {
    if (logger && typeof logger.info === 'function') {
      logger.info(extra ? `${message} ${JSON.stringify(extra)}` : message)
    }
  }

  function logWarn(message, extra) {
    if (logger && typeof logger.warn === 'function') {
      logger.warn(extra ? `${message} ${JSON.stringify(extra)}` : message)
    } else if (logger && typeof logger.error === 'function') {
      logger.error(extra ? `${message} ${JSON.stringify(extra)}` : message)
    }
  }

  function emitStatus() {
    const payload = Object.assign({}, status)
    sendStatus(payload)
    return payload
  }

  function setStatus(partial) {
    status = Object.assign({}, status, partial)
    if (!status.message) {
      status.message = MESSAGES[status.state] || status.state
    }
    logInfo(`Update status: ${status.message}`, {
      state: status.state,
      progress: status.progress,
      version: status.version,
      error: status.error
    })
    return emitStatus()
  }

  function clearRetry() {
    if (retryTimer) {
      timers.clearTimeout(retryTimer)
      retryTimer = null
    }
  }

  function scheduleRetry() {
    clearRetry()
    retryTimer = timers.setTimeout(() => {
      retryTimer = null
      checkForUpdates({ reason: 'retry' })
    }, retryDelay)
    logInfo(`Retrying update check in ${Math.round(retryDelay / 1000)}s`)
    retryDelay = Math.min(retryDelay * 2, MAX_RETRY_MS)
  }

  function fail(error) {
    checking = false
    if (status.state === STATES.ERROR) {
      return status
    }
    const summary = summarizeUpdateError(error, platform)
    logWarn('Update check failed', {
      error: summary,
      detail: error && (error.message || String(error)),
      exitCode: exitStatusOf(error)
    })
    setStatus({
      state: STATES.ERROR,
      message: MESSAGES.error,
      error: summary
    })
    scheduleRetry()
    return status
  }

  function linuxInstallKind(updatePath) {
    return detectLinuxInstallKind({
      env,
      fs: fsApi,
      resourcesPath,
      updatePath
    })
  }

  function logInstallDiagnostics(meta) {
    const info = meta || {}
    logInfo('[Updater] Platform: ' + (info.platform || platform))
    logInfo('[Updater] Current version: ' + (info.currentVersion || status.currentVersion || 'unknown'))
    logInfo('[Updater] Target version: ' + (info.targetVersion || status.version || 'unknown'))
    logInfo('[Updater] Update package: ' + (info.updatePath || 'none'))
    logInfo('[Updater] Package kind: ' + (info.kind || 'unknown'))
    logInfo('[Updater] Package exists: ' + String(!!info.exists))
    if (info.size != null) logInfo('[Updater] Package size: ' + info.size)
    if (info.executable != null) logInfo('[Updater] Executable permissions: ' + String(!!info.executable))
    if (info.appImage) logInfo('[Updater] APPIMAGE: ' + info.appImage)
    if (info.method) logInfo('[Updater] Install method: ' + info.method)
  }

  function restartAfterLinuxInstall() {
    logInfo('[Updater] Restarting application')
    if (app && typeof app.relaunch === 'function') {
      app.relaunch()
    }
    if (app && typeof app.quit === 'function') {
      timers.setTimeout(() => {
        try {
          app.quit()
        } catch (error) {
          logWarn('[Updater] Application quit after install failed', {
            error: error.message || String(error)
          })
        }
      }, 0)
    }
  }

  function installLinuxUpdate() {
    const updatePath = getDownloadedUpdatePath(autoUpdater)
    const kind = linuxInstallKind(updatePath)
    const appImagePath = env && env.APPIMAGE ? env.APPIMAGE : null

    let packageInfo
    try {
      packageInfo = validateUpdatePackage(updatePath, kind, fsApi)
    } catch (error) {
      logWarn('[Updater] Package validation failed', {
        error: error.message || String(error),
        updatePath: updatePath || null,
        kind
      })
      return fail(error)
    }

    if (kind === 'AppImage') {
      try {
        packageInfo = ensureExecutablePermissions(updatePath, fsApi)
      } catch (error) {
        return fail(error)
      }
    }

    logInstallDiagnostics({
      platform,
      currentVersion: status.currentVersion,
      targetVersion: status.version,
      updatePath,
      kind,
      exists: true,
      size: packageInfo.size,
      executable: packageInfo.executable,
      appImage: appImagePath
    })

    if (kind === 'deb') {
      logInfo('[Updater] Installation started')
      try {
        const result = installLinuxDebPackage(updatePath, {
          execFileSync: execFile,
          getuid
        })
        logInfo('[Updater] Installer exit code: 0')
        logInfo('[Updater] Install method: ' + result.method)
        restartAfterLinuxInstall()
        return status
      } catch (error) {
        logWarn('[Updater] Installer exit code: ' + String(exitStatusOf(error) != null ? exitStatusOf(error) : 'unknown'))
        logWarn('[Updater] Installer stderr/stdout unavailable or failed', {
          error: error.message || String(error)
        })
        return fail(error)
      }
    }

    if (kind === 'AppImage') {
      if (!appImagePath) {
        return fail(new Error('APPIMAGE env is not defined'))
      }
      logInfo('[Updater] Installation started')
      try {
        autoUpdater.quitAndInstall(false, true)
        logInfo('[Updater] AppImage quitAndInstall requested')
        return status
      } catch (error) {
        return fail(error)
      }
    }

    // rpm/pacman: keep electron-updater path, but still validate first.
    logInfo('[Updater] Installation started')
    try {
      autoUpdater.quitAndInstall(false, true)
      return status
    } catch (error) {
      return fail(error)
    }
  }

  async function checkForUpdates(meta) {
    const reason = (meta && meta.reason) || 'manual'
    if (checking) {
      return status
    }
    if (!isPackaged || !autoUpdater) {
      return setStatus({
        state: STATES.DEV,
        message: MESSAGES.dev,
        progress: 0,
        error: null
      })
    }

    checking = true
    setStatus({
      state: STATES.CHECKING,
      message: MESSAGES.checking,
      error: null
    })
    logInfo('Checking for updates', { reason, platform })
    try {
      await autoUpdater.checkForUpdates()
    } catch (error) {
      return fail(error)
    }
    return status
  }

  async function downloadUpdate() {
    if (!isPackaged || !autoUpdater || typeof autoUpdater.downloadUpdate !== 'function') {
      return status
    }
    try {
      setStatus({
        state: STATES.DOWNLOADING,
        message: MESSAGES.downloading,
        error: null
      })
      await autoUpdater.downloadUpdate()
    } catch (error) {
      return fail(error)
    }
    return status
  }

  function installUpdate() {
    if (!isPackaged || !autoUpdater || typeof autoUpdater.quitAndInstall !== 'function') {
      return status
    }

    if (platform === 'linux') {
      return installLinuxUpdate()
    }

    logInfo('[Updater] Platform: ' + platform)
    logInfo('[Updater] Current version: ' + (status.currentVersion || 'unknown'))
    logInfo('[Updater] Target version: ' + (status.version || 'unknown'))
    logInfo('[Updater] Installation started')
    try {
      autoUpdater.quitAndInstall(false, true)
    } catch (error) {
      return fail(error)
    }
    return status
  }

  function bind(event, handler) {
    if (!autoUpdater || typeof autoUpdater.on !== 'function') {
      return
    }
    autoUpdater.on(event, handler)
    listeners.push([event, handler])
  }

  function configureAutoUpdater() {
    if (!autoUpdater) {
      return
    }
    autoUpdater.autoDownload = autoDownload
    autoUpdater.allowDowngrade = false
    if (logger) {
      autoUpdater.logger = logger
    }

    // DebUpdater's on-quit installer uses `pkexec --disable-internal-agent`,
    // which commonly exits 127 on Ubuntu Desktop when no Polkit agent answers.
    // Install .deb updates only through the explicit Restart and Install path.
    const kind = platform === 'linux' ? linuxInstallKind(getDownloadedUpdatePath(autoUpdater)) : null
    if (platform === 'linux' && kind === 'deb') {
      autoUpdater.autoInstallOnAppQuit = false
      logInfo('[Updater] Disabled autoInstallOnAppQuit for .deb package type')
    } else {
      autoUpdater.autoInstallOnAppQuit = true
    }

    bind('checking-for-update', () => {
      setStatus({
        state: STATES.CHECKING,
        message: MESSAGES.checking,
        error: null
      })
    })

    bind('update-available', (info) => {
      checking = false
      retryDelay = INITIAL_RETRY_MS
      clearRetry()
      setStatus({
        state: STATES.AVAILABLE,
        message: MESSAGES.available,
        version: info && info.version ? info.version : status.version,
        progress: 0,
        error: null
      })
      logInfo('Update available', { version: status.version })
    })

    bind('update-not-available', (info) => {
      checking = false
      retryDelay = INITIAL_RETRY_MS
      clearRetry()
      setStatus({
        state: STATES.UNAVAILABLE,
        message: MESSAGES.unavailable,
        version: info && info.version ? info.version : status.currentVersion,
        progress: 0,
        error: null
      })
    })

    bind('download-progress', (progress) => {
      const percent = Math.round((progress && progress.percent) || 0)
      setStatus({
        state: STATES.DOWNLOADING,
        message: MESSAGES.downloading,
        progress: percent,
        error: null
      })
    })

    bind('update-downloaded', (info) => {
      checking = false
      retryDelay = INITIAL_RETRY_MS
      clearRetry()
      const version = info && info.version ? info.version : status.version
      const updatePath = getDownloadedUpdatePath(autoUpdater)
      if (platform === 'linux' && updatePath) {
        try {
          const kind = linuxInstallKind(updatePath)
          let packageInfo = validateUpdatePackage(updatePath, kind, fsApi)
          if (kind === 'AppImage') {
            packageInfo = ensureExecutablePermissions(updatePath, fsApi)
          }
          logInstallDiagnostics({
            platform,
            currentVersion: status.currentVersion,
            targetVersion: version,
            updatePath,
            kind,
            exists: true,
            size: packageInfo.size,
            executable: packageInfo.executable,
            appImage: env && env.APPIMAGE ? env.APPIMAGE : null
          })
        } catch (error) {
          logWarn('[Updater] Post-download package validation warning', {
            error: error.message || String(error)
          })
        }
      }
      setStatus({
        state: STATES.READY,
        message: MESSAGES.ready,
        version,
        progress: 100,
        error: null
      })
      logInfo('Update downloaded', { version })
      if (onReadyToInstall && notifiedReadyVersion !== version) {
        notifiedReadyVersion = version
        try {
          onReadyToInstall(Object.assign({}, status))
        } catch (error) {
          logWarn('Update ready callback failed', { error: error.message || String(error) })
        }
      }
    })

    bind('error', (error) => {
      fail(error)
    })
  }

  function start() {
    if (started) {
      return getStatus()
    }
    started = true
    configureAutoUpdater()
    startupTimer = timers.setTimeout(() => {
      startupTimer = null
      checkForUpdates({ reason: 'startup' })
    }, checkDelayMs)
    if (checkIntervalMs > 0) {
      intervalTimer = timers.setInterval(() => {
        checkForUpdates({ reason: 'interval' })
      }, checkIntervalMs)
    }
    return getStatus()
  }

  function stop() {
    started = false
    checking = false
    clearRetry()
    if (startupTimer) {
      timers.clearTimeout(startupTimer)
      startupTimer = null
    }
    if (intervalTimer) {
      timers.clearInterval(intervalTimer)
      intervalTimer = null
    }
    if (autoUpdater && typeof autoUpdater.removeListener === 'function') {
      listeners.forEach(([event, handler]) => {
        autoUpdater.removeListener(event, handler)
      })
    }
    listeners.length = 0
  }

  function getStatus() {
    return Object.assign({}, status)
  }

  return {
    start,
    stop,
    checkForUpdates,
    downloadUpdate,
    installUpdate,
    getStatus,
    STATES,
    MESSAGES
  }
}

module.exports = {
  createUpdater,
  summarizeUpdateError,
  detectLinuxInstallKind,
  validateUpdatePackage,
  ensureExecutablePermissions,
  installLinuxDebPackage,
  getDownloadedUpdatePath,
  shellQuote,
  LINUX_INSTALL_FAILED,
  STATES,
  MESSAGES,
  DEFAULT_CHECK_DELAY_MS,
  DEFAULT_INTERVAL_MS
}
