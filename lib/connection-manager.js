const EventEmitter = require('events')
const os = require('os')
const { getOrCreateDeviceId } = require('./device-id')
const { detectMonitors, monitorsChanged, describeMonitorChange, watchMonitors } = require('./monitors')
const { getCapabilities } = require('./capabilities')
const {
  loadServerConfig,
  saveServerConfig,
  isManualConfigured,
  serviceBaseUrl
} = require('./server-config')
const { ServiceDiscovery } = require('./discovery')
const {
  probeService,
  registerDevice,
  sendHeartbeat,
  unregisterDevice,
  buildRegistrationPayload
} = require('./registration')

const HEARTBEAT_MS = 15000
const RECONNECT_MS = 5000

class ConnectionManager extends EventEmitter {
  constructor(options) {
    super()
    this.userDataDir = options.userDataDir
    this.logger = options.logger
    this.screenApi = options.screenApi
    this.getHostInfo = options.getHostInfo
    this.getAppVersion = options.getAppVersion
    this.getAudioEnabled = options.getAudioEnabled || (() => false)
    this.getSharing = options.getSharing || (() => false)
    this.wsPort = options.wsPort || 8840
    this.vncPort = options.vncPort || 5900
    this.audioPort = options.audioPort || 6900

    this.config = loadServerConfig(this.userDataDir, this.logger)
    this.deviceId = getOrCreateDeviceId(this.userDataDir, this.logger)
    this.state = 'disconnected'
    this.source = this.config.mode === 'manual' ? 'manual' : null
    this.target = null
    this.monitors = []
    this.discovery = null
    this.heartbeatTimer = null
    this.reconnectTimer = null
    this.stopWatch = null
    this.started = false
    this.connecting = false
  }

  snapshot() {
    return {
      state: this.state,
      source: this.source,
      target: this.target,
      config: this.config,
      deviceId: this.deviceId,
      monitors: this.monitors,
      baseUrl: serviceBaseUrl(this.target || (isManualConfigured(this.config) ? this.config : this.config.lastDiscovered))
    }
  }

  setState(state, extra) {
    this.state = state
    const snapshot = Object.assign(this.snapshot(), extra || {})
    this.emit('status', snapshot)
    if (this.logger) this.logger.info(`CLEVER-Service connection: ${state}` +
      (this.source ? ` (${this.source})` : ''))
  }

  async start() {
    if (this.started) {
      return
    }
    this.started = true
    this.monitors = detectMonitors(this.screenApi)
    if (this.logger) this.logger.info(`Detected ${this.monitors.length} monitor(s)`)
    this.stopWatch = watchMonitors(this.screenApi, (monitors, reason) => {
      this.handleMonitorChange(monitors, reason)
    }, this.logger)

    if (isManualConfigured(this.config)) {
      this.source = 'manual'
      this.setState('searching')
      await this.connectTo({
        host: this.config.host,
        port: this.config.port,
        protocol: this.config.protocol,
        source: 'manual'
      })
      return
    }

    if (this.config.lastDiscovered && this.config.lastDiscovered.host) {
      this.setState('searching')
      const ok = await this.connectTo(Object.assign({}, this.config.lastDiscovered, { source: 'discovered' }))
      if (ok) {
        return
      }
    }

    this.startDiscovery()
  }

  startDiscovery() {
    this.source = null
    this.setState('searching')
    if (this.discovery) {
      this.discovery.resetBackoff()
      this.discovery.sendProbe()
      return
    }
    this.discovery = new ServiceDiscovery({
      logger: this.logger,
      onFound: (found) => {
        if (isManualConfigured(this.config)) {
          return
        }
        if (this.state === 'connected' && this.target && this.target.host === found.host) {
          return
        }
        this.connectTo(found)
      }
    })
    this.discovery.start()
  }

  async connectTo(target) {
    if (!target || !target.host || this.connecting) {
      return false
    }
    this.connecting = true
    const connectingState = this.state === 'connected' ? 'reconnecting' : 'searching'
    this.setState(connectingState)
    try {
      await probeService(target, this.logger)
      this.target = {
        host: target.host,
        port: target.port,
        protocol: target.protocol || 'http',
        hostname: target.hostname || target.host
      }
      this.source = target.source === 'manual' || isManualConfigured(this.config) ? 'manual' : 'discovered'
      await this.register('online')
      if (this.source === 'discovered') {
        this.config.lastDiscovered = {
          host: this.target.host,
          port: this.target.port,
          protocol: this.target.protocol
        }
        saveServerConfig(this.userDataDir, this.config, this.logger)
      }
      this.startHeartbeat()
      this.setState('connected')
      if (this.discovery) {
        this.discovery.resetBackoff()
      }
      return true
    } catch (err) {
      if (this.logger) this.logger.warn(`CLEVER-Service connection failed: ${err.message}`)
      this.setState(this.started ? 'reconnecting' : 'disconnected', { error: err.message })
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
    const payload = buildRegistrationPayload({
      deviceId: this.deviceId,
      hostname: hostInfo.hostname || os.hostname(),
      hostnameLocal: hostInfo.hostnameLocal || `${os.hostname()}.local`,
      ip: hostInfo.ip || '127.0.0.1',
      macAddress: hostInfo.mac || null,
      os: os.platform(),
      osRelease: os.release(),
      appVersion: this.getAppVersion ? this.getAppVersion() : '0.0.0',
      status: status || 'online',
      sharing: this.getSharing(),
      vncPort: this.vncPort,
      wsPort: this.wsPort,
      audioPort: this.audioPort,
      monitors: this.monitors,
      capabilities: getCapabilities({
        audio: this.getAudioEnabled(),
        monitorCount: this.monitors.length
      })
    })
    await registerDevice(this.target, payload, this.logger)
  }

  startHeartbeat() {
    this.stopHeartbeat()
    this.heartbeatTimer = setInterval(() => {
      this.heartbeat()
    }, HEARTBEAT_MS)
  }

  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  async heartbeat() {
    if (!this.target) {
      return
    }
    try {
      const hostInfo = this.getHostInfo ? await this.getHostInfo() : {}
      await sendHeartbeat(this.target, {
        deviceId: this.deviceId,
        status: 'online',
        sharing: this.getSharing(),
        ip: hostInfo.ip,
        hostname: hostInfo.hostname,
        hostnameLocal: hostInfo.hostnameLocal,
        vncPort: this.vncPort,
        wsPort: this.wsPort,
        monitors: this.monitors
      }, this.logger)
      if (this.state !== 'connected') {
        this.setState('connected')
      }
    } catch (err) {
      if (this.logger) this.logger.warn(`Heartbeat failed: ${err.message}`)
      this.setState('reconnecting', { error: err.message })
      this.scheduleReconnect()
    }
  }

  scheduleReconnect() {
    if (this.reconnectTimer || !this.started) {
      return
    }
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.reconnect()
    }, RECONNECT_MS)
  }

  async reconnect() {
    if (!this.started) {
      return
    }
    this.setState('reconnecting')
    if (isManualConfigured(this.config)) {
      await this.connectTo({
        host: this.config.host,
        port: this.config.port,
        protocol: this.config.protocol,
        source: 'manual'
      })
      return
    }
    if (this.target) {
      const ok = await this.connectTo(Object.assign({}, this.target, { source: this.source || 'discovered' }))
      if (ok) {
        return
      }
    }
    this.startDiscovery()
  }

  async handleMonitorChange(monitors, reason) {
    if (!monitorsChanged(this.monitors, monitors)) {
      return
    }
    const summary = describeMonitorChange(this.monitors, monitors)
    if (this.logger) this.logger.info(`Monitor change (${reason}): ${summary}`)
    this.monitors = monitors
    this.emit('monitors', monitors)
    if (this.target && this.state === 'connected') {
      try {
        await this.register('online')
      } catch (err) {
        if (this.logger) this.logger.warn(`Failed to sync monitors: ${err.message}`)
      }
    }
  }

  async applyConfig(partial) {
    this.config = saveServerConfig(this.userDataDir, Object.assign({}, this.config, partial), this.logger)
    this.stopHeartbeat()
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (isManualConfigured(this.config)) {
      if (this.discovery) {
        this.discovery.stop()
        this.discovery = null
      }
      this.source = 'manual'
      await this.connectTo({
        host: this.config.host,
        port: this.config.port,
        protocol: this.config.protocol,
        source: 'manual'
      })
      return this.snapshot()
    }
    this.source = null
    this.target = null
    this.startDiscovery()
    return this.snapshot()
  }

  async notifySharing(sharing) {
    if (this.target && this.state === 'connected') {
      try {
        await this.register(sharing ? 'online' : 'online')
      } catch (err) {
        if (this.logger) this.logger.warn(`Failed to report sharing state: ${err.message}`)
      }
    }
  }

  async stop() {
    this.started = false
    this.stopHeartbeat()
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.discovery) {
      this.discovery.stop()
      this.discovery = null
    }
    if (this.stopWatch) {
      this.stopWatch()
      this.stopWatch = null
    }
    if (this.target) {
      await unregisterDevice(this.target, { deviceId: this.deviceId }, this.logger)
    }
    this.setState('disconnected')
  }
}

module.exports = {
  ConnectionManager,
  HEARTBEAT_MS
}
