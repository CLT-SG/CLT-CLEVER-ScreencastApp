const EventEmitter = require('events')
const { STATES, normalizeAudioConfig, anyAudioEnabled } = require('./audio-config')
const { detectAudioCapabilities } = require('./audio-capabilities')

function isState(value) {
  return STATES.indexOf(value) !== -1
}

/**
 * Independent audio lifecycle. Never starts capture unless a feature is
 * enabled and at least one remote client is connected.
 */
class AudioSession extends EventEmitter {
  constructor(options) {
    super()
    this.logger = options && options.logger
    this.capabilities = (options && options.capabilities) || detectAudioCapabilities(options)
    this.config = normalizeAudioConfig(options && options.config)
    this.state = 'disabled'
    this.error = null
    this.clients = new Set()
    this.capturing = {
      systemAudio: false,
      microphone: false
    }
    this.selectedDevices = {
      systemAudio: (options && options.selectedDevices && options.selectedDevices.systemAudio) || null,
      microphone: (options && options.selectedDevices && options.selectedDevices.microphone) || null,
      output: (options && options.selectedDevices && options.selectedDevices.output) || null
    }
    this.state = this.resolveIdleState()
  }

  snapshot() {
    return {
      state: this.state,
      error: this.error,
      config: this.config,
      capabilities: this.capabilities,
      clients: this.clients.size,
      capturing: Object.assign({}, this.capturing),
      selectedDevices: Object.assign({}, this.selectedDevices),
      shouldCaptureSystemAudio: this.shouldCaptureSystemAudio(),
      shouldCaptureMicrophone: this.shouldCaptureMicrophone(),
      shouldPlayRemote: this.shouldPlayRemote(),
      shouldInjectMicrophone: this.shouldInjectMicrophone()
    }
  }

  setState(state, extra) {
    if (!isState(state)) {
      throw new Error('Unknown audio state: ' + state)
    }
    const previous = this.state
    this.state = state
    if (state !== 'error') {
      this.error = extra && extra.error ? extra.error : null
    } else {
      this.error = (extra && extra.error) || this.error || 'Audio error'
    }
    if (this.logger) {
      this.logger.info(`[audio] ${previous} -> ${state}` + (this.error ? ` (${this.error})` : ''))
    }
    this.emit('status', this.snapshot())
  }

  applyConfig(partial) {
    this.config = normalizeAudioConfig(Object.assign({}, this.config, partial || {}))
    if (!anyAudioEnabled(this.config) && this.clients.size === 0) {
      this.stopCapture()
      this.setState('disabled')
      return this.snapshot()
    }
    if (this.clients.size === 0) {
      this.stopCapture()
      this.setState(this.resolveIdleState())
      return this.snapshot()
    }
    this.refreshActiveState()
    return this.snapshot()
  }

  applyCapabilities(capabilities) {
    if (capabilities) {
      this.capabilities = capabilities
    }
    this.refreshActiveState()
    return this.snapshot()
  }

  resolveIdleState() {
    if (!anyAudioEnabled(this.config)) {
      return 'disabled'
    }
    if (this.config.systemAudio && !this.capabilities.system_audio &&
        this.config.microphone && !this.capabilities.microphone_capture) {
      return 'unsupported'
    }
    if (this.config.systemAudio && !this.capabilities.system_audio && !this.config.microphone) {
      return 'unsupported'
    }
    return 'enabled'
  }

  shouldCaptureSystemAudio() {
    return !!(this.config.systemAudio && this.capabilities.system_audio && this.clients.size > 0)
  }

  shouldCaptureMicrophone() {
    const mic = this.config.microphone || this.config.twoWayAudio
    return !!(mic && this.capabilities.microphone_capture && this.clients.size > 0)
  }

  shouldPlayRemote() {
    const recv = this.config.speakerOutput || this.config.twoWayAudio || this.config.microphone
    return !!(recv && this.clients.size > 0)
  }

  shouldInjectMicrophone() {
    return !!(this.shouldPlayRemote() && this.capabilities.microphone_injection)
  }

  addClient(clientId) {
    const id = String(clientId || 'client')
    this.clients.add(id)
    if (this.logger) this.logger.info(`[audio] client joined (${id}), count=${this.clients.size}`)
    this.refreshActiveState()
    return this.snapshot()
  }

  removeClient(clientId) {
    const id = String(clientId || 'client')
    this.clients.delete(id)
    if (this.logger) this.logger.info(`[audio] client left (${id}), count=${this.clients.size}`)
    if (this.clients.size === 0) {
      this.stopCapture()
      this.setState(this.resolveIdleState())
    } else {
      this.refreshActiveState()
    }
    return this.snapshot()
  }

  markCapturing(kind, active) {
    if (kind === 'systemAudio' || kind === 'microphone') {
      this.capturing[kind] = !!active
    }
  }

  stopCapture() {
    this.capturing.systemAudio = false
    this.capturing.microphone = false
  }

  refreshActiveState() {
    if (this.clients.size === 0) {
      this.stopCapture()
      this.setState(this.resolveIdleState())
      return
    }
    const wantSystem = this.config.systemAudio
    const wantMic = this.config.microphone || this.config.twoWayAudio
    if (!wantSystem && !wantMic && !this.config.speakerOutput) {
      this.stopCapture()
      this.setState('disabled')
      return
    }
    if (wantSystem && !this.capabilities.system_audio && !wantMic) {
      this.setState('unsupported', { error: 'System audio is not supported on this device' })
      return
    }
    if (wantMic && !this.capabilities.microphone_capture && !wantSystem) {
      this.setState('unsupported', { error: 'Microphone capture is not supported on this device' })
      return
    }
    if (wantSystem && !this.capabilities.system_audio && wantMic && !this.capabilities.microphone_capture) {
      this.setState('unsupported', { error: 'Requested audio features are not supported on this device' })
      return
    }
    if (this.state === 'error' || this.state === 'reconnecting') {
      return
    }
    if (this.state !== 'connected' && this.state !== 'starting') {
      this.setState('starting')
    }
  }

  markConnected() {
    if (this.clients.size === 0) {
      this.setState(this.resolveIdleState())
      return
    }
    this.setState('connected')
  }

  markReconnecting(error) {
    if (this.clients.size === 0) {
      this.setState(this.resolveIdleState())
      return
    }
    this.setState('reconnecting', { error: error || 'Audio connection interrupted' })
  }

  markError(error) {
    this.setState('error', { error: error || 'Audio failure' })
  }

  markStarting() {
    this.setState('starting')
  }
}

module.exports = {
  AudioSession,
  STATES,
  isState
}
