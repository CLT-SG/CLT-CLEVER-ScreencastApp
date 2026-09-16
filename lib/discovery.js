'use strict'

const dgram = require('dgram')
const fs = require('fs')
const os = require('os')
const { EventEmitter } = require('events')
const {
  DEFAULT_HTTP_PORTS,
  scanHttpTargets,
  httpScanTargets
} = require('./http-discovery')

const SERVICE_TYPE = 'clever-service'
const PROBE_TYPE = 'clever-service-discover'
const DEFAULT_DISCOVERY_PORT = 8842
const DEFAULT_HTTP_PORT = 8000
const DEFAULT_TIMEOUT_MS = 4000
const DEFAULT_RETRY_MS = 8000
const DEFAULT_MAX_RETRY_MS = 30000
const INTERFACE_POLL_MS = 10000
const MAX_MESSAGE_BYTES = 8192

const SKIP_IFACE_NAME = /^(lo|lo0|docker|br-|virbr|vmnet|vboxnet|vbox|hyper-v|tun|tap|utun|wg|zt|cni|flannel|cbl|awdl|llw|anpi|ap\d|gif|stf|p2p|teredo|isatap|npcap|loopback|cbridge|ham|tailscale)/i
const SKIP_IFACE_DESC = /wsl|default switch|hyper-v|virtualbox|vmware|docker|tailscale|zerotier|hamachi|radmin|npcap/i

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
    id: info.id || info.serverId || info.hostname,
    hostname: info.hostname,
    ip: info.ip,
    ips: Array.isArray(info.ips) ? info.ips : undefined,
    port: parseInt(info.port, 10) || DEFAULT_HTTP_PORT,
    protocol: info.protocol === 'https' ? 'https' : 'http',
    discoveryPort: parseInt(info.discoveryPort, 10) || DEFAULT_DISCOVERY_PORT,
    apiBase: info.apiBase || '/api/screencast-app'
  }
}

function isIpv4Family(family) {
  return family === 'IPv4' || family === 4
}

function isIpv4(value) {
  if (typeof value !== 'string') {
    return false
  }
  const parts = value.split('.')
  if (parts.length !== 4) {
    return false
  }
  return parts.every((part) => {
    if (!/^\d{1,3}$/.test(part)) {
      return false
    }
    const n = parseInt(part, 10)
    return n >= 0 && n <= 255
  })
}

function ipv4ToInt(ip) {
  return ip.split('.').reduce((acc, oct) => ((acc << 8) + (parseInt(oct, 10) & 255)) >>> 0, 0)
}

function intToIpv4(n) {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.')
}

function isLoopbackIpv4(ip) {
  if (!isIpv4(ip)) {
    return false
  }
  return (ipv4ToInt(ip) & 0xFF000000) === 0x7F000000
}

function isLinkLocalIpv4(ip) {
  if (!isIpv4(ip)) {
    return false
  }
  return (ipv4ToInt(ip) & 0xFFFF0000) === 0xA9FE0000
}

function isMulticastIpv4(ip) {
  if (!isIpv4(ip)) {
    return false
  }
  const n = ipv4ToInt(ip)
  return n >= ipv4ToInt('224.0.0.0') && n <= ipv4ToInt('239.255.255.255')
}

function isUsableLanIpv4(ip) {
  if (!isIpv4(ip)) {
    return false
  }
  if (ip === '0.0.0.0' || ip === '255.255.255.255') {
    return false
  }
  if (isLoopbackIpv4(ip) || isLinkLocalIpv4(ip) || isMulticastIpv4(ip)) {
    return false
  }
  return true
}

function isLoopbackName(value) {
  const name = String(value || '').toLowerCase()
  return name === 'localhost' || name === 'localhost.localdomain' || name === '::1'
}

function isVirtualInterfaceName(name) {
  const value = String(name || '')
  if (!value) {
    return true
  }
  if (/^veth[0-9a-f]+$/i.test(value) || /^veth$/i.test(value)) {
    return true
  }
  if (SKIP_IFACE_NAME.test(value) || SKIP_IFACE_DESC.test(value)) {
    return true
  }
  return false
}

function cidrPrefix(iface) {
  if (iface && iface.cidr && String(iface.cidr).indexOf('/') !== -1) {
    const prefix = parseInt(String(iface.cidr).split('/')[1], 10)
    if (Number.isFinite(prefix)) {
      return prefix
    }
  }
  if (iface && iface.netmask && isIpv4(iface.netmask)) {
    const mask = ipv4ToInt(iface.netmask)
    let prefix = 0
    let bit = 0x80000000
    for (let i = 0; i < 32; i++) {
      if (mask & bit) {
        prefix += 1
        bit >>>= 1
      } else {
        break
      }
    }
    return prefix
  }
  return null
}

function directedBroadcast(address, prefix) {
  if (!isIpv4(address) || !Number.isFinite(prefix) || prefix < 8 || prefix > 30) {
    return null
  }
  const ip = ipv4ToInt(address)
  const mask = prefix === 0 ? 0 : (0xFFFFFFFF << (32 - prefix)) >>> 0
  return intToIpv4((ip | (~mask >>> 0)) >>> 0)
}

function listLanInterfaces(networkInterfaces) {
  const interfaces = networkInterfaces || os.networkInterfaces()
  const result = []
  Object.keys(interfaces || {}).forEach((name) => {
    if (isVirtualInterfaceName(name)) {
      return
    }
    ;(interfaces[name] || []).forEach((iface) => {
      if (!iface || iface.internal || !isIpv4Family(iface.family) || !isUsableLanIpv4(iface.address)) {
        return
      }
      const prefix = cidrPrefix(iface)
      result.push({
        name,
        address: iface.address,
        netmask: iface.netmask || null,
        prefix,
        broadcast: directedBroadcast(iface.address, prefix),
        mac: iface.mac || null
      })
    })
  })
  return result
}

function scanPrefix(iface) {
  const prefix = iface && iface.prefix
  if (!Number.isFinite(prefix) || prefix < 24) {
    return 24
  }
  if (prefix > 30) {
    return null
  }
  return prefix
}

function subnetHostAddresses(iface) {
  const prefix = scanPrefix(iface)
  if (!prefix || !iface || !isIpv4(iface.address)) {
    return []
  }
  const ip = ipv4ToInt(iface.address)
  const mask = (0xFFFFFFFF << (32 - prefix)) >>> 0
  const network = (ip & mask) >>> 0
  const broadcast = (network | (~mask >>> 0)) >>> 0
  const hosts = []
  for (let n = network + 1; n < broadcast; n++) {
    hosts.push(intToIpv4(n >>> 0))
  }
  return hosts
}

function shouldAcceptDiscoveredHost(host, via) {
  if (isUsableLanIpv4(host)) {
    return true
  }
  if (isLoopbackIpv4(host) && isLoopbackIpv4(via)) {
    return true
  }
  return false
}

function arpNeighborAddresses() {
  const hosts = []
  try {
    const text = fs.readFileSync('/proc/net/arp', 'utf8')
    text.split('\n').slice(1).forEach((line) => {
      const ip = line.trim().split(/\s+/)[0]
      if (isUsableLanIpv4(ip) && hosts.indexOf(ip) === -1) {
        hosts.push(ip)
      }
    })
  } catch (_err) {
    // Windows/macOS have no /proc/net/arp; subnet scan still covers /24.
  }
  return hosts
}

function lanScanHosts(networkInterfaces) {
  const hosts = []
  const seen = {}
  const add = (ip) => {
    if (!isUsableLanIpv4(ip) || seen[ip]) {
      return
    }
    seen[ip] = true
    hosts.push(ip)
  }
  arpNeighborAddresses().forEach(add)
  listLanInterfaces(networkInterfaces).forEach((iface) => {
    subnetHostAddresses(iface).forEach((ip) => {
      if (ip !== iface.address) {
        add(ip)
      }
    })
  })
  return hosts
}

function primaryLanAddress(networkInterfaces) {
  const ifaces = listLanInterfaces(networkInterfaces)
  if (!ifaces.length) {
    return null
  }
  const preferred = ifaces.find((iface) => /eth|enp|ens|eno|wlan|wl|wifi|ethernet|lan/i.test(iface.name))
  return (preferred || ifaces[0]).address
}

function broadcastAddresses(networkInterfaces) {
  const addresses = ['255.255.255.255']
  listLanInterfaces(networkInterfaces).forEach((iface) => {
    if (iface.broadcast && addresses.indexOf(iface.broadcast) === -1) {
      addresses.push(iface.broadcast)
    }
  })
  return addresses
}

function pickReachableHost(info) {
  const advertisedIp = info && info.advertisedIp
  const sourceIp = info && info.sourceIp
  const extraIps = (info && info.extraIps) || []
  if (isUsableLanIpv4(sourceIp)) {
    return sourceIp
  }
  if (isUsableLanIpv4(advertisedIp)) {
    return advertisedIp
  }
  for (let i = 0; i < extraIps.length; i++) {
    if (isUsableLanIpv4(extraIps[i])) {
      return extraIps[i]
    }
  }
  if (isLoopbackIpv4(sourceIp)) {
    return sourceIp
  }
  if (isLoopbackIpv4(advertisedIp) && isLoopbackIpv4(sourceIp)) {
    return advertisedIp
  }
  return null
}

function serverKey(found) {
  if (!found) {
    return ''
  }
  if (found.serverId) {
    return String(found.serverId).toLowerCase()
  }
  const hostname = String(found.hostname || '').trim().toLowerCase()
  const port = parseInt(found.port, 10) || DEFAULT_HTTP_PORT
  if (hostname && !isIpv4(hostname) && !isLoopbackName(hostname)) {
    return hostname + ':' + port
  }
  const ip = found.ip || found.host
  return String(ip || '').toLowerCase() + ':' + port
}

function inspectAnnouncement(message, rinfo) {
  let parsed
  try {
    parsed = JSON.parse(message.toString())
  } catch (err) {
    return { error: 'invalid json' }
  }
  if (!parsed || parsed.type !== SERVICE_TYPE) {
    return { error: 'unexpected type' }
  }
  const port = parseInt(parsed.port, 10)
  if (!Number.isFinite(port) || port <= 0) {
    return { error: 'missing port' }
  }
  const extraIps = Array.isArray(parsed.ips) ? parsed.ips.filter(isIpv4) : []
  const host = pickReachableHost({
    advertisedIp: parsed.ip,
    sourceIp: rinfo && rinfo.address,
    extraIps
  })
  if (!host) {
    return { error: 'no reachable ipv4', advertisedIp: parsed.ip, sourceIp: rinfo && rinfo.address }
  }
  const hostname = parsed.hostname || host
  const serverId = parsed.id || parsed.serverId || null
  return {
    server: {
      hostname,
      host,
      ip: host,
      advertisedIp: parsed.ip || null,
      port,
      protocol: parsed.protocol === 'https' ? 'https' : 'http',
      discoveryPort: parseInt(parsed.discoveryPort, 10) || DEFAULT_DISCOVERY_PORT,
      apiBase: parsed.apiBase || '/api/screencast-app',
      serverId: serverId ? String(serverId) : serverKey({ hostname, port, ip: host }),
      source: 'discovered',
      via: rinfo && rinfo.address ? rinfo.address : host
    }
  }
}

function parseAnnouncement(message, rinfo) {
  const inspected = inspectAnnouncement(message, rinfo)
  return inspected && inspected.server ? inspected.server : null
}

function isProbe(message) {
  try {
    const parsed = JSON.parse(message.toString())
    return !!(parsed && parsed.type === PROBE_TYPE)
  } catch (err) {
    return false
  }
}

function discoveryLog(logger, event, details) {
  if (!logger || typeof logger.info !== 'function') {
    return
  }
  const parts = [event]
  Object.keys(details || {}).forEach((key) => {
    const value = details[key]
    if (value === undefined || value === null || value === '') {
      return
    }
    const lowered = String(key).toLowerCase()
    if (/token|password|secret|credential|authorization/i.test(lowered)) {
      return
    }
    parts.push(key + '=' + value)
  })
  logger.info(parts.join(' '))
}

function interfaceFingerprint(ifaces) {
  return (ifaces || []).map((iface) => iface.name + ':' + iface.address).sort().join(',')
}

/**
 * UDP LAN discovery for CLEVER-Service.
 *
 * Uses the existing clever-service / clever-service-discover protocol.
 * Probes are sent from each active LAN interface (not loopback-only) and
 * announcements are collected for a round before retrying.
 */
class ServiceDiscovery extends EventEmitter {
  constructor(options) {
    super()
    const opts = options || {}
    this.port = opts.port || DEFAULT_DISCOVERY_PORT
    this.timeoutMs = opts.timeoutMs || DEFAULT_TIMEOUT_MS
    this.retryIntervalMs = opts.retryIntervalMs || DEFAULT_RETRY_MS
    this.maxRetryIntervalMs = opts.maxRetryIntervalMs || DEFAULT_MAX_RETRY_MS
    this.fallbackAddresses = Array.isArray(opts.fallbackAddresses) ? opts.fallbackAddresses.slice() : ['127.0.0.1']
    this.httpPorts = opts.httpScan === false || opts.httpPorts === false
      ? []
      : (Array.isArray(opts.httpPorts) && opts.httpPorts.length ? opts.httpPorts.slice() : DEFAULT_HTTP_PORTS.slice())
    this.httpTimeoutMs = opts.httpTimeoutMs || 700
    this.httpConcurrency = opts.httpConcurrency || 32
    this.httpScanPromise = null
    this.roundToken = 0
    this.logger = opts.logger
    this.onFound = opts.onFound
    this.onRoundComplete = opts.onRoundComplete
    this.onStateChange = opts.onStateChange
    this.listenSocket = null
    this.sendSockets = []
    this.roundTimer = null
    this.retryTimer = null
    this.ifaceTimer = null
    this.running = false
    this.roundActive = false
    this.round = 0
    this.probeDelay = this.retryIntervalMs
    this.seenThisRound = new Map()
    this.known = new Map()
    this.lastIfaceFingerprint = ''
    this.phase = 'stopped'
    this.lastRoundAt = null
    this.nextRetryAt = null
    this.lastEmptyMessage = false
  }

  snapshot() {
    return {
      enabled: this.running,
      running: this.running,
      phase: this.phase,
      round: this.round,
      lastRoundAt: this.lastRoundAt,
      nextRetryAt: this.nextRetryAt,
      timeoutMs: this.timeoutMs,
      retryIntervalMs: this.probeDelay,
      interfaceCount: listLanInterfaces().length,
      interfaces: listLanInterfaces().map((iface) => ({
        name: iface.name,
        address: iface.address,
        broadcast: iface.broadcast
      })),
      discoveredCount: this.known.size,
      message: this.known.size ? null : 'No CLEVER-Service servers discovered'
    }
  }

  setPhase(phase, extra) {
    this.phase = phase
    const snapshot = Object.assign(this.snapshot(), extra || {})
    if (this.onStateChange) {
      this.onStateChange(snapshot)
    }
    this.emit('state', snapshot)
  }

  start() {
    if (this.running) {
      return
    }
    this.running = true
    this.probeDelay = this.retryIntervalMs
    discoveryLog(this.logger, 'Discovery started', {
      port: this.port,
      timeoutMs: this.timeoutMs,
      retryIntervalMs: this.retryIntervalMs,
      timestamp: new Date().toISOString()
    })
    this.openListenSocket()
    this.refreshSendSockets()
    this.setPhase('searching')
    this.beginRound()
    this.ifaceTimer = setInterval(() => this.checkNetworkChange(), INTERFACE_POLL_MS)
    if (this.ifaceTimer.unref) {
      this.ifaceTimer.unref()
    }
  }

  openListenSocket() {
    this.listenSocket = dgram.createSocket({ type: 'udp4', reuseAddr: true })
    this.listenSocket.on('message', (msg, rinfo) => this.handleMessage(msg, rinfo, 'listen'))
    this.listenSocket.on('error', (err) => {
      if (/address already in use|eaddrinuse/i.test(err.message || '')) {
        if (this.logger) {
          this.logger.warn('UDP ' + this.port + ' busy; continuing with per-interface probe sockets only')
        }
        try {
          this.listenSocket.close()
        } catch (_err) {
          // ignore
        }
        this.listenSocket = null
        return
      }
      if (this.logger) this.logger.warn('Discovery socket error: ' + err.message)
    })
    this.listenSocket.bind(this.port, '0.0.0.0', () => {
      if (!this.listenSocket) {
        return
      }
      try {
        this.listenSocket.setBroadcast(true)
      } catch (err) {
        if (this.logger) this.logger.warn('Could not enable UDP broadcast on listen socket: ' + err.message)
      }
      const address = this.listenSocket.address()
      discoveryLog(this.logger, 'Discovery listen socket ready', {
        ip: address.address,
        port: address.port,
        timestamp: new Date().toISOString()
      })
    })
  }

  refreshSendSockets() {
    this.closeSendSockets()
    const ifaces = listLanInterfaces()
    if (!ifaces.length) {
      if (this.logger) this.logger.warn('No active LAN interfaces selected for discovery')
    }
    ifaces.forEach((iface) => {
      discoveryLog(this.logger, 'Interface selected', {
        'network interface': iface.name,
        'IP address': iface.address,
        broadcast: iface.broadcast,
        timestamp: new Date().toISOString()
      })
      const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true })
      socket.on('message', (msg, rinfo) => this.handleMessage(msg, rinfo, iface.name))
      socket.on('error', (err) => {
        if (this.logger) this.logger.warn('Discovery send socket on ' + iface.name + ' error: ' + err.message)
      })
      socket.bind({ address: iface.address, port: 0, exclusive: false }, () => {
        try {
          socket.setBroadcast(true)
        } catch (err) {
          if (this.logger) this.logger.warn('Could not enable UDP broadcast on ' + iface.name + ': ' + err.message)
        }
      })
      this.sendSockets.push({ socket, iface })
    })
    this.lastIfaceFingerprint = interfaceFingerprint(ifaces)
  }

  closeSendSockets() {
    this.sendSockets.forEach((entry) => {
      try {
        entry.socket.close()
      } catch (_err) {
        // ignore
      }
    })
    this.sendSockets = []
  }

  checkNetworkChange() {
    if (!this.running) {
      return
    }
    const fingerprint = interfaceFingerprint(listLanInterfaces())
    if (fingerprint === this.lastIfaceFingerprint) {
      return
    }
    discoveryLog(this.logger, 'Discovery retry', {
      reason: 'network change',
      timestamp: new Date().toISOString()
    })
    this.refreshSendSockets()
    this.probeDelay = this.retryIntervalMs
    this.beginRound()
  }

  beginRound() {
    if (!this.running) {
      return
    }
    this.clearTimers()
    this.roundActive = true
    this.round += 1
    this.roundToken += 1
    const token = this.roundToken
    this.seenThisRound = new Map()
    this.lastEmptyMessage = false
    this.setPhase('searching')
    this.sendProbe()
    this.httpScanPromise = this.scanHttpLan(token)
    const udpWait = new Promise((resolve) => {
      this.roundTimer = setTimeout(resolve, this.timeoutMs)
      if (this.roundTimer.unref) {
        this.roundTimer.unref()
      }
    })
    Promise.all([udpWait, this.httpScanPromise]).then(() => {
      if (this.running && token === this.roundToken) {
        this.finishRound()
      }
    }).catch(() => {
      if (this.running && token === this.roundToken) {
        this.finishRound()
      }
    })
  }

  sendToDestinations(payload, destinations, sockets) {
    sockets.forEach((entry) => {
      destinations.forEach((address) => {
        try {
          entry.socket.send(payload, 0, payload.length, this.port, address, (err) => {
            if (err && this.logger && this.logger.debug) {
              this.logger.debug('Discovery probe to ' + address + ' via ' + entry.iface.name + ' failed: ' + err.message)
            }
          })
        } catch (err) {
          if (this.logger && this.logger.debug) {
            this.logger.debug('Discovery probe throw to ' + address + ': ' + err.message)
          }
        }
      })
    })
  }

  sendProbe() {
    if (!this.running) {
      return
    }
    const payload = buildProbe()
    const broadcasts = broadcastAddresses()
    this.fallbackAddresses.forEach((address) => {
      if (address && broadcasts.indexOf(address) === -1) {
        broadcasts.push(address)
      }
    })
    const unicasts = lanScanHosts()
    const sockets = this.sendSockets.length
      ? this.sendSockets
      : (this.listenSocket ? [{ socket: this.listenSocket, iface: { name: 'any', address: '0.0.0.0' } }] : [])
    this.sendToDestinations(payload, broadcasts, sockets)
    this.sendToDestinations(payload, unicasts, sockets)
    sockets.forEach((entry) => {
      discoveryLog(this.logger, 'Discovery request sent', {
        'IP address': broadcasts.join(','),
        unicast: unicasts.length,
        port: this.port,
        'network interface': entry.iface.name,
        timestamp: new Date().toISOString()
      })
    })
  }

  scanHttpLan(token) {
    const hosts = lanScanHosts()
    this.fallbackAddresses.forEach((address) => {
      if (address && hosts.indexOf(address) === -1) {
        hosts.push(address)
      }
    })
    if (!hosts.length || !this.httpPorts.length) {
      return Promise.resolve([])
    }
    const targets = httpScanTargets(hosts, this.httpPorts)
    discoveryLog(this.logger, 'HTTP discovery scan started', {
      hosts: hosts.length,
      ports: this.httpPorts.join(','),
      timestamp: new Date().toISOString()
    })
    return scanHttpTargets(targets, {
      timeoutMs: this.httpTimeoutMs,
      concurrency: this.httpConcurrency,
      onFound: (server) => {
        if (!this.running || token !== this.roundToken) {
          return
        }
        this.acceptServer(Object.assign({}, server, {
          interfaceName: 'http',
          lastSeenAt: new Date().toISOString()
        }), 'http')
      }
    }).catch((err) => {
      if (this.logger) this.logger.warn('HTTP discovery scan failed: ' + err.message)
      return []
    })
  }

  handleMessage(msg, rinfo, ifaceName) {
    if (!this.running || !msg || msg.length > MAX_MESSAGE_BYTES) {
      return
    }
    if (isProbe(msg)) {
      return
    }
    const inspected = inspectAnnouncement(msg, rinfo)
    if (!inspected || !inspected.server) {
      if (inspected && inspected.error && inspected.error !== 'unexpected type') {
        discoveryLog(this.logger, 'Server rejected', {
          reason: inspected.error,
          'IP address': (rinfo && rinfo.address) || inspected.advertisedIp,
          'network interface': ifaceName,
          timestamp: new Date().toISOString()
        })
      }
      return
    }
    const server = Object.assign({}, inspected.server, {
      interfaceName: ifaceName || null,
      lastSeenAt: new Date().toISOString()
    })
    this.acceptServer(server, ifaceName)
  }

  acceptServer(server, ifaceName) {
    if (!server || !shouldAcceptDiscoveredHost(server.host || server.ip, server.via)) {
      discoveryLog(this.logger, 'Server rejected', {
        reason: 'loopback or unusable host',
        hostname: server && server.hostname,
        'IP address': server && (server.ip || server.host),
        port: server && server.port,
        timestamp: new Date().toISOString()
      })
      return
    }
    const key = serverKey(server)
    server.serverId = server.serverId || key
    if (this.seenThisRound.has(key)) {
      const previous = this.seenThisRound.get(key)
      previous.lastSeenAt = server.lastSeenAt
      discoveryLog(this.logger, 'Duplicate server ignored', {
        hostname: server.hostname,
        'IP address': server.ip,
        port: server.port,
        'server/device ID': key,
        'network interface': ifaceName,
        timestamp: server.lastSeenAt
      })
      return
    }
    const previous = this.known.get(key)
    this.seenThisRound.set(key, server)
    this.known.set(key, server)
    discoveryLog(this.logger, 'Server response received', {
      hostname: server.hostname,
      'IP address': server.ip,
      port: server.port,
      'server/device ID': key,
      'network interface': ifaceName,
      timestamp: server.lastSeenAt
    })
    if (!previous) {
      discoveryLog(this.logger, 'Server accepted', {
        hostname: server.hostname,
        'IP address': server.ip,
        port: server.port,
        'server/device ID': key,
        timestamp: server.lastSeenAt
      })
    }
    if (this.onFound) {
      this.onFound(server)
    }
    this.emit('found', server)
  }

  finishRound() {
    this.roundActive = false
    this.lastRoundAt = new Date().toISOString()
    const servers = Array.from(this.seenThisRound.values())
    if (!servers.length) {
      this.lastEmptyMessage = true
      if (this.logger) this.logger.info('No CLEVER-Service servers discovered')
    }
    if (this.onRoundComplete) {
      this.onRoundComplete(servers, this.snapshot())
    }
    this.emit('round', servers)
    this.scheduleRetry()
  }

  scheduleRetry() {
    if (!this.running) {
      return
    }
    const delay = this.probeDelay
    this.nextRetryAt = new Date(Date.now() + delay).toISOString()
    this.setPhase('waiting')
    discoveryLog(this.logger, 'Discovery retry', {
      delayMs: delay,
      timestamp: new Date().toISOString()
    })
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null
      this.probeDelay = Math.min(Math.round(this.probeDelay * 1.5), this.maxRetryIntervalMs)
      this.beginRound()
    }, delay)
    if (this.retryTimer.unref) {
      this.retryTimer.unref()
    }
  }

  refresh() {
    if (!this.running) {
      this.start()
      return
    }
    this.probeDelay = this.retryIntervalMs
    this.beginRound()
  }

  resetBackoff() {
    this.probeDelay = this.retryIntervalMs
  }

  clearTimers() {
    if (this.roundTimer) {
      clearTimeout(this.roundTimer)
      this.roundTimer = null
    }
    if (this.retryTimer) {
      clearTimeout(this.retryTimer)
      this.retryTimer = null
    }
  }

  clearState() {
    this.seenThisRound = new Map()
    this.known = new Map()
    this.round = 0
    this.lastRoundAt = null
    this.nextRetryAt = null
    this.lastEmptyMessage = false
  }

  stop() {
    if (!this.running && !this.listenSocket && !this.sendSockets.length) {
      this.phase = 'stopped'
      return
    }
    this.running = false
    this.roundActive = false
    this.roundToken += 1
    this.httpScanPromise = null
    this.clearTimers()
    if (this.ifaceTimer) {
      clearInterval(this.ifaceTimer)
      this.ifaceTimer = null
    }
    this.closeSendSockets()
    if (this.listenSocket) {
      try {
        this.listenSocket.close()
      } catch (_err) {
        // ignore
      }
      this.listenSocket = null
    }
    this.clearState()
    this.phase = 'stopped'
    this.nextRetryAt = null
    discoveryLog(this.logger, 'Discovery stopped', { timestamp: new Date().toISOString() })
    this.setPhase('stopped')
  }
}

module.exports = {
  SERVICE_TYPE,
  PROBE_TYPE,
  DEFAULT_DISCOVERY_PORT,
  DEFAULT_HTTP_PORT,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_RETRY_MS,
  DEFAULT_MAX_RETRY_MS,
  buildProbe,
  buildAnnounce,
  parseAnnouncement,
  inspectAnnouncement,
  isProbe,
  isIpv4,
  isLoopbackIpv4,
  isUsableLanIpv4,
  isVirtualInterfaceName,
  directedBroadcast,
  listLanInterfaces,
  primaryLanAddress,
  broadcastAddresses,
  subnetHostAddresses,
  lanScanHosts,
  shouldAcceptDiscoveredHost,
  pickReachableHost,
  serverKey,
  ServiceDiscovery
}
