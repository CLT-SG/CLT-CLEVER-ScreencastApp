const test = require('node:test')
const assert = require('node:assert/strict')
const { normalizeAudioConfig, anyAudioEnabled } = require('../lib/audio-config')
const { detectAudioCapabilities } = require('../lib/audio-capabilities')
const { AudioSession } = require('../lib/audio-session')
const { parseJson } = require('../lib/audio-protocol')
const { getCapabilities } = require('../lib/capabilities')
const { buildRegistrationPayload } = require('../lib/registration')

test('audio defaults stay off until explicitly enabled', () => {
  const config = normalizeAudioConfig({})
  assert.equal(config.systemAudio, false)
  assert.equal(config.microphone, false)
  assert.equal(config.twoWayAudio, false)
  assert.equal(config.speakerOutput, true)
  assert.equal(anyAudioEnabled(config), false)
})

test('legacy config.audio maps to system audio only when systemAudio is unset', () => {
  assert.equal(normalizeAudioConfig({ audio: true }).systemAudio, true)
  assert.equal(normalizeAudioConfig({ audio: true, systemAudio: false }).systemAudio, false)
})

test('windows reports system audio; macOS needs a loopback device', () => {
  const win = detectAudioCapabilities({ platform: 'win32', devices: [] })
  assert.equal(win.system_audio, true)
  assert.equal(win.microphone_capture, true)
  assert.equal(win.webrtc_audio, true)
  assert.equal(win.microphone_injection, false)

  const mac = detectAudioCapabilities({ platform: 'darwin', devices: [] })
  assert.equal(mac.system_audio, false)
  const macLoop = detectAudioCapabilities({
    platform: 'darwin',
    devices: [{ kind: 'audioinput', label: 'BlackHole 2ch' }]
  })
  assert.equal(macLoop.system_audio, true)

  const inject = detectAudioCapabilities({
    platform: 'win32',
    devices: [{ kind: 'audiooutput', label: 'CABLE Input (VB-Audio Virtual Cable)' }]
  })
  assert.equal(inject.microphone_injection, true)
})

test('idle session does not capture', () => {
  const session = new AudioSession({
    config: { systemAudio: true },
    capabilities: { system_audio: true, microphone_capture: true, microphone_injection: false }
  })
  assert.equal(session.state, 'enabled')
  assert.equal(session.shouldCaptureSystemAudio(), false)
  assert.equal(session.shouldCaptureMicrophone(), false)
  session.addClient('player-1')
  assert.equal(session.shouldCaptureSystemAudio(), true)
  assert.equal(session.state, 'starting')
  session.markConnected()
  assert.equal(session.state, 'connected')
  session.removeClient('player-1')
  assert.equal(session.shouldCaptureSystemAudio(), false)
  assert.equal(session.capturing.systemAudio, false)
  assert.equal(session.state, 'enabled')
})

test('audio reconnect does not require a VNC restart', () => {
  const session = new AudioSession({
    config: { systemAudio: true },
    capabilities: { system_audio: true, microphone_capture: true }
  })
  session.addClient('a')
  session.markConnected()
  session.markReconnecting('network blip')
  assert.equal(session.state, 'reconnecting')
  session.markConnected()
  assert.equal(session.state, 'connected')
})

test('disabled audio never starts capture even with a client', () => {
  const session = new AudioSession({
    config: { systemAudio: false, microphone: false, twoWayAudio: false, speakerOutput: false },
    capabilities: { system_audio: true, microphone_capture: true }
  })
  session.addClient('a')
  assert.equal(session.shouldCaptureSystemAudio(), false)
  assert.equal(session.shouldCaptureMicrophone(), false)
})

test('unsupported system audio is reported without capturing', () => {
  const session = new AudioSession({
    config: { systemAudio: true, microphone: false },
    capabilities: { system_audio: false, microphone_capture: true }
  })
  assert.equal(session.state, 'unsupported')
  session.addClient('a')
  assert.equal(session.shouldCaptureSystemAudio(), false)
  assert.equal(session.state, 'unsupported')
})

test('capabilities advertise webrtc without duplicating vnc encodings', () => {
  const caps = getCapabilities({ audio: false, monitorCount: 2, platform: 'linux' })
  assert.equal(caps.vnc.audio, false)
  assert.equal(caps.webrtc_audio, true)
  assert.equal(caps.audio.transport, 'webrtc')
  assert.equal(caps.audio.codec, 'opus')
  assert.equal(caps.audio.path, '/audio')
  assert.equal(Object.prototype.hasOwnProperty.call(caps.vnc, 'encodings'), false)
})

test('registration payload includes webrtc audio transport on the websockify port', () => {
  const payload = buildRegistrationPayload({
    deviceId: 'abc',
    hostname: 'CLT-PC-01',
    ip: '192.168.1.100',
    wsPort: 8840,
    vncPort: 5900,
    audioPort: 8840,
    audioPath: '/audio',
    audioTransport: 'webrtc',
    capabilities: getCapabilities({ systemAudio: true, platform: 'win32' })
  })
  assert.equal(payload.audioTransport, 'webrtc')
  assert.equal(payload.audioPath, '/audio')
  assert.equal(payload.audioPort, 8840)
  assert.equal(payload.wsPort, 8840)
  assert.equal(payload.capabilities.audio.transport, 'webrtc')
})

test('signaling parser ignores non-json frames', () => {
  assert.equal(parseJson('{"type":"offer"}').type, 'offer')
  assert.equal(parseJson('not-json'), null)
  assert.equal(parseJson(Buffer.from('{"type":"ping"}')).type, 'ping')
})
