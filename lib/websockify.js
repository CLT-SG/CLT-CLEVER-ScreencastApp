'use strict'

// CLEVER WebSocket-to-TCP proxy (websockify) with hostname support.
// Both the source (listen) and target (VNC server) addresses accept a
// hostname, an IPv4 address or an IPv6 address. Hostnames are resolved
// through the OS resolver (getaddrinfo) so plain DNS, hosts-file and
// mDNS (.local, Windows <-> Ubuntu) names all work, and the target is
// re-resolved on every new WebSocket connection so a device that gets a
// new DHCP address keeps working without a restart.

const net = require('net')
const dns = require('dns')
const http = require('http')
const { EventEmitter } = require('events')
const { WebSocketServer } = require('ws')

// Parse "host:port", "[ipv6]:port", "hostname:port" or "port".
function parseAddress (address, defaultHost) {
  address = String(address == null ? '' : address).trim()

  const bracket = address.match(/^\[([^\]]+)\]:(\d+)$/)
  if (bracket) {
    return { host: bracket[1], port: parseInt(bracket[2], 10) }
  }

  const idx = address.lastIndexOf(':')
  if (idx < 0) {
    return { host: defaultHost, port: parseInt(address, 10) }
  }

  const host = address.slice(0, idx)
  if (host.indexOf(':') !== -1 && net.isIP(host) === 0) {
    // more than one colon but not a valid bare IPv6 literal
    return { host: defaultHost, port: NaN }
  }
  return { host: host || defaultHost, port: parseInt(address.slice(idx + 1), 10) }
}

function lookupAll (name) {
  return new Promise((resolve, reject) => {
    dns.lookup(name, { all: true }, (err, addresses) => {
      if (err || !addresses || addresses.length === 0) {
        reject(err || new Error('no address found for ' + name))
      } else {
        resolve(addresses)
      }
    })
  })
}

// Resolve a hostname to an IP address (IPv4 preferred). IP literals are
// returned as-is. For cross-platform names the mDNS ".local" variant is
// tried as well (and vice versa).
async function resolveHost (host) {
  if (!host || net.isIP(host) !== 0) {
    return host
  }

  const candidates = [host]
  if (host.toLowerCase().endsWith('.local')) {
    candidates.push(host.slice(0, -'.local'.length))
  } else if (host.indexOf('.') === -1) {
    candidates.push(host + '.local')
  }

  for (const name of candidates) {
    try {
      const addresses = await lookupAll(name)
      const ipv4 = addresses.find((a) => a.family === 4)
      return (ipv4 || addresses[0]).address
    } catch (e) {
      // try the next candidate
    }
  }

  // Last resort: hand the name to net.createConnection unchanged
  return host
}

/**
 * WebSocket <-> TCP proxy server.
 *
 * Events: 'listening', 'client-connected', 'client-disconnected', 'error'
 */
class WebsockifyServer extends EventEmitter {
  /**
   * @param {object} options
   * @param {string|number} options.source  "[host:]port" to listen on
   * @param {string} options.target         "host:port" of the TCP server
   * @param {object} [options.logger]      console-like logger
   */
  constructor ({ source, target, logger = console }) {
    super()
    this._source = parseAddress(source, '')
    this._target = parseAddress(target, '')
    this._log = logger
    this._httpServer = null
    this._wsServer = null
    this._clients = new Set()

    if (isNaN(this._source.port) || isNaN(this._target.port) || !this._target.host) {
      throw new Error('websockify: usage { source: "[host:]port", target: "host:port" }')
    }
  }

  get listening () {
    return !!(this._httpServer && this._httpServer.listening)
  }

  get clientCount () {
    return this._clients.size
  }

  /** Bind the WebSocket listener. Resolves once listening. */
  async start () {
    if (this._httpServer) {
      return
    }

    const { host, port } = this._source
    this._log.info('websockify: proxying ' + (host || '*') + ':' + port +
      ' -> ' + this._target.host + ':' + this._target.port)

    // '', '*', '0.0.0.0' and '::' all mean "every interface"
    let bindHost = (host && host !== '*' && host !== '0.0.0.0' && host !== '::')
      ? await resolveHost(host)
      : undefined

    this._httpServer = http.createServer((request, response) => {
      response.writeHead(403, { 'Content-Type': 'text/plain' })
      response.end('403 Permission Denied\n')
    })
    this._wsServer = new WebSocketServer({ server: this._httpServer })
    this._wsServer.on('connection', (client, req) => {
      this._handleClient(client, req).catch((err) => {
        this._log.warn('websockify: client setup failed: ' + err.message)
        client.close()
      })
    })

    await new Promise((resolve, reject) => {
      const onError = (err) => {
        this._httpServer = null
        this._wsServer = null
        reject(err)
      }
      this._httpServer.once('error', onError)
      this._httpServer.listen(port, bindHost, () => {
        this._httpServer.removeListener('error', onError)
        this._httpServer.on('error', (err) => {
          this._log.warn('websockify: server error: ' + err.message)
          this.emit('error', err)
        })
        this._log.info('websockify: listening on ' + (bindHost || 'all interfaces') + ':' + port)
        this.emit('listening')
        resolve()
      })
    })
  }

  /** Close the listener and terminate every open proxy connection. */
  stop () {
    for (const client of this._clients) {
      try { client.terminate() } catch (e) { /* already gone */ }
    }
    this._clients.clear()
    if (this._wsServer) {
      this._wsServer.close()
      this._wsServer = null
    }
    if (this._httpServer) {
      this._httpServer.close()
      this._httpServer = null
      this._log.info('websockify: stopped')
    }
  }

  async _handleClient (client, req) {
    const clientAddr = req.socket.remoteAddress
    const log = (msg) => this._log.info('websockify [' + clientAddr + ']: ' + msg)
    log('WebSocket connection' + (req.url ? ' (' + req.url + ')' : ''))

    // Re-resolve on every connection so DHCP address changes are picked up
    const targetAddr = await resolveHost(this._target.host)
    if (targetAddr !== this._target.host) {
      log('resolved target ' + this._target.host + ' -> ' + targetAddr)
    }

    this._clients.add(client)

    const target = net.createConnection(this._target.port, targetAddr, () => {
      log('connected to target ' + targetAddr + ':' + this._target.port)
      this.emit('client-connected', clientAddr)
    })

    const cleanup = () => {
      this._clients.delete(client)
      target.destroy()
      try { client.close() } catch (e) { /* already closed */ }
    }

    target.on('data', (data) => {
      try {
        client.send(data)
      } catch (e) {
        log('client closed, cleaning up target')
        cleanup()
      }
    })
    target.on('end', () => {
      log('target disconnected')
      cleanup()
    })
    target.on('error', (err) => {
      log('target connection error: ' + err.message)
      cleanup()
    })

    client.on('message', (msg) => target.write(msg))
    client.on('close', (code, reason) => {
      log('WebSocket client disconnected: ' + code + ' [' + reason + ']')
      cleanup()
      this.emit('client-disconnected', clientAddr)
    })
    client.on('error', (err) => {
      log('WebSocket client error: ' + err.message)
      cleanup()
      this.emit('client-disconnected', clientAddr)
    })
  }
}

module.exports = { WebsockifyServer, resolveHost, parseAddress }
