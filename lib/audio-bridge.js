const path = require('path')
const { BrowserWindow } = require('electron')
const { AudioSession } = require('./audio-session')
const { attachAudioSignaling } = require('./audio-signaling')
const { buildAudioCapabilityBlock, detectAudioCapabilities } = require('./audio-capabilities')
const { normalizeAudioConfig } = require('./audio-config')

/**
 * Main-process audio coordinator. Owns signaling (on the existing HTTPS
 * server) and a hidden Chromium window that performs WebRTC + capture.
 * VNC sharing is never started, stopped, or restarted from here.
 */
class AudioBridge {
  constructor(options) {
    this.server = options.server
    this.logger = options.logger
    this.preload = options.preload || path.join(__dirname, '..', 'preload-audio.js')
    this.page = options.page || path.join(__dirname, '..', 'src', 'audio-engine.html')
    this.getConfig = options.getConfig || (() => ({}))
    this.wsPort = options.wsPort || 8840
    this.onStatus = options.onStatus || (() => {})
    this.session = new AudioSession({
      logger: this.logger,
      config: this.getConfig(),
      capabilities: detectAudioCapabilities({ platform: process.platform }),
      wsPort: this.wsPort
    })
    this.window = null
    this.engineReady = false
    this.signaling = null
    this.pending = []
    this.started = false

    this.session.on('status', (snapshot) => {
      this.onStatus(snapshot)
      if (this.signaling) {
        this.signaling.broadcastStatus({
          state: snapshot.state,
          error: snapshot.error,
          config: snapshot.config,
          capabilities: snapshot.capabilities,
          capturing: snapshot.capturing
        })
      }
    })
  }

  capabilities() {
    return buildAudioCapabilityBlock({
      config: this.session.config,
      state: this.session.state,
      wsPort: this.wsPort,
      monitorCount: 0,
      devices: []
    })
  }

  snapshot() {
    return this.session.snapshot()
  }

  start() {
    if (this.started) {
      return
    }
    this.started = true
    this.signaling = attachAudioSignaling(this.server, {
      logger: this.logger,
      config: this.session.config,
      capabilities: this.session.capabilities,
      onJoin: (clientId) => {
        this.session.addClient(clientId)
        this.ensureEngine()
        this.sendEngine({ type: 'client-join', clientId, config: this.session.config, capabilities: this.session.capabilities })
      },
      onLeave: (clientId) => {
        this.sendEngine({ type: 'client-leave', clientId })
        this.session.removeClient(clientId)
        if (this.session.clients.size === 0) {
          this.sendEngine({ type: 'idle' })
        }
      },
      onMessage: (clientId, message) => {
        if (message.type === 'hello') {
          this.signaling.send(clientId, {
            type: 'status',
            ...this.session.snapshot()
          })
        }
        if (message.type === 'control') {
          this.applyConfig({
            systemAudio: message.systemAudio,
            microphone: message.microphone,
            speakerOutput: message.speaker,
            twoWayAudio: message.twoWay
          }, { persist: false, fromClient: true })
        }
        this.sendEngine({ type: 'signal', clientId, message })
      }
    })
    this.session.setState(this.session.resolveIdleState())
    if (this.logger) this.logger.info('[audio] signaling listening on /audio (WebRTC)')
  }

  ensureEngine() {
    if (this.window && !this.window.isDestroyed()) {
      return
    }
    this.engineReady = false
    this.window = new BrowserWindow({
      show: false,
      width: 64,
      height: 64,
      skipTaskbar: true,
      webPreferences: {
        preload: this.preload,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        backgroundThrottling: false,
        webSecurity: true
      }
    })
    this.window.webContents.on('did-finish-load', () => {
      if (this.logger) this.logger.info('[audio] capture engine loaded')
    })
    this.window.webContents.session.setPermissionRequestHandler((_contents, permission, callback) => {
      callback(['media', 'audioCapture', 'videoCapture', 'display-capture', 'speaker-selection'].indexOf(permission) !== -1)
    })
    this.window.on('closed', () => {
      this.window = null
      this.engineReady = false
      if (this.started && this.session.clients.size > 0) {
        this.session.markReconnecting('Audio engine window closed')
        setTimeout(() => this.ensureEngine(), 500)
      }
    })
    this.window.loadFile(this.page)
  }

  handleEngineIpc(channel, payload) {
    if (channel === 'audio-engine-ready') {
      this.engineReady = true
      this.sendEngine({
        type: 'config',
        config: this.session.config,
        capabilities: this.session.capabilities
      })
      this.pending.splice(0).forEach((message) => this.sendEngine(message, true))
      return
    }
    if (channel === 'audio-engine-log') {
      const level = (payload && payload.level) || 'info'
      const msg = (payload && payload.msg) || ''
      if (this.logger && this.logger[level]) {
        this.logger[level]('[audio] ' + msg)
      } else if (this.logger) {
        this.logger.info('[audio] ' + msg)
      }
      return
    }
    if (channel !== 'audio-engine-message' || !payload) {
      return
    }
    if (payload.type === 'signal' && payload.clientId && this.signaling) {
      this.signaling.send(payload.clientId, payload.message)
      return
    }
    if (payload.type === 'status') {
      if (payload.capturing) {
        this.session.markCapturing('systemAudio', payload.capturing.systemAudio)
        this.session.markCapturing('microphone', payload.capturing.microphone)
      }
      if (payload.devices) {
        this.session.applyCapabilities(detectAudioCapabilities({
          platform: process.platform,
          devices: payload.devices
        }))
      }
      if (payload.state === 'connected') this.session.markConnected()
      else if (payload.state === 'reconnecting') this.session.markReconnecting(payload.error)
      else if (payload.state === 'error') this.session.markError(payload.error)
      else if (payload.state === 'starting') this.session.markStarting()
      else if (payload.state === 'unsupported') this.session.setState('unsupported', { error: payload.error })
      return
    }
  }

  sendEngine(message, flush) {
    if (!this.window || this.window.isDestroyed() || !this.engineReady) {
      if (!flush) this.pending.push(message)
      this.ensureEngine()
      return
    }
    this.window.webContents.send('audio-engine-event', message)
  }

  applyConfig(partial, options) {
    const snapshot = this.session.applyConfig(partial)
    this.sendEngine({ type: 'config', config: snapshot.config, capabilities: snapshot.capabilities })
    if (this.signaling) {
      this.signaling.broadcastStatus({
        state: snapshot.state,
        error: snapshot.error,
        config: snapshot.config,
        capabilities: snapshot.capabilities
      })
    }
    this.onStatus(snapshot)
    return snapshot
  }

  stop() {
    this.started = false
    if (this.signaling) {
      this.signaling.closeAll()
    }
    this.session.stopCapture()
    this.session.clients.clear()
    this.session.setState('disabled')
    if (this.window && !this.window.isDestroyed()) {
      this.window.destroy()
    }
    this.window = null
    this.engineReady = false
  }
}

module.exports = {
  AudioBridge,
  normalizeAudioConfig
}
