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
      const currentTargets = wss.vncTargets || []

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
        log.info(`WebSocket connection: ${pathname} -> ${targetHost}:${targetPort}`)
        const tcpConnection = net.createConnection({
          host: targetHost,
          port: parseInt(targetPort)
        })

        tcpConnection.on('connect', function() {
          log.info(`TCP connection established to ${targetHost}:${targetPort}`)
        })
        tcpConnection.on('error', function(err) {
          log.error(`TCP connection error to ${targetHost}:${targetPort}: ${err.message}`)
          ws.close()
        })
        tcpConnection.on('close', function() {
          log.info(`TCP connection closed to ${targetHost}:${targetPort}`)
          ws.close()
        })
        ws.on('message', function(message) {
          tcpConnection.write(message)
        })
        ws.on('close', function() {
          log.info(`WebSocket connection closed: ${pathname}`)
          tcpConnection.destroy()
        })
        ws.on('error', function(err) {
          log.error(`WebSocket error: ${err.message}`)
          tcpConnection.destroy()
        })
        tcpConnection.on('data', function(data) {
          ws.send(data)
        })
      } else {
        log.warn(`No VNC target found for path: ${pathname}`)
        ws.close()
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
