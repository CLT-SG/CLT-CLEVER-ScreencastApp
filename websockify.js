const url = require('url');
const net = require('net');
const os = require('os');
const log = require('electron-log');
const { mdnsHostname } = require('./lib/host-names');
const { createRoutedServer, isAudioPath } = require('./lib/ws-router');
const { isLoopbackDisabledReason } = require('./lib/vnc-scan');

const attached = new WeakMap()

function matchVncPath(pathname) {
  return !isAudioPath(pathname)
}

function parseTarget(target) {
  const text = String(target || '')
  const idx = text.lastIndexOf(':')
  if (idx <= 0) {
    return null
  }
  return {
    host: text.slice(0, idx),
    port: parseInt(text.slice(idx + 1), 10)
  }
}

function pipeVncSocket(ws, matchingTarget, remote, pathname) {
  const primary = parseTarget(matchingTarget.target)
  const alternate = parseTarget(matchingTarget.alternateTarget)
  if (!primary || !primary.host || !primary.port) {
    log.error(`Invalid VNC target ${matchingTarget.target}`)
    try {
      ws.close(1011, 'Invalid VNC target')
    } catch (err) {
      ws.close()
    }
    return
  }

  let clientClosed = false
  let tcpConnection = null
  let usingAlternate = false

  const closeSocket = (code, reason) => {
    if (clientClosed) {
      return
    }
    clientClosed = true
    const text = String(reason || '').slice(0, 120)
    try {
      ws.close(code || 1011, text)
    } catch (err) {
      try {
        ws.close()
      } catch (closeErr) {
        log.error(`WebSocket close failed: ${closeErr.message}`)
      }
    }
  }

  const attachTcp = (host, port) => {
    log.info(`WebSocket connection from ${remote}: ${pathname} -> ${host}:${port}`)
    tcpConnection = net.createConnection({ host, port })

    tcpConnection.on('connect', function() {
      log.info(`TCP connection established to ${host}:${port}`)
    })
    tcpConnection.on('error', function(err) {
      const refused = err && (err.code === 'ECONNREFUSED' || err.code === 'EHOSTUNREACH')
      if (!usingAlternate && alternate && refused) {
        usingAlternate = true
        log.warn(`VNC ${host}:${port} refused; retrying fallback ${alternate.host}:${alternate.port}`)
        attachTcp(alternate.host, alternate.port)
        return
      }
      const reason = refused
        ? `Connection refused ${host}:${port}`
        : `TCP connection error ${host}:${port}: ${err.message}`
      log.error(reason)
      closeSocket(1011, reason)
    })
    tcpConnection.on('close', function() {
      log.info(`TCP connection closed to ${host}:${port}`)
      if (ws.readyState === ws.OPEN || ws.readyState === ws.CONNECTING) {
        closeSocket(1000, 'VNC connection closed')
      }
    })
    tcpConnection.on('data', function(data) {
      const chunk = Buffer.isBuffer(data) ? data : Buffer.from(data)
      // Do not forward UltraVNC's loopback rejection to noVNC; close with a
      // clear reason so Video Wall shows the VNC policy failure.
      if (isLoopbackDisabledReason(chunk)) {
        log.error(`VNC rejected connection: loopback disabled on ${host}:${port}. ` +
          'Enable UltraVNC/TightVNC "Allow Loopback Connections", or ensure VNC listens on the LAN IP.')
        closeSocket(1011, 'VNC loopback connections are not enabled')
        try {
          tcpConnection.destroy()
        } catch (err) {
          // ignore
        }
        return
      }
      if (ws.readyState === ws.OPEN) {
        ws.send(chunk, { binary: true })
      }
    })
  }

  ws.on('message', function(message) {
    const payload = Buffer.isBuffer(message) ? message : Buffer.from(message)
    if (tcpConnection && !tcpConnection.destroyed) {
      tcpConnection.write(payload)
    }
  })
  ws.on('close', function(code, reason) {
    const why = reason ? reason.toString() : ''
    log.info(`WebSocket connection closed: ${pathname} code=${code || ''} reason=${why}`)
    if (tcpConnection) {
      tcpConnection.destroy()
    }
  })
  ws.on('error', function(err) {
    log.error(`WebSocket error: ${err.message}`)
    if (tcpConnection) {
      tcpConnection.destroy()
    }
  })

  attachTcp(primary.host, primary.port)
}

/**
 * Configure websockify to handle WebSocket connections and forward them to VNC.
 * Audio signaling uses the same HTTPS server on /audio and is routed separately.
 * @param {Server} server - HTTPS server instance
 * @param {Array} targets - Array of objects with target info: {target, path, hostname, hostnameLocal, port}
 */
function websockify(server, targets) {
  if (!server || !targets || targets.length === 0) {
    log.error('Invalid server or targets for websockify');
    return;
  }

  const hostname = os.hostname()
  const hostnameLocal = mdnsHostname(hostname)
  
  log.info(`Starting websockify with hostname: ${hostname} and ${hostnameLocal}`)
  log.info(`Configuring ${targets.length} VNC target${targets.length > 1 ? 's' : ''}`)

  let wss = attached.get(server)
  if (!wss) {
    wss = createRoutedServer(server, matchVncPath, {}, log)
    attached.set(server, wss)
    wss.on('connection', function connection(ws, req) {
      const pathname = url.parse(req.url).pathname
      const remote = (req && (req.socket && req.socket.remoteAddress)) ||
        (req.headers && req.headers['x-forwarded-for']) ||
        'unknown'
      const currentTargets = wss.vncTargets || []
      log.info(`Remote WebSocket client ${remote} requested ${pathname}`)

      let matchingTarget = currentTargets.find(t => pathname === t.path)

      if (!matchingTarget) {
        const parts = pathname.split('/').filter(p => p)
        if (parts.length === 2) {
          const [hostType, screenPath] = parts
          if (hostType && screenPath && screenPath.startsWith('screen')) {
            const screenNum = screenPath.substring(6)
            matchingTarget = currentTargets.find(t => {
              const targetScreenNum = t.path.substring(7)
              if (hostType === 'hostname' && targetScreenNum === screenNum) {
                return true
              }
              if (hostType === 'hostname-local' && targetScreenNum === screenNum) {
                return true
              }
              return false
            })
          }
        }
      }

      if (matchingTarget) {
        pipeVncSocket(ws, matchingTarget, remote, pathname)
      } else {
        const known = currentTargets.map(t => t.path).join(', ') || '(none)'
        log.warn(`Rejected remote client ${remote}: no VNC target for path ${pathname}; known paths: ${known}`)
        try {
          ws.close(1008, `No VNC target for ${pathname}`.slice(0, 120))
        } catch (err) {
          ws.close()
        }
      }
    })
  }

  wss.vncTargets = targets
  targets.forEach(target => {
    log.info(`VNC Connection mapped: ${target.path} -> IP: ${target.target}` +
             (target.alternateTarget ? ` fallback ${target.alternateTarget}` : '') +
             `, Hostname: ${target.hostname}:${target.port}, FQDN: ${target.hostnameLocal}:${target.port}`)
  })

  log.info('Websockify initialized successfully')
  return wss
}

module.exports = websockify
