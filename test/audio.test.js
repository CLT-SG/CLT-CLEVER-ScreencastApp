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

test('audio signaling source rejects clients when sharing is stopped', () => {
  const fs = require('fs')
  const path = require('path')
  const signaling = fs.readFileSync(path.join(__dirname, '../lib/audio-signaling.js'), 'utf8')
  const bridge = fs.readFileSync(path.join(__dirname, '../lib/audio-bridge.js'), 'utf8')
  assert.match(signaling, /opts\.accepting/)
  assert.match(signaling, /Sharing stopped/)
  assert.match(bridge, /setAcceptingClients/)
  assert.match(bridge, /disconnectClients/)
})

test('addClient always emits status so Clients count updates', () => {
  const session = new AudioSession({
    config: { systemAudio: true },
    capabilities: { system_audio: true, microphone_capture: true, microphone_injection: false }
  })
  session.setState('starting')
  let snaps = 0
  let lastClients = 0
  session.on('status', (snapshot) => {
    snaps += 1
    lastClients = snapshot.clients
  })
  session.addClient('vw-1')
  assert.equal(lastClients, 1)
  assert.ok(snaps >= 1)
  session.addClient('vw-2')
  assert.equal(lastClients, 2)
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

test('audio bridge applies player hello feature flags like control', () => {
  const src = require('fs').readFileSync(require('path').join(__dirname, '../lib/audio-bridge.js'), 'utf8')
  assert.match(src, /message\.type === 'hello'/)
  assert.match(src, /message\.systemAudio/)
  assert.match(src, /fromClient: true/)
  assert.match(src, /Do not forward hello into the WebRTC engine/)
})

test('audio engine renegotiates only the controlling client by default', () => {
  const src = require('fs').readFileSync(require('path').join(__dirname, '../src/audio-engine.js'), 'utf8')
  assert.match(src, /queueOffer/)
  assert.match(src, /handleControl\(clientId, message\)/)
  assert.match(src, /captureChanged/)
  assert.match(src, /replacing peer/)
  assert.match(src, /signalingState !== 'stable'/)
})

test('audio engine recovers failed peers and debounces devicechange', () => {
  const src = require('fs').readFileSync(require('path').join(__dirname, '../src/audio-engine.js'), 'utf8')
  assert.match(src, /schedulePeerRecovery/)
  assert.match(src, /reportAggregateStatus/)
  assert.match(src, /refreshCaptureAfterDeviceChange/)
  assert.match(src, /requestPeerRenegotiate/)
  assert.doesNotMatch(src, /reportStatus\(peers\.size \? 'reconnecting' : 'enabled'\)/)
})

test('signaling parser ignores non-json frames', () => {
  assert.equal(parseJson('{"type":"offer"}').type, 'offer')
  assert.equal(parseJson('not-json'), null)
  assert.equal(parseJson(Buffer.from('{"type":"ping"}')).type, 'ping')
})
