/**
 * Capabilities actually supported by CLEVER Screencast + CLEVER-node noVNC.
 * Only advertise features the current stack can use.
 */
function getCapabilities(options) {
  const audio = !!(options && options.audio)
  const monitorCount = Number(options && options.monitorCount) || 0

  return {
    multiMonitor: monitorCount > 1,
    monitorSelection: true,
    screenCrop: true,
    viewOnly: true,
    reconnect: true,
    display: {
      multiMonitor: monitorCount > 1,
      monitorSelection: true,
      screenCrop: true,
      position: true,
      size: true,
      fullDesktopCapture: true,
      individualMonitorCapture: true
    },
    scaling: {
      fitToScreen: true,
      remoteScaling: true,
      localScaling: true,
      nativeResolution: true
    },
    vnc: {
      viewOnly: true,
      remoteControl: true,
      reconnect: true,
      maxQuality: true,
      compression: true,
      connectionStatus: true,
      audio
    }
  }
}

module.exports = {
  getCapabilities
}
