/**
 * Optional audio settings. Capture and WebRTC never start from these
 * flags alone — a remote client must also connect.
 *
 * Legacy `config.audio` maps to system audio when `systemAudio` is unset.
 */
const STATES = Object.freeze([
  'disabled',
  'starting',
  'enabled',
  'connected',
  'reconnecting',
  'error',
  'unsupported'
])

const DEFAULTS = Object.freeze({
  audio: false,
  systemAudio: false,
  microphone: false,
  speakerOutput: true,
  twoWayAudio: false,
  audioBitrate: 48000,
  audioPath: '/audio',
  audioCodec: 'opus'
})

function asBoolean(value, fallback) {
  if (value === true || value === false) {
    return value
  }
  if (value === 'true' || value === '1') {
    return true
  }
  if (value === 'false' || value === '0') {
    return false
  }
  return fallback
}

function normalizeAudioConfig(raw) {
  const source = raw && typeof raw === 'object' ? raw : {}
  const legacyAudio = asBoolean(source.audio, DEFAULTS.audio)
  const systemAudio = Object.prototype.hasOwnProperty.call(source, 'systemAudio')
    ? asBoolean(source.systemAudio, false)
    : legacyAudio
  return {
    audio: legacyAudio,
    systemAudio,
    microphone: asBoolean(source.microphone, DEFAULTS.microphone),
    speakerOutput: asBoolean(source.speakerOutput, DEFAULTS.speakerOutput),
    twoWayAudio: asBoolean(source.twoWayAudio, DEFAULTS.twoWayAudio),
    audioBitrate: Math.max(16000, Math.min(128000, Number(source.audioBitrate) || DEFAULTS.audioBitrate)),
    audioPath: source.audioPath || DEFAULTS.audioPath,
    audioCodec: source.audioCodec || DEFAULTS.audioCodec
  }
}

function anyAudioEnabled(config) {
  const normalized = normalizeAudioConfig(config)
  return !!(normalized.systemAudio || normalized.microphone || normalized.twoWayAudio)
}

function configLine(name, value) {
  if (typeof value === 'string') {
    return `exports.${name} = ${JSON.stringify(value)}`
  }
  return `exports.${name} = ${value}`
}

module.exports = {
  STATES,
  DEFAULTS,
  asBoolean,
  normalizeAudioConfig,
  anyAudioEnabled,
  configLine
}
