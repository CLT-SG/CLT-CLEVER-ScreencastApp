'use strict'

/**
 * Helpers for pausing / tearing down remote VNC websockify viewers.
 * Closing the dashboard window only hides to the tray; these controls are what
 * actually disconnect Video Wall / Console clients.
 */

function closeWebSocketClients(wss, code, reason) {
  if (!wss || !wss.clients) {
    return 0
  }
  let closed = 0
  const text = String(reason || 'Sharing stopped').slice(0, 120)
  wss.clients.forEach((client) => {
    try {
      if (client.readyState === 0 || client.readyState === 1) {
        client.close(code || 1000, text)
        closed += 1
      }
    } catch (err) {
      try {
        client.terminate()
        closed += 1
      } catch (termErr) {
        // ignore
      }
    }
  })
  return closed
}

function setSharingEnabled(wss, enabled) {
  if (!wss) {
    return false
  }
  const next = !!enabled
  wss.sharingEnabled = next
  if (!next) {
    closeWebSocketClients(wss, 1000, 'Sharing stopped')
  }
  return next
}

function isSharingEnabled(wss) {
  if (!wss) {
    return false
  }
  // Default true so an unconfigured handle keeps today's always-on behavior.
  return wss.sharingEnabled !== false
}

module.exports = {
  closeWebSocketClients,
  setSharingEnabled,
  isSharingEnabled
}
