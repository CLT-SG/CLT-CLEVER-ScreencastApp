const url = require('url');
const WebSocket = require('ws');
const net = require('net');
const os = require('os');
const path = require('path');
const log = require('electron-log');

/**
 * Configure websockify to handle WebSocket connections and forward them to VNC
 * @param {Server} server - HTTPS server instance
 * @param {Array} targets - Array of objects with target info: {target, path, hostname, hostnameLocal, port}
 */
function websockify(server, targets) {
  if (!server || !targets || targets.length === 0) {
    log.error('Invalid server or targets for websockify');
    return;
  }

  const hostname = os.hostname()
  const hostnameLocal = `${hostname}.local`
  
  log.info(`Starting websockify with hostname: ${hostname} and ${hostnameLocal}`)
  log.info(`Configuring ${targets.length} VNC target${targets.length > 1 ? 's' : ''}`)
  
  // Create WebSocket server using the provided HTTPS server
  const wss = new WebSocket.Server({ server })

  // Setup connection routing
  targets.forEach(target => {
    // Parse target (which should be in the format IP:PORT)
    const [targetHost, targetPort] = target.target.split(':')
    
    // Log what we're mapping
    log.info(`VNC Connection mapped: ${target.path} -> IP: ${target.target}, ` +
             `Hostname: ${target.hostname}:${target.port}, FQDN: ${target.hostnameLocal}:${target.port}`)
    
    // Multiple entry points for the same target:
    // - /screen[n] - original path 
    // - /hostname/screen[n] - hostname version
    // - /hostname-local/screen[n] - hostname.local version
  })

  // Handle incoming WebSocket connections
  wss.on('connection', function connection(ws, req) {
    const pathname = url.parse(req.url).pathname
    
    // Find the matching target for the requested path
    let matchingTarget
    let targetHost, targetPort

    // Check for direct path match first
    matchingTarget = targets.find(t => pathname === t.path)
    
    // If no direct match, check for hostname and hostname.local variations
    if (!matchingTarget) {
      // Extract the screen number from paths like /hostname/screen0 or /hostname-local/screen0
      const parts = pathname.split('/').filter(p => p)
      if (parts.length === 2) {
        const [hostType, screenPath] = parts
        
        if (hostType && screenPath && screenPath.startsWith('screen')) {
          const screenNum = screenPath.substring(6) // Get number after 'screen'
          
          matchingTarget = targets.find(t => {
            const targetScreenNum = t.path.substring(7) // Get number after '/screen'
            
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
      [targetHost, targetPort] = matchingTarget.target.split(':')
      
      log.info(`WebSocket connection: ${pathname} -> ${targetHost}:${targetPort}`)
      
      // Create TCP connection to VNC server
      const tcpConnection = net.createConnection({ 
        host: targetHost, 
        port: parseInt(targetPort) 
      })
      
      // Handle TCP connection events
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
      
      // Handle WebSocket events
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
      
      // Forward data from TCP to WebSocket
      tcpConnection.on('data', function(data) {
        ws.send(data)
      })
    } else {
      log.warn(`No target found for path: ${pathname}`)
      ws.close()
    }
  })

  log.info('Websockify initialized successfully')
}

module.exports = websockify