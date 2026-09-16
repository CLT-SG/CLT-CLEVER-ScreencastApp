const url = require('url')
const { createRoutedServer, isAudioPath } = require('./ws-router')
const { normalizeAudioConfig } = require('./audio-config')
const { parseJson } = require('./audio-protocol')

let nextClient = 1

function queryOf(request) {
  try {
    return url.parse(request.url || '', true).query || {}
  } catch (err) {
    return {}
  }
}

/**
 * WebRTC signaling WebSocket. Independent from VNC websockify paths.
 * Binary frames are ignored so a stray Opus client cannot mix with VNC.
 */
function attachAudioSignaling(server, options) {
  const opts = options || {}
  const logger = opts.logger
  const wss = createRoutedServer(server, isAudioPath, {
    clientTracking: true
  }, logger)

  wss.on('connection', (ws, request) => {
    const query = queryOf(request)
    const clientId = String(query.client || ('player-' + (nextClient++)))
    ws.audioClientId = clientId
    ws.audioRole = query.role === 'host' ? 'host' : 'player'
    if (logger) logger.info(`[audio] signaling connected ${clientId} (${ws.audioRole})`)
    if (typeof opts.onJoin === 'function') {
      opts.onJoin(clientId, ws)
    }
    ws.send(JSON.stringify({
      type: 'hello',
      role: 'host',
      clientId,
      capabilities: opts.capabilities || {},
      config: normalizeAudioConfig(opts.config),
      path: '/audio',
      transport: 'webrtc',
      codec: 'opus'
    }))

    ws.on('message', (data, isBinary) => {
      if (isBinary) {
        if (logger) logger.warn('[audio] ignored binary frame on signaling socket')
        return
      }
      const message = parseJson(data)
      if (!message || !message.type) {
        if (logger) logger.warn('[audio] invalid signaling message')
        return
      }
      if (message.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong', t: Date.now() }))
        return
      }
      if (typeof opts.onMessage === 'function') {
        opts.onMessage(clientId, message, ws)
      }
    })

    ws.on('close', () => {
      if (logger) logger.info(`[audio] signaling disconnected ${clientId}`)
      if (typeof opts.onLeave === 'function') {
        opts.onLeave(clientId, ws)
      }
    })

    ws.on('error', (err) => {
      if (logger) logger.warn(`[audio] signaling error ${clientId}: ${err.message}`)
    })
  })

  function send(clientId, message) {
    const payload = typeof message === 'string' ? message : JSON.stringify(message)
    wss.clients.forEach((client) => {
      if (client.audioClientId === clientId && client.readyState === 1) {
        client.send(payload)
      }
    })
  }

  function broadcastStatus(snapshot) {
    const payload = JSON.stringify({
      type: 'status',
      ...(snapshot || {})
    })
    wss.clients.forEach((client) => {
      if (client.readyState === 1) {
        client.send(payload)
      }
    })
  }

  function closeAll() {
    wss.clients.forEach((client) => {
      try { client.close() } catch (err) { /* ignore */ }
    })
  }

  return { wss, send, broadcastStatus, closeAll }
}

module.exports = {
  attachAudioSignaling,
  parseJson
}
