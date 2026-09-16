const EventEmitter = require('events')
const { getOrCreateDeviceId } = require('./device-id')
const { detectMonitors, monitorsChanged, describeMonitorChange, watchMonitors } = require('./monitors')
const { websockifyPath } = require('./host-names')
const {
  loadServerConfig,
  saveServerConfig,
  isManualConfigured,
  serviceBaseUrl
} = require('./server-config')
const { ServiceDiscovery, serverKey, DEFAULT_TIMEOUT_MS, DEFAULT_RETRY_MS, DEFAULT_MAX_RETRY_MS } = require('./discovery')
const { ServerSession, STATES, HEARTBEAT_MS } = require('./server-session')

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
    this.getAudioConfig = options.getAudioConfig || (() => ({ audio: this.getAudioEnabled() }))
    this.getAudioSnapshot = options.getAudioSnapshot || null
    this.getSharing = options.getSharing || (() => false)
    this.wsPort = options.wsPort || 8840
    this.vncPort = options.vncPort || 5900
    this.audioPort = options.audioPort || 6900
    this.discoveryOptions = options.discovery || {}

    this.config = loadServerConfig(this.userDataDir, this.logger)
    this.deviceId = getOrCreateDeviceId(this.userDataDir, this.logger)
    this.state = 'disconnected'
    this.source = this.config.mode === 'manual' ? 'manual' : null
    this.target = null
    this.monitors = []
    this.discovery = null
    this.sessions = new Map()
    this.heartbeatTimer = null
    this.reconnectTimer = null
    this.stopWatch = null
    this.started = false
    this.connecting = false
    this.lastHeartbeatAt = null
    this.lastError = null
    this.registered = false
  }

  primarySession() {
    const sessions = Array.from(this.sessions.values())
    return sessions.find((session) => session.state === STATES.REGISTERED)
      || sessions.find((session) => session.state === STATES.CONNECTED)
      || sessions.find((session) => session.registered)
      || sessions.find((session) => session.id && this.target && serverKey(this.target) === session.id)
      || sessions[0]
      || null
  }

  overallState() {
    const sessions = Array.from(this.sessions.values())
    if (sessions.some((session) => session.state === STATES.REGISTERED || session.state === STATES.CONNECTED)) {
      return 'connected'
    }
    if (sessions.some((session) => session.state === STATES.RECONNECTING || session.state === STATES.CONNECTING)) {
      return 'reconnecting'
    }
    if (this.discovery && this.discovery.running) {
      return 'searching'
    }
    if (this.started) {
      return sessions.length ? 'reconnecting' : 'searching'
    }
    return 'disconnected'
  }

  snapshot() {
    const primary = this.primarySession()
    const target = primary ? primary.target : this.target
    const servers = Array.from(this.sessions.values()).map((session) => session.snapshot())
    const discovery = this.discovery
      ? this.discovery.snapshot()
      : {
          enabled: false,
          running: false,
          phase: 'stopped',
          discoveredCount: servers.length,
          message: servers.length ? null : 'No CLEVER-Service servers discovered'
        }
    return {
      state: this.overallState(),
      source: this.source || (primary && primary.source) || null,
      target,
      config: this.config,
      deviceId: this.deviceId,
      monitors: this.monitors,
      registered: servers.some((server) => server.registered),
      lastHeartbeatAt: primary ? primary.lastHeartbeatAt : this.lastHeartbeatAt,
      lastError: primary ? primary.lastError : this.lastError,
      servers,
      discovery,
      vnc: {
        port: this.vncPort,
        wsPort: this.wsPort,
        wsPath: '/' + websockifyPath(this.vncPort),
        sharing: this.getSharing()
      },
      baseUrl: serviceBaseUrl(target || (isManualConfigured(this.config) ? this.config : this.config.lastDiscovered))
    }
  }

  setState(state, extra) {
    this.state = state
    const snapshot = Object.assign(this.snapshot(), extra || {})
    this.emit('status', snapshot)
    if (this.logger) this.logger.info('CLEVER-Service connection: ' + snapshot.state +
      (snapshot.source ? ' (' + snapshot.source + ')' : ''))
  }

  emitStatus(extra) {
    this.state = this.overallState()
    const snapshot = Object.assign(this.snapshot(), extra || {})
    this.emit('status', snapshot)
  }

  sessionOptions(found) {
    return {
      manager: this,
      logger: this.logger,
      getHostInfo: this.getHostInfo,
      getAppVersion: this.getAppVersion,
      getAudioConfig: this.getAudioConfig,
      getAudioSnapshot: this.getAudioSnapshot,
      getSharing: this.getSharing,
      deviceId: this.deviceId,
      wsPort: this.wsPort,
      vncPort: this.vncPort,
      audioPort: this.audioPort,
      getMonitors: () => this.monitors,
      onChange: () => this.handleSessionChange(),
      found
    }
  }

  ensureSession(found, extra) {
    const id = (found && (found.serverId || serverKey(found))) || ''
    if (!id) {
      return null
    }
    let session = this.sessions.get(id)
    if (session) {
      session.touch(found)
      return session
    }
    const duplicate = Array.from(this.sessions.values()).find((existing) => {
      return existing.target && (
        (existing.target.host === found.host && Number(existing.target.port) === Number(found.port)) ||
        (existing.target.hostname && found.hostname &&
          String(existing.target.hostname).toLowerCase() === String(found.hostname).toLowerCase() &&
          Number(existing.target.port) === Number(found.port))
      )
    })
    if (duplicate) {
      duplicate.touch(found)
      if (this.logger) {
        this.logger.info('Duplicate server ignored hostname=' + (found.hostname || '') +
          ' IP address=' + found.host + ' port=' + found.port + ' server/device ID=' + duplicate.id)
      }
      return duplicate
    }
    session = new ServerSession(Object.assign(this.sessionOptions(found), extra || {}, { id }))
    this.sessions.set(session.id, session)
    return session
  }

  handleSessionChange() {
    const primary = this.primarySession()
    if (primary) {
      this.target = primary.target
      this.source = primary.source
      this.registered = primary.registered
      this.lastHeartbeatAt = primary.lastHeartbeatAt
      this.lastError = primary.lastError
      if (primary.source === 'discovered' && primary.registered) {
        const next = {
          host: primary.target.host,
          port: primary.target.port,
          protocol: primary.target.protocol
        }
        const prev = this.config.lastDiscovered
        if (!prev || prev.host !== next.host || Number(prev.port) !== Number(next.port) || prev.protocol !== next.protocol) {
          this.config.lastDiscovered = next
          saveServerConfig(this.userDataDir, this.config, this.logger)
        }
      }
    } else {
      this.registered = false
    }
    this.emitStatus()
  }

  async start() {
    if (this.started) {
      return
    }
    this.started = true
    this.monitors = detectMonitors(this.screenApi)
    if (this.logger) this.logger.info('Detected ' + this.monitors.length + ' monitor(s)')
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
        hostname: this.config.host,
        source: 'manual'
      })
      return
    }

    if (this.config.lastDiscovered && this.config.lastDiscovered.host) {
      this.setState('searching')
      this.connectTo(Object.assign({}, this.config.lastDiscovered, { source: 'discovered' }))
    }

    this.startDiscovery()
  }

  startDiscovery() {
    if (isManualConfigured(this.config)) {
      return
    }
    this.source = this.source || null
    this.setState(this.overallState() === 'connected' ? 'connected' : 'searching')
    if (this.discovery && this.discovery.running) {
      this.discovery.resetBackoff()
      this.discovery.refresh()
      return
    }
    if (this.discovery) {
      this.discovery.stop()
      this.discovery = null
    }
    const discoveryCfg = this.discoveryOptions
    this.discovery = new ServiceDiscovery({
      logger: this.logger,
      port: discoveryCfg.port,
      timeoutMs: discoveryCfg.timeoutMs || DEFAULT_TIMEOUT_MS,
      retryIntervalMs: discoveryCfg.retryIntervalMs || DEFAULT_RETRY_MS,
      maxRetryIntervalMs: discoveryCfg.maxRetryIntervalMs || DEFAULT_MAX_RETRY_MS,
      fallbackAddresses: discoveryCfg.fallbackAddresses,
      onFound: (found) => this.handleDiscovered(found),
      onRoundComplete: (servers) => this.handleRoundComplete(servers),
      onStateChange: () => this.emitStatus()
    })
    this.discovery.start()
  }

  stopDiscovery() {
    if (this.discovery) {
      this.discovery.stop()
      this.discovery = null
    }
    this.emitStatus()
  }

  refreshDiscovery() {
    if (isManualConfigured(this.config)) {
      return this.snapshot()
    }
    this.startDiscovery()
    return this.snapshot()
  }

  handleDiscovered(found) {
    if (isManualConfigured(this.config)) {
      return
    }
    const session = this.ensureSession(found, { autoConnect: true })
    if (!session) {
      return
    }
    if (session.state === STATES.DISCOVERED || session.state === STATES.UNAVAILABLE || session.state === STATES.ERROR) {
      session.connect()
    }
  }

  handleRoundComplete() {
    this.emitStatus()
  }

  async connectTo(target) {
    if (!target || !target.host) {
      return false
    }
    const session = this.ensureSession(Object.assign({
      hostname: target.hostname || target.host,
      ip: target.host,
      serverId: target.serverId || serverKey(target)
    }, target), { autoConnect: true, source: target.source })
    if (!session) {
      return false
    }
    this.connecting = true
    this.setState(this.overallState() === 'connected' ? 'reconnecting' : 'searching')
    try {
      const ok = await session.connect()
      this.connecting = false
      if (ok) {
        this.target = session.target
        this.source = session.source
        this.registered = true
        this.lastError = null
        this.setState('connected')
        if (this.discovery) {
          this.discovery.resetBackoff()
        }
        return true
      }
      this.registered = Array.from(this.sessions.values()).some((item) => item.registered)
      this.lastError = session.lastError
      this.setState(this.overallState(), { error: session.lastError })
      return false
    } finally {
      this.connecting = false
    }
  }

  async register(status) {
    const sessions = Array.from(this.sessions.values()).filter((session) => {
      return session.registered || session.state === STATES.CONNECTED || session.state === STATES.REGISTERED
    })
    const targetSession = sessions.length ? null : this.primarySession()
    const list = sessions.length ? sessions : (targetSession ? [targetSession] : [])
    for (const session of list) {
      try {
        await session.register(status)
      } catch (err) {
        if (this.logger) this.logger.warn('Failed to register with ' + session.target.host + ': ' + err.message)
      }
    }
  }

  startHeartbeat() {
    const primary = this.primarySession()
    if (primary) {
      primary.startHeartbeat()
    }
  }

  stopHeartbeat() {
    this.sessions.forEach((session) => session.stopHeartbeat())
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  async heartbeat() {
    const primary = this.primarySession()
    if (primary) {
      await primary.heartbeat()
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
        hostname: this.config.host,
        source: 'manual'
      })
      return
    }
    const pending = Array.from(this.sessions.values())
    if (pending.length) {
      await Promise.all(pending.map((session) => session.reconnect().catch(() => false)))
      if (this.primarySession()) {
        return
      }
    }
    this.startDiscovery()
  }

  async registerServer(id) {
    const session = this.sessions.get(id) || Array.from(this.sessions.values()).find((item) => item.id === id)
    if (!session) {
      return this.snapshot()
    }
    await session.connect()
    return this.snapshot()
  }

  async unregisterServer(id) {
    const session = this.sessions.get(id)
    if (!session) {
      return this.snapshot()
    }
    await session.unregister()
    return this.snapshot()
  }

  async reconnectServer(id) {
    const session = this.sessions.get(id)
    if (!session) {
      return this.snapshot()
    }
    await session.reconnect()
    return this.snapshot()
  }

  async handleMonitorChange(monitors, reason) {
    if (!monitorsChanged(this.monitors, monitors)) {
      return
    }
    const summary = describeMonitorChange(this.monitors, monitors)
    if (this.logger) this.logger.info('Monitor change (' + reason + '): ' + summary)
    this.monitors = monitors
    this.emit('monitors', monitors)
    await this.register('online')
  }

  async applyConfig(partial) {
    this.config = saveServerConfig(this.userDataDir, Object.assign({}, this.config, partial), this.logger)
    this.stopHeartbeat()
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (isManualConfigured(this.config)) {
      this.stopDiscovery()
      await Promise.all(Array.from(this.sessions.values()).map((session) => session.stop().catch(() => null)))
      this.sessions.clear()
      this.source = 'manual'
      this.target = null
      this.registered = false
      await this.connectTo({
        host: this.config.host,
        port: this.config.port,
        protocol: this.config.protocol,
        hostname: this.config.host,
        source: 'manual'
      })
      return this.snapshot()
    }
    this.source = null
    this.target = null
    this.registered = false
    this.startDiscovery()
    return this.snapshot()
  }

  async notifySharing(sharing) {
    await this.register(sharing ? 'online' : 'online')
  }

  async stop() {
    this.started = false
    this.stopHeartbeat()
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.stopDiscovery()
    if (this.stopWatch) {
      this.stopWatch()
      this.stopWatch = null
    }
    await Promise.all(Array.from(this.sessions.values()).map((session) => session.stop().catch(() => null)))
    this.sessions.clear()
    this.setState('disconnected')
  }
}

module.exports = {
  ConnectionManager,
  HEARTBEAT_MS,
  STATES
}
