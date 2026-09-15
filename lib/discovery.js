const dgram = require('dgram')
const os = require('os')

const SERVICE_TYPE = 'clever-service'
const PROBE_TYPE = 'clever-service-discover'
const DEFAULT_DISCOVERY_PORT = 8842
const DEFAULT_HTTP_PORT = 8000

function buildProbe() {
  return Buffer.from(JSON.stringify({
    type: PROBE_TYPE,
    client: 'screencast-vnc',
    hostname: os.hostname()
  }))
}

function buildAnnounce(info) {
  return {
    type: SERVICE_TYPE,
    service: 'CLEVER-Service',
    hostname: info.hostname,
    ip: info.ip,
    port: parseInt(info.port, 10) || DEFAULT_HTTP_PORT,
    protocol: info.protocol === 'https' ? 'https' : 'http',
    discoveryPort: parseInt(info.discoveryPort, 10) || DEFAULT_DISCOVERY_PORT,
    apiBase: info.apiBase || '/api/screencast-app'
  }
}

function parseAnnouncement(message, rinfo) {
  let parsed
  try {
    parsed = JSON.parse(message.toString())
  } catch (err) {
    return null
  }
  if (!parsed || parsed.type !== SERVICE_TYPE) {
    return null
  }
  const host = parsed.ip || parsed.hostname || (rinfo && rinfo.address)
  const port = parseInt(parsed.port, 10)
  if (!host || !Number.isFinite(port) || port <= 0) {
    return null
  }
  return {
    hostname: parsed.hostname || host,
    host,
    ip: parsed.ip || (rinfo && rinfo.address) || host,
    port,
    protocol: parsed.protocol === 'https' ? 'https' : 'http',
    discoveryPort: parseInt(parsed.discoveryPort, 10) || DEFAULT_DISCOVERY_PORT,
    apiBase: parsed.apiBase || '/api/screencast-app',
    source: 'discovered'
  }
}

function isProbe(message) {
  try {
    const parsed = JSON.parse(message.toString())
    return !!(parsed && parsed.type === PROBE_TYPE)
  } catch (err) {
    return false
  }
}

function broadcastAddresses() {
  const addresses = ['255.255.255.255']
  const interfaces = os.networkInterfaces()
  Object.keys(interfaces).forEach((name) => {
    (interfaces[name] || []).forEach((iface) => {
      if (iface.family !== 'IPv4' || iface.internal) {
        return
      }
      if (iface.cidr && iface.cidr.indexOf('/') !== -1) {
        const prefix = parseInt(iface.cidr.split('/')[1], 10)
        if (Number.isFinite(prefix) && prefix >= 8 && prefix <= 30) {
          const ipParts = iface.address.split('.').map((n) => parseInt(n, 10))
          const mask = prefix === 24 ? [255, 255, 255, 0]
            : prefix === 16 ? [255, 255, 0, 0]
              : prefix === 8 ? [255, 0, 0, 0]
                : null
          if (mask) {
            const broadcast = ipParts.map((part, index) => part | (~mask[index] & 255)).join('.')
            if (addresses.indexOf(broadcast) === -1) {
              addresses.push(broadcast)
            }
          }
        }
      }
    })
  })
  return addresses
}

/**
 * UDP LAN discovery for CLEVER-Service.
 * Sends probes on an interval that backs off while the service is missing,
 * and listens for announcements so a later-started server is still found.
 */
class ServiceDiscovery {
  constructor(options) {
    this.port = (options && options.port) || DEFAULT_DISCOVERY_PORT
    this.logger = options && options.logger
    this.onFound = options && options.onFound
    this.socket = null
    this.timer = null
    this.probeDelay = 3000
    this.maxProbeDelay = 30000
    this.running = false
  }

  start() {
    if (this.running) {
      return
    }
    this.running = true
    this.socket = dgram.createSocket({ type: 'udp4', reuseAddr: true })
    this.socket.on('message', (msg, rinfo) => {
      if (msg.length > 8192) {
        return
      }
      const found = parseAnnouncement(msg, rinfo)
      if (!found) {
        return
      }
      if (this.logger) {
        this.logger.info(`Discovered CLEVER-Service at ${found.protocol}://${found.host}:${found.port}`)
      }
      this.probeDelay = 3000
      if (this.onFound) {
        this.onFound(found)
      }
    })
    this.socket.on('error', (err) => {
      if (this.logger) this.logger.warn(`Discovery socket error: ${err.message}`)
    })
    this.socket.bind(0, () => {
      try {
        this.socket.setBroadcast(true)
      } catch (err) {
        if (this.logger) this.logger.warn(`Could not enable UDP broadcast: ${err.message}`)
      }
      const address = this.socket.address()
      if (this.logger) this.logger.info(`CLEVER-Service discovery ready on UDP ${address.port}, probing ${this.port}`)
      this.sendProbe()
      this.scheduleProbe()
    })
  }

  sendProbe() {
    if (!this.socket || !this.running) {
      return
    }
    const payload = buildProbe()
    broadcastAddresses().forEach((address) => {
      this.socket.send(payload, 0, payload.length, this.port, address, (err) => {
        if (err && this.logger) {
          this.logger.debug && this.logger.debug(`Discovery probe to ${address} failed: ${err.message}`)
        }
      })
    })
    if (this.logger) this.logger.info('Searching for CLEVER-Service on the local network')
  }

  scheduleProbe() {
    if (this.timer) {
      clearTimeout(this.timer)
    }
    this.timer = setTimeout(() => {
      if (!this.running) {
        return
      }
      this.sendProbe()
      this.probeDelay = Math.min(this.probeDelay * 1.5, this.maxProbeDelay)
      this.scheduleProbe()
    }, this.probeDelay)
  }

  resetBackoff() {
    this.probeDelay = 3000
  }

  stop() {
    this.running = false
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    if (this.socket) {
      try {
        this.socket.close()
      } catch (err) {
        // ignore
      }
      this.socket = null
    }
  }
}

module.exports = {
  SERVICE_TYPE,
  PROBE_TYPE,
  DEFAULT_DISCOVERY_PORT,
  buildProbe,
  buildAnnounce,
  parseAnnouncement,
  isProbe,
  broadcastAddresses,
  ServiceDiscovery
}
