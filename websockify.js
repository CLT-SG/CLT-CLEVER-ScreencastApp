const url = require('url');
const net = require('net');
const os = require('os');
const log = require('electron-log');
const { mdnsHostname } = require('./lib/host-names');
const { createRoutedServer, isAudioPath } = require('./lib/ws-router');

const attached = new WeakMap()

function matchVncPath(pathname) {
  return !isAudioPath(pathname)
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
        const [targetHost, targetPort] = matchingTarget.target.split(':')
        log.info(`WebSocket connection from ${remote}: ${pathname} -> ${targetHost}:${targetPort}`)
        const tcpConnection = net.createConnection({
          host: targetHost,
          port: parseInt(targetPort, 10)
        })

        let clientClosed = false
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

        tcpConnection.on('connect', function() {
          log.info(`TCP connection established to ${targetHost}:${targetPort}`)
        })
        tcpConnection.on('error', function(err) {
          const refused = err && (err.code === 'ECONNREFUSED' || err.code === 'EHOSTUNREACH')
          const reason = refused
            ? `Connection refused ${targetHost}:${targetPort}`
            : `TCP connection error ${targetHost}:${targetPort}: ${err.message}`
          log.error(reason)
          closeSocket(1011, reason)
        })
        tcpConnection.on('close', function() {
          log.info(`TCP connection closed to ${targetHost}:${targetPort}`)
          if (ws.readyState === ws.OPEN || ws.readyState === ws.CONNECTING) {
            closeSocket(1000, 'VNC connection closed')
          }
        })
        ws.on('message', function(message) {
          const payload = Buffer.isBuffer(message) ? message : Buffer.from(message)
          if (!tcpConnection.destroyed) {
            tcpConnection.write(payload)
          }
        })
        ws.on('close', function(code, reason) {
          const why = reason ? reason.toString() : ''
          log.info(`WebSocket connection closed: ${pathname} code=${code || ''} reason=${why}`)
          tcpConnection.destroy()
        })
        ws.on('error', function(err) {
          log.error(`WebSocket error: ${err.message}`)
          tcpConnection.destroy()
        })
        tcpConnection.on('data', function(data) {
          if (ws.readyState === ws.OPEN) {
            ws.send(data, { binary: true })
          }
        })
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
    log.info(`VNC Connection mapped: ${target.path} -> IP: ${target.target}, ` +
             `Hostname: ${target.hostname}:${target.port}, FQDN: ${target.hostnameLocal}:${target.port}`)
  })

  log.info('Websockify initialized successfully')
  return wss
}

module.exports = websockify
