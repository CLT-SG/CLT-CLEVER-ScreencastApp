const WebSocket = require('ws')
const net = require('net')
const os = require('os')
const log = require('electron-log')

/**
 * Enhanced websockify implementation with hostname support
 * @param {Object} server - HTTPS server instance
 * @param {Array} targets - Array of target configurations including hostname
 */
module.exports = function(server, targets) {
  const wss = new WebSocket.Server({ server })
  const hostname = os.hostname()
  const hostnameLocal = `${hostname}.local`
  
  log.info(`Starting websockify with hostname: ${hostname} and ${hostnameLocal}`)
  log.info(`Configuring ${targets.length} VNC targets`)
  
  wss.on('connection', function connection(ws, req) {
    const path = req.url
    log.info(`New connection on path: ${path}`)
    
    // Find matching target for the requested path
    let targetConfig = targets.find(t => t.path === path)
    
    if (!targetConfig) {
      log.warn(`No target found for path: ${path}`)
      ws.close(1000, 'No matching target')
      return
    }
    
    // Use the IP address for the actual connection (most reliable)
    const targetAddress = targetConfig.target
    const [host, port] = targetAddress.split(':')
    
    log.info(`Creating connection to VNC at ${targetAddress}`)
    
    // Create TCP connection to VNC server
    const tcpSocket = new net.Socket()
    
    // Handle data from VNC server and forward to WebSocket
    tcpSocket.on('data', function(data) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data)
      }
    })
    
    // Handle TCP socket close and close WebSocket
    tcpSocket.on('close', function() {
      log.info(`TCP connection closed for ${targetAddress}`)
      if (ws.readyState === WebSocket.OPEN) {
        ws.close()
      }
    })
    
    // Handle errors
    tcpSocket.on('error', function(err) {
      log.error(`TCP socket error: ${err.message}`)
      if (ws.readyState === WebSocket.OPEN) {
        ws.close(1001, 'Connection error')
      }
    })
    
    // Connect to the VNC server
    tcpSocket.connect(parseInt(port), host, function() {
      log.info(`Connected to VNC server at ${targetAddress}`)
    })
    
    // Handle data from WebSocket and forward to VNC server
    ws.on('message', function(message) {
      tcpSocket.write(message)
    })
    
    // Handle WebSocket close
    ws.on('close', function() {
      log.info('WebSocket closed')
      tcpSocket.destroy()
    })
    
    // Handle WebSocket errors
    ws.on('error', function(err) {
      log.error(`WebSocket error: ${err.message}`)
      tcpSocket.destroy()
    })
  })
  
  log.info('Websockify initialized successfully')
  
  // Log available connections for debugging
  targets.forEach(target => {
    log.info(`VNC Connection mapped: ${target.path} -> IP: ${target.target}, Hostname: ${target.hostname}:${target.port}, FQDN: ${target.hostnameLocal}:${target.port}`)
  })
}