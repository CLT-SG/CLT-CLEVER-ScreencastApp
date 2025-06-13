const WebSocket = require('ws')
const net = require('net')
const log = require('electron-log')

/**
 * Simplified websockify module that only handles direct VNC connections
 * without master/client concepts
 * @param {Object} server - HTTPS server instance
 * @param {Array} ports - Array of port objects with path and target properties
 */
module.exports = function(server, ports) {
  const wss = new WebSocket.Server({ 
    server,
    path: '/websockify'
  })

  log.info(`Websockify server starting with ${ports.length} port mappings`)
  
  wss.on('connection', function(ws, req) {
    const pathName = req.url.split('?')[0]
    log.info(`New websockify connection to path: ${pathName}`)
    
    // Find matching port configuration
    const portConfig = ports.find(p => req.url.includes(p.path))
    
    if (!portConfig) {
      log.error(`No port configuration found for path: ${pathName}`)
      ws.close(1000, 'No matching port configuration')
      return
    }
    
    const target = portConfig.target
    log.info(`Connecting to VNC target: ${target}`)
    
    const [host, port] = target.split(':')
    
    // Create TCP connection to VNC server
    const tcpSocket = net.createConnection(parseInt(port), host, () => {
      log.info(`TCP connection established to ${host}:${port}`)
    })
    
    tcpSocket.on('data', (data) => {
      try {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(data)
        }
      } catch (error) {
        log.error(`Error sending data to WebSocket: ${error.message}`)
      }
    })
    
    tcpSocket.on('error', (error) => {
      log.error(`TCP socket error: ${error.message}`)
      if (ws.readyState === WebSocket.OPEN) {
        ws.close(1001, 'TCP connection error')
      }
    })
    
    tcpSocket.on('end', () => {
      log.info('TCP connection ended')
      if (ws.readyState === WebSocket.OPEN) {
        ws.close(1000, 'TCP connection ended')
      }
    })
    
    ws.on('message', (message) => {
      try {
        tcpSocket.write(message)
      } catch (error) {
        log.error(`Error writing to TCP socket: ${error.message}`)
      }
    })
    
    ws.on('close', () => {
      log.info('WebSocket connection closed')
      tcpSocket.end()
    })
    
    ws.on('error', (error) => {
      log.error(`WebSocket error: ${error.message}`)
      tcpSocket.end()
    })
  })
  
  log.info('Websockify server initialized successfully')
}