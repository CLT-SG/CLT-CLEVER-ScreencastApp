/**
 * Focus-aware startup policy for hiding the main window to the system tray.
 *
 * Pure state machine with no Electron dependency so it can be unit-tested.
 * Callers wire Electron lifecycle events (did-finish-load, focus/blur, tray
 * ready, services ready) into the returned API. Hiding never implies quit —
 * the caller must only call BrowserWindow.hide() (or equivalent).
 */

function createStartupWindowPolicy(options = {}) {
  const autoHideEnabled = options.autoHideEnabled !== false
  const onHide = typeof options.onHide === 'function' ? options.onHide : () => {}
  const onKeepVisible = typeof options.onKeepVisible === 'function' ? options.onKeepVisible : () => {}
  const logInfo = typeof options.logInfo === 'function' ? options.logInfo : () => {}

  let trayReady = false
  let uiReady = false
  let servicesReady = false
  let focused = false
  let decided = false
  let waitingForBlur = false
  let hiddenToTray = false

  function startupComplete() {
    return trayReady && uiReady && servicesReady
  }

  function hideToTray(reason) {
    if (decided && hiddenToTray) {
      return
    }
    decided = true
    waitingForBlur = false
    hiddenToTray = true
    logInfo(`[Window] Hiding main window to tray (${reason})`)
    onHide()
    logInfo('[Tray] ScreencastApp running in background')
  }

  function keepVisible() {
    if (waitingForBlur) {
      return
    }
    waitingForBlur = true
    logInfo('[Window] Keeping main window visible')
    onKeepVisible()
  }

  function maybeDecide() {
    if (!autoHideEnabled || decided || !startupComplete()) {
      return
    }

    logInfo(`[Window] Startup focus state: ${focused ? 'focused' : 'not focused'}`)
    if (focused) {
      keepVisible()
      return
    }
    hideToTray('startup complete, not focused')
  }

  function markTrayReady() {
    if (trayReady) {
      return
    }
    trayReady = true
    logInfo('[Tray] Tray initialized')
    maybeDecide()
  }

  function markUiReady() {
    if (uiReady) {
      return
    }
    uiReady = true
    logInfo('[Window] Main window finished loading')
    maybeDecide()
  }

  function markServicesReady() {
    if (servicesReady) {
      return
    }
    servicesReady = true
    logInfo('[Startup] Required services initialized')
    maybeDecide()
  }

  function setFocused(isFocused) {
    focused = !!isFocused
    if (!autoHideEnabled || decided) {
      return
    }
    if (focused) {
      if (startupComplete()) {
        // User grabbed the window after services/UI were ready — keep it up
        // until they blur.
        keepVisible()
      }
      return
    }

    // Blur after startup: hide once when the user leaves the window.
    if (startupComplete() && waitingForBlur) {
      hideToTray('lost focus after startup')
      return
    }
    maybeDecide()
  }

  function cancelAutoHide(reason) {
    if (decided && hiddenToTray) {
      return
    }
    decided = true
    waitingForBlur = false
    logInfo(`[Window] Auto-hide cancelled${reason ? `: ${reason}` : ''}`)
  }

  function getState() {
    return {
      autoHideEnabled,
      trayReady,
      uiReady,
      servicesReady,
      focused,
      decided,
      waitingForBlur,
      hiddenToTray,
      startupComplete: startupComplete()
    }
  }

  return {
    markTrayReady,
    markUiReady,
    markServicesReady,
    setFocused,
    cancelAutoHide,
    getState
  }
}

module.exports = {
  createStartupWindowPolicy
}
