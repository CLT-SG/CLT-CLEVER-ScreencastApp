'use strict'

const os = require('os')
const { getCapabilities } = require('./capabilities')
const { normalizeAudioConfig } = require('./audio-config')
const { mdnsHostname, websockifyPath } = require('./host-names')
const {
  probeService,
  registerDevice,
  sendHeartbeat,
  unregisterDevice,
  buildRegistrationPayload
} = require('./registration')
const { serverKey } = require('./discovery')

const HEARTBEAT_MS = 15000
const RECONNECT_MS = 5000
const MAX_RECONNECT_MS = 30000

const STATES = Object.freeze({
  DISCOVERED: 'discovered',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  REGISTERED: 'registered',
  RECONNECTING: 'reconnecting',
  UNAVAILABLE: 'unavailable',
  REJECTED: 'rejected',
  ERROR: 'error'
})

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
    if (/token|password|secret|credential|authorization/i.test(String(key))) {
      return
    }
    parts.push(key + '=' + value)
  })
  logger.info(parts.join(' '))
}

class ServerSession {
  constructor(options) {
    this.manager = options.manager
    this.logger = options.logger
    this.getHostInfo = options.getHostInfo
    this.getAppVersion = options.getAppVersion
    this.getAudioConfig = options.getAudioConfig
    this.getAudioSnapshot = options.getAudioSnapshot
    this.getSharing = options.getSharing
    this.deviceId = options.deviceId
    this.wsPort = options.wsPort
    this.vncPort = options.vncPort
    this.audioPort = options.audioPort
    this.getMonitors = options.getMonitors
    this.onChange = options.onChange
    this.autoConnect = options.autoConnect !== false

    this.id = options.id || serverKey(options.found)
    this.found = Object.assign({}, options.found)
    this.target = {
      host: this.found.host,
      port: this.found.port,
      protocol: this.found.protocol || 'http',
      hostname: this.found.hostname || this.found.host,
      serverId: this.id
    }
    this.source = this.found.source || 'discovered'
    this.state = STATES.DISCOVERED
    this.registered = false
    this.lastHeartbeatAt = null
    this.lastSeenAt = this.found.lastSeenAt || new Date().toISOString()
    this.lastError = null
    this.connecting = false
    this.heartbeatTimer = null
    this.reconnectTimer = null
    this.reconnectDelay = RECONNECT_MS
    this.started = true
    this.wanted = this.autoConnect
  }

  snapshot() {
    const statusLabel = this.registered && (this.state === STATES.CONNECTED || this.state === STATES.REGISTERED)
      ? 'Connected / Registered'
      : this.state === STATES.CONNECTED
        ? 'Connected'
        : labelFor(this.state)
    return {
      id: this.id,
      state: this.state,
      statusLabel,
      source: this.source,
      hostname: this.target.hostname || this.found.hostname,
      host: this.target.host,
      ip: this.target.host,
      port: this.target.port,
      protocol: this.target.protocol || 'http',
      serverId: this.id,
      registered: this.registered,
      lastHeartbeatAt: this.lastHeartbeatAt,
      lastSeenAt: this.lastSeenAt,
      lastError: this.lastError,
      interfaceName: this.found.interfaceName || null,
      advertisedIp: this.found.advertisedIp || null
    }
  }

  setState(state, extra) {
    this.state = state
    if (extra && extra.error) {
      this.lastError = extra.error
    }
    if (this.onChange) {
      this.onChange(this)
    }
  }

  touch(found) {
    if (!found) {
      return
    }
    this.lastSeenAt = found.lastSeenAt || new Date().toISOString()
    this.found = Object.assign({}, this.found, found)
    if (found.host && found.host !== this.target.host) {
      this.target.host = found.host
      this.target.hostname = found.hostname || this.target.hostname
      this.target.port = found.port || this.target.port
      this.target.protocol = found.protocol || this.target.protocol
    }
    if (this.state === STATES.UNAVAILABLE || this.state === STATES.ERROR) {
      discoveryLog(this.logger, 'Reconnect scheduled', {
        hostname: this.target.hostname,
        'IP address': this.target.host,
        port: this.target.port,
        'server/device ID': this.id,
        reason: 'rediscovered',
        timestamp: new Date().toISOString()
      })
      this.reconnectDelay = RECONNECT_MS
      if (this.wanted) {
        this.scheduleReconnect(0)
      } else {
        this.setState(STATES.DISCOVERED)
      }
    } else if (this.onChange) {
      this.onChange(this)
    }
  }

  async connect() {
    if (!this.started || this.connecting) {
      return false
    }
    this.wanted = true
    this.connecting = true
    this.setState(this.registered || this.state === STATES.CONNECTED ? STATES.RECONNECTING : STATES.CONNECTING)
    try {
      await probeService(this.target, this.logger)
      discoveryLog(this.logger, 'Connection established', {
        hostname: this.target.hostname,
        'IP address': this.target.host,
        port: this.target.port,
        'server/device ID': this.id,
        timestamp: new Date().toISOString()
      })
      this.setState(STATES.CONNECTED)
      await this.register('online')
      this.registered = true
      this.lastError = null
      this.reconnectDelay = RECONNECT_MS
      this.startHeartbeat()
      this.setState(STATES.REGISTERED)
      return true
    } catch (err) {
      const rejected = err && err.statusCode === 403
      this.registered = false
      this.lastError = err.message
      this.setState(rejected ? STATES.REJECTED : STATES.ERROR, { error: err.message })
      if (this.logger) this.logger.warn('CLEVER-Service connection failed: ' + err.message)
      this.scheduleReconnect()
      return false
    } finally {
      this.connecting = false
    }
  }

  async register(status) {
    if (!this.target) {
      return
    }
    const hostInfo = this.getHostInfo ? await this.getHostInfo() : {}
    const audioConfig = normalizeAudioConfig(this.getAudioConfig ? this.getAudioConfig() : {})
    const audioSnapshot = this.getAudioSnapshot ? this.getAudioSnapshot() : null
    const monitors = this.getMonitors ? this.getMonitors() : []
    const capabilities = getCapabilities({
      audio: audioConfig.systemAudio,
      systemAudio: audioConfig.systemAudio,
      microphone: audioConfig.microphone,
      speakerOutput: audioConfig.speakerOutput,
      twoWayAudio: audioConfig.twoWayAudio,
      audioBitrate: audioConfig.audioBitrate,
      audioState: audioSnapshot && audioSnapshot.state,
      wsPort: this.wsPort,
      monitorCount: monitors.length,
      platform: os.platform()
    })
    const payload = buildRegistrationPayload({
      deviceId: this.deviceId,
      hostname: hostInfo.hostname || os.hostname(),
      hostnameLocal: hostInfo.hostnameLocal || mdnsHostname(os.hostname()),
      ip: hostInfo.ip || '127.0.0.1',
      macAddress: hostInfo.mac || null,
      os: os.platform(),
      osRelease: os.release(),
      appVersion: this.getAppVersion ? this.getAppVersion() : '0.0.0',
      status: status || 'online',
      sharing: this.getSharing ? this.getSharing() : false,
      vncPort: this.vncPort,
      wsPort: this.wsPort,
      wsPath: '/' + websockifyPath(this.vncPort),
      audioPort: this.wsPort,
      audioPath: '/audio',
      audioTransport: 'webrtc',
      audio: audioSnapshot ? {
        state: audioSnapshot.state,
        error: audioSnapshot.error,
        capturing: audioSnapshot.capturing,
        enabled: audioConfig
      } : null,
      monitors,
      capabilities
    })
    await registerDevice(this.target, payload, this.logger)
    discoveryLog(this.logger, 'Registration successful', {
      hostname: this.target.hostname,
      'IP address': this.target.host,
      port: this.target.port,
      'server/device ID': this.id,
      timestamp: new Date().toISOString()
    })
  }

  startHeartbeat() {
    this.stopHeartbeat()
    this.heartbeatTimer = setInterval(() => {
      this.heartbeat()
    }, HEARTBEAT_MS)
    if (this.heartbeatTimer.unref) {
      this.heartbeatTimer.unref()
    }
  }

  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  async heartbeat() {
    if (!this.target || !this.started) {
      return
    }
    try {
      const hostInfo = this.getHostInfo ? await this.getHostInfo() : {}
      const audioSnapshot = this.getAudioSnapshot ? this.getAudioSnapshot() : null
      const audioConfig = normalizeAudioConfig(this.getAudioConfig ? this.getAudioConfig() : {})
      const monitors = this.getMonitors ? this.getMonitors() : []
      await sendHeartbeat(this.target, {
        deviceId: this.deviceId,
        status: 'online',
        sharing: this.getSharing ? this.getSharing() : false,
        ip: hostInfo.ip,
        hostname: hostInfo.hostname,
        hostnameLocal: hostInfo.hostnameLocal,
        vncPort: this.vncPort,
        wsPort: this.wsPort,
        wsPath: '/' + websockifyPath(this.vncPort),
        audioPort: this.wsPort,
        audioPath: '/audio',
        audioTransport: 'webrtc',
        audio: audioSnapshot ? {
          state: audioSnapshot.state,
          error: audioSnapshot.error,
          capturing: audioSnapshot.capturing,
          enabled: audioConfig
        } : null,
        capabilities: getCapabilities({
          audio: audioConfig.systemAudio,
          systemAudio: audioConfig.systemAudio,
          microphone: audioConfig.microphone,
          speakerOutput: audioConfig.speakerOutput,
          twoWayAudio: audioConfig.twoWayAudio,
          audioState: audioSnapshot && audioSnapshot.state,
          wsPort: this.wsPort,
          monitorCount: monitors.length,
          platform: os.platform()
        }),
        monitors
      }, this.logger)
      this.lastHeartbeatAt = new Date().toISOString()
      this.lastError = null
      if (this.state !== STATES.REGISTERED && this.state !== STATES.CONNECTED) {
        this.registered = true
        this.setState(STATES.REGISTERED)
      } else if (this.onChange) {
        this.onChange(this)
      }
    } catch (err) {
      if (this.logger) this.logger.warn('Heartbeat failed: ' + err.message)
      this.lastError = err.message
      discoveryLog(this.logger, 'Connection lost', {
        hostname: this.target.hostname,
        'IP address': this.target.host,
        port: this.target.port,
        'server/device ID': this.id,
        reason: err.message,
        timestamp: new Date().toISOString()
      })
      this.setState(STATES.RECONNECTING, { error: err.message })
      this.scheduleReconnect()
    }
  }

  scheduleReconnect(delayMs) {
    if (this.reconnectTimer || !this.started || !this.wanted) {
      return
    }
    const delay = delayMs == null ? this.reconnectDelay : delayMs
    discoveryLog(this.logger, 'Reconnect scheduled', {
      hostname: this.target.hostname,
      'IP address': this.target.host,
      port: this.target.port,
      'server/device ID': this.id,
      delayMs: delay,
      timestamp: new Date().toISOString()
    })
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.reconnectDelay = Math.min(Math.round(this.reconnectDelay * 1.5), MAX_RECONNECT_MS)
      this.connect()
    }, delay)
    if (this.reconnectTimer.unref) {
      this.reconnectTimer.unref()
    }
  }

  async reconnect() {
    this.wanted = true
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.reconnectDelay = RECONNECT_MS
    this.setState(STATES.RECONNECTING)
    return this.connect()
  }

  markUnavailable(reason) {
    this.stopHeartbeat()
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.registered = false
    this.lastError = reason || this.lastError
    this.setState(STATES.UNAVAILABLE, { error: this.lastError })
    if (this.wanted) {
      this.scheduleReconnect()
    }
  }

  async unregister() {
    this.wanted = false
    this.stopHeartbeat()
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.target) {
      await unregisterDevice(this.target, { deviceId: this.deviceId }, this.logger)
    }
    this.registered = false
    this.setState(STATES.DISCOVERED)
  }

  async stop() {
    this.started = false
    this.wanted = false
    this.stopHeartbeat()
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.target) {
      await unregisterDevice(this.target, { deviceId: this.deviceId }, this.logger)
    }
    this.registered = false
    this.setState(STATES.UNAVAILABLE)
  }
}

function labelFor(state) {
  switch (state) {
    case STATES.DISCOVERED: return 'Discovered'
    case STATES.CONNECTING: return 'Connecting'
    case STATES.CONNECTED: return 'Connected'
    case STATES.REGISTERED: return 'Registered'
    case STATES.RECONNECTING: return 'Reconnecting'
    case STATES.UNAVAILABLE: return 'Unavailable'
    case STATES.REJECTED: return 'Rejected'
    case STATES.ERROR: return 'Error'
    default: return 'Disconnected'
  }
}

module.exports = {
  ServerSession,
  STATES,
  HEARTBEAT_MS,
  RECONNECT_MS,
  labelFor
}
