const UPDATE_STATES = {
  idle: 'idle',
  checking: 'checking',
  latest: 'latest',
  available: 'available',
  downloading: 'downloading',
  downloaded: 'downloaded',
  deferredInstall: 'deferred-install',
  readyToInstall: 'ready-to-install',
  error: 'error',
  dev: 'dev'
}

function normalizeVersion(version) {
  if (!version) return ''
  return 'v' + String(version).replace(/^v/i, '')
}

function createUpdateStatus(state, extra) {
  extra = extra || {}
  const versionLabel = normalizeVersion(extra.version)
  const messages = {
    idle: 'Updates have not been checked yet.',
    checking: 'Checking for updates...',
    latest: 'You are using the latest version.',
    available: versionLabel ? ('Update available: ' + versionLabel) : 'Update available.',
    downloading: extra.percent != null
      ? ('Downloading update... ' + Math.round(extra.percent) + '%')
      : 'Downloading update...',
    downloaded: 'Update downloaded. Restart to install.',
    'deferred-install': 'Update downloaded. Restart after the Screencast/VNC session ends.',
    'ready-to-install': 'Screencast session ended. Restart to install the update.',
    error: extra.message || 'Update check failed.',
    dev: 'Updates are available in packaged GitHub Release builds.'
  }

  return {
    state: state || UPDATE_STATES.idle,
    message: messages[state] || messages.idle,
    version: extra.version || null,
    percent: extra.percent == null ? null : extra.percent,
    canCheck: ['idle', 'latest', 'error', 'dev', 'available'].indexOf(state) !== -1,
    canDownload: state === UPDATE_STATES.available,
    canInstall: state === UPDATE_STATES.downloaded || state === UPDATE_STATES.readyToInstall,
    interruptSession: false
  }
}

function canInstallNow(isSharing) {
  return !isSharing
}

function shouldDeferInstall(isSharing, requestedAction) {
  return !!isSharing && (requestedAction === 'install' || requestedAction === 'restart')
}

module.exports = {
  UPDATE_STATES,
  normalizeVersion,
  createUpdateStatus,
  canInstallNow,
  shouldDeferInstall
}
