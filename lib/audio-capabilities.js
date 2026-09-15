const os = require('os')
const { normalizeAudioConfig } = require('./audio-config')

const INJECTION_PATTERNS = [
  /cable (input|output)/i,
  /vb-audio/i,
  /voicemeeter/i,
  /virtual (audio|cable)/i,
  /blackhole/i,
  /soundflower/i,
  /loopback/i,
  /pulseaudio.*null/i,
  /monitor of/i,
  /virtual_sink/i,
  /clever-mic/i
]

const LOOPBACK_PATTERNS = [
  /stereo mix/i,
  /what u hear/i,
  /loopback/i,
  /monitor of/i,
  /blackhole/i,
  /soundflower/i,
  /cable output/i,
  /wave out mix/i
]

function deviceLabel(device) {
  return String((device && (device.label || device.name || device.deviceId)) || '')
}

function hasMatchingDevice(devices, patterns) {
  return (devices || []).some((device) => patterns.some((pattern) => pattern.test(deviceLabel(device))))
}

function detectAudioCapabilities(options) {
  const opts = options || {}
  const platform = opts.platform || os.platform()
  const devices = opts.devices || []
  const inputs = devices.filter((device) => (device.kind || device.type || 'audioinput') !== 'audiooutput')
  const outputs = devices.filter((device) => (device.kind || device.type) === 'audiooutput')
  const injection = hasMatchingDevice(devices, INJECTION_PATTERNS)
  const loopbackDevice = hasMatchingDevice(devices, LOOPBACK_PATTERNS)

  // Chromium desktop-capture loopback is reliable on Windows. Linux can
  // use a Pulse/PipeWire monitor. macOS needs a virtual loopback device
  // on Electron 22 (ScreenCaptureKit system audio is not available).
  let systemAudio = false
  let systemAudioNote = ''
  if (platform === 'win32') {
    systemAudio = true
  } else if (platform === 'linux') {
    systemAudio = true
    systemAudioNote = 'Uses desktop capture or a PulseAudio/PipeWire monitor source'
  } else if (platform === 'darwin') {
    systemAudio = loopbackDevice
    systemAudioNote = systemAudio
      ? 'Using a virtual loopback device'
      : 'System audio capture requires a virtual device such as BlackHole'
  }

  const microphoneCapture = opts.mediaDevices !== false
  const webrtc = opts.webrtc !== false

  return {
    vnc: true,
    monitor_info: true,
    system_audio: systemAudio,
    microphone_capture: microphoneCapture,
    microphone_injection: injection,
    webrtc_audio: webrtc,
    audio_codec: 'opus',
    audio_transport: webrtc ? 'webrtc' : null,
    platform,
    notes: {
      system_audio: systemAudioNote,
      microphone_injection: injection
        ? 'Virtual audio device available for playback routing'
        : 'No virtual microphone device detected'
    }
  }
}

function buildAudioCapabilityBlock(options) {
  const caps = detectAudioCapabilities(options)
  const config = normalizeAudioConfig(options && options.config)
  const monitorCount = Number(options && options.monitorCount) || 0
  const state = (options && options.state) || (config.systemAudio || config.microphone || config.twoWayAudio ? 'enabled' : 'disabled')

  return {
    multiMonitor: monitorCount > 1,
    monitorSelection: true,
    screenCrop: true,
    viewOnly: true,
    reconnect: true,
    system_audio: caps.system_audio,
    microphone_capture: caps.microphone_capture,
    microphone_injection: caps.microphone_injection,
    webrtc_audio: caps.webrtc_audio,
    display: {
      multiMonitor: monitorCount > 1,
      monitorSelection: true,
      screenCrop: true,
      position: true,
      size: true,
      fullDesktopCapture: true,
      individualMonitorCapture: true
    },
    scaling: {
      fitToScreen: true,
      remoteScaling: true,
      localScaling: true,
      nativeResolution: true
    },
    vnc: {
      viewOnly: true,
      remoteControl: true,
      reconnect: true,
      maxQuality: true,
      compression: true,
      connectionStatus: true,
      audio: !!(caps.system_audio && config.systemAudio)
    },
    audio: {
      transport: 'webrtc',
      codec: 'opus',
      path: config.audioPath,
      port: Number(options && options.wsPort) || 8840,
      bitrate: config.audioBitrate,
      supported: !!(caps.webrtc_audio && (caps.system_audio || caps.microphone_capture)),
      state,
      enabled: {
        systemAudio: !!config.systemAudio,
        microphone: !!config.microphone,
        speaker: !!config.speakerOutput,
        twoWay: !!config.twoWayAudio
      },
      devices: {
        inputs: ((options && options.devices) || [])
          .filter((device) => (device.kind || 'audioinput') === 'audioinput')
          .map((device) => ({ id: device.deviceId || device.id, label: device.label || device.name || 'Input' })),
        outputs: ((options && options.devices) || [])
          .filter((device) => device.kind === 'audiooutput')
          .map((device) => ({ id: device.deviceId || device.id, label: device.label || device.name || 'Output' }))
      },
      notes: caps.notes
    }
  }
}

module.exports = {
  INJECTION_PATTERNS,
  LOOPBACK_PATTERNS,
  hasMatchingDevice,
  detectAudioCapabilities,
  buildAudioCapabilityBlock
}
