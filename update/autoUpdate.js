const { autoUpdater } = require('electron-updater')
const { createUpdateStatus, canInstallNow } = require('./updateStatus')

function createAutoUpdateController(options) {
  const app = options.app
  const log = options.log
  const sendToRenderer = options.sendToRenderer
  const isSharing = options.isSharing
  const dialog = options.dialog

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.allowDowngrade = false
  if (log) {
    autoUpdater.logger = log
  }

  let latestInfo = null
  let pendingInstall = false
  let currentStatus = createUpdateStatus('idle')

  function emit(state, extra) {
    currentStatus = createUpdateStatus(state, extra)
    if (typeof sendToRenderer === 'function') {
      sendToRenderer('update-status', currentStatus)
    }
    if (log && typeof log.info === 'function') {
      log.info(`Updater: ${currentStatus.message}`)
    }
    return currentStatus
  }

  autoUpdater.on('checking-for-update', () => {
    emit('checking')
  })

  autoUpdater.on('update-available', (info) => {
    latestInfo = info
    emit('available', { version: info && info.version })
  })

  autoUpdater.on('update-not-available', () => {
    latestInfo = null
    emit('latest')
  })

  autoUpdater.on('download-progress', (progress) => {
    emit('downloading', {
      version: latestInfo && latestInfo.version,
      percent: progress && progress.percent
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    latestInfo = info || latestInfo
    if (!canInstallNow(isSharing())) {
      pendingInstall = true
      return emit('deferred-install', { version: latestInfo && latestInfo.version })
    }
    pendingInstall = false
    emit('downloaded', { version: latestInfo && latestInfo.version })
  })

  autoUpdater.on('error', (err) => {
    emit('error', { message: (err && err.message) || 'Update check failed.' })
  })

  async function checkForUpdates(userRequested) {
    if (!app.isPackaged) {
      const status = emit('dev')
      if (userRequested && dialog) {
        dialog.showMessageBox({
          type: 'info',
          title: 'Updates',
          message: status.message,
          buttons: ['OK']
        })
      }
      return status
    }

    try {
      await autoUpdater.checkForUpdates()
      return currentStatus
    } catch (err) {
      return emit('error', { message: (err && err.message) || 'Update check failed.' })
    }
  }

  async function downloadUpdate() {
    if (!app.isPackaged) {
      return emit('dev')
    }
    try {
      await autoUpdater.downloadUpdate()
      return currentStatus
    } catch (err) {
      return emit('error', { message: (err && err.message) || 'Update download failed.' })
    }
  }

  function installUpdate() {
    if (!app.isPackaged) {
      return emit('dev')
    }
    if (!canInstallNow(isSharing())) {
      pendingInstall = true
      return emit('deferred-install', { version: latestInfo && latestInfo.version })
    }
    pendingInstall = false
    autoUpdater.quitAndInstall(false, true)
    return currentStatus
  }

  function onSharingStopped() {
    if (!pendingInstall) return currentStatus
    return emit('ready-to-install', { version: latestInfo && latestInfo.version })
  }

  function getStatus() {
    return currentStatus
  }

  return {
    checkForUpdates,
    downloadUpdate,
    installUpdate,
    onSharingStopped,
    getStatus
  }
}

module.exports = {
  createAutoUpdateController
}
