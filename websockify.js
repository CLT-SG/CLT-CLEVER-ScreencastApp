const net = require('net')
const WebSocketServer = require('ws').Server
const log = require('electron-log')

/**
 * Creates WebSocket to TCP proxies for VNC connections
 * @param {Object} server - The HTTPS server instance
 * @param {Array} sockets - Array of socket configurations
 */
module.exports = (server, sockets) => {
  // Validate inputs
  if (!server) {
    log.error('No server provided to websockify')
    return
  }

  // Initialize targets array
  const targets = []
  
  // Process socket configurations
  if (Array.isArray(sockets) && sockets.length > 0) {
    log.info(`Setting up ${sockets.length} websockify targets`)
    
    sockets.forEach(t => {
      if (!t.target || !t.path) {
        log.warn(`Invalid socket config: ${JSON.stringify(t)}`)
        return
      }
      
      const [host, port] = t.target.split(':')
      targets.push({
        host,
        port,
        connection: {},
        path: t.path
      })
    })
  } else {
    log.warn('No valid sockets provided to websockify')
  }

  // Set up WebSocket servers for each target
  targets.forEach(target => {
    try {
      target.wss = new WebSocketServer({
        noServer: true
      })

      target.wss.on('connection', (client, req) => {
        const cId = Date.now()
        const clientAddr = client._socket.remoteAddress || 'unknown'
        
        // Create TCP connection to target VNC server
        try {
          target.connection[cId] = net.createConnection(target.port, target.host, () => {
            log.info(`${clientAddr} -> Connected to target on ${target.host}:${target.port}`)
          })

          // Forward data from VNC server to WebSocket client
          target.connection[cId].on('data', data => {
            try {
              if (client.readyState === client.OPEN) {
                client.send(data)
              }
            } catch (e) {
              log.warn(`${clientAddr} -> Error sending data to client: ${e.message}`)
              target.connection[cId].end()
            }
          })

          // Handle TCP connection end
          target.connection[cId].on('end', () => {
            log.info(`${clientAddr} -> Target disconnected`)
            if (client.readyState === client.OPEN) {
              client.close()
            }
          })

          // Handle TCP connection errors
          target.connection[cId].on('error', (err) => {
            log.error(`${clientAddr} -> Connection error: ${err.message}`)
            target.connection[cId].end()
            if (client.readyState === client.OPEN) {
              client.close()
            }
          })

          // Forward data from WebSocket client to VNC server
          client.on('message', (msg) => {
            if (target.connection[cId] && !target.connection[cId].destroyed) {
              target.connection[cId].write(msg)
            }
          })

          // Handle WebSocket client closure
          client.on('close', (code, reason) => {
            log.info(`WebSocket client disconnected: ${code} [ ${reason || 'No reason provided'} ]`)
            if (target.connection[cId]) {
              target.connection[cId].end()
            }
          })

          // Handle WebSocket client errors
          client.on('error', (error) => {
            log.error(`${clientAddr} -> WebSocket client error: ${error.message}`)
            if (target.connection[cId]) {
              target.connection[cId].end()
            }
          })
        } catch (err) {
          log.error(`Failed to create connection to ${target.host}:${target.port}: ${err.message}`)
          if (client.readyState === client.OPEN) {
            client.close(1011, 'Server error');
          }
        }
      })

      // Handle upgrade requests
      server.on('upgrade', (request, socket, head) => {
        if (request.url === target.path) {
          target.wss.handleUpgrade(request, socket, head, (ws) => {
            target.wss.emit('connection', ws, request)
          })
        }
      })
      
      log.info(`Websockify target configured for ${target.host}:${target.port} on path ${target.path}`)
    } catch (err) {
      log.error(`Failed to set up websockify target: ${err.message}`)
    }
  })

  // Return the configured targets
  return targets
}