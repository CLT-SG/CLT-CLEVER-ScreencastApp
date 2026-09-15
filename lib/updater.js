'use strict'

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

function summarizeUpdateError(error) {
  if (!error) {
    return 'Unknown update error'
  }
  const raw = String(error.message || error)
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|ENETUNREACH|EAI_AGAIN|network/i.test(raw)) {
    return 'GitHub is unreachable. The application will keep running.'
  }
  if (/404/.test(raw) || /Cannot find latest/i.test(raw) || /latest\.yml/i.test(raw)) {
    return 'No published GitHub release was found.'
  }
  if (/invalid|yaml|yml|metadata/i.test(raw) && /update/i.test(raw)) {
    return 'Update metadata is invalid.'
  }
  const status = raw.match(/\b(\d{3})\b/)
  const code = error.code ? String(error.code) : ''
  const parts = ['Update request failed']
  if (status) parts.push(status[1])
  if (code) parts.push(code)
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
    const summary = summarizeUpdateError(error)
    logWarn('Update check failed', { error: summary })
    setStatus({
      state: STATES.ERROR,
      message: MESSAGES.error,
      error: summary
    })
    scheduleRetry()
    return status
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
    logInfo('Checking for updates', { reason })
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
    logInfo('Installing update and restarting')
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
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.allowDowngrade = false
    if (logger) {
      autoUpdater.logger = logger
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
  STATES,
  MESSAGES,
  DEFAULT_CHECK_DELAY_MS,
  DEFAULT_INTERVAL_MS
}
