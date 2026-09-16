/**
 * Capabilities actually supported by CLEVER Screencast + CLEVER-node noVNC.
 * Only advertise features the current stack can use.
 */
const { buildAudioCapabilityBlock } = require('./audio-capabilities')
const { normalizeAudioConfig } = require('./audio-config')

function getCapabilities(options) {
  const opts = options || {}
  const config = normalizeAudioConfig({
    audio: opts.audio,
    systemAudio: opts.systemAudio,
    microphone: opts.microphone,
    speakerOutput: opts.speakerOutput,
    twoWayAudio: opts.twoWayAudio,
    audioBitrate: opts.audioBitrate
  })
  return buildAudioCapabilityBlock({
    config,
    state: opts.audioState || (config.systemAudio || config.microphone || config.twoWayAudio ? 'enabled' : 'disabled'),
    wsPort: opts.wsPort,
    monitorCount: opts.monitorCount,
    devices: opts.devices,
    platform: opts.platform
  })
}

module.exports = {
  getCapabilities
}
