const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

const { getOrCreateDeviceId } = require('../lib/device-id')
const { detectMonitors, monitorsChanged, summarizeMonitors, describeMonitorChange } = require('../lib/monitors')
const { getCapabilities } = require('../lib/capabilities')
const { normalizeConfig, isManualConfigured, serviceBaseUrl, saveServerConfig, loadServerConfig } = require('../lib/server-config')
const { parseAnnouncement, buildAnnounce, isProbe, buildProbe } = require('../lib/discovery')
const { buildRegistrationPayload } = require('../lib/registration')

test('device id stays stable across reads', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'screencast-id-'))
  const first = getOrCreateDeviceId(dir)
  const second = getOrCreateDeviceId(dir)
  assert.equal(first, second)
  assert.match(first, /[a-f0-9-]{8,}/i)
})

test('detectMonitors maps electron displays', () => {
  const screenApi = {
    getAllDisplays() {
      return [
        { id: 1, label: 'Primary Monitor', bounds: { x: 0, y: 0, width: 1920, height: 1080 } },
        { id: 2, bounds: { x: 1920, y: 0, width: 1920, height: 1080 } }
      ]
    },
    getPrimaryDisplay() {
      return { id: 1 }
    }
  }
  const monitors = detectMonitors(screenApi)
  assert.equal(monitors.length, 2)
  assert.equal(monitors[0].primary, true)
  assert.equal(monitors[1].x, 1920)
  assert.equal(monitors[1].name, 'Monitor 2')
  assert.equal(monitors[0].resolution, '1920x1080')
  assert.equal(monitorsChanged(monitors, monitors), false)
  assert.equal(monitorsChanged(monitors, [monitors[0]]), true)
  assert.match(summarizeMonitors(monitors), /Primary: Yes/)
  assert.match(describeMonitorChange([monitors[0]], monitors), /added/)
})

test('capabilities only include supported features', () => {
  const caps = getCapabilities({ audio: false, monitorCount: 2 })
  assert.equal(caps.multiMonitor, true)
  assert.equal(caps.monitorSelection, true)
  assert.equal(caps.screenCrop, true)
  assert.equal(caps.vnc.viewOnly, true)
  assert.equal(caps.vnc.reconnect, true)
  assert.equal(caps.vnc.audio, false)
  assert.equal(caps.display.individualMonitorCapture, true)
  assert.equal(Object.prototype.hasOwnProperty.call(caps.vnc, 'encodings'), false)
})

test('manual config takes priority and persists', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'screencast-cfg-'))
  const saved = saveServerConfig(dir, { mode: 'manual', host: 'clever.local', port: '8000', protocol: 'http' })
  assert.equal(isManualConfigured(saved), true)
  assert.equal(serviceBaseUrl(saved), 'http://clever.local:8000')
  const loaded = loadServerConfig(dir)
  assert.equal(loaded.host, 'clever.local')
  assert.equal(loaded.mode, 'manual')
  assert.equal(isManualConfigured(normalizeConfig({ mode: 'auto', host: 'x' })), false)
})

test('discovery announcement parsing ignores other UDP traffic', () => {
  const parsed = parseAnnouncement(Buffer.from(JSON.stringify(buildAnnounce({
    hostname: 'clever-host',
    ip: '10.0.0.5',
    port: 8000,
    protocol: 'http'
  }))), { address: '10.0.0.5' })
  assert.equal(parsed.host, '10.0.0.5')
  assert.equal(parsed.port, 8000)
  assert.equal(parseAnnouncement(Buffer.from('not-json')), null)
  assert.equal(parseAnnouncement(Buffer.from(JSON.stringify({ type: 'kvm' }))), null)
  assert.equal(isProbe(buildProbe()), true)
})

test('registration payload includes monitors and capabilities', () => {
  const payload = buildRegistrationPayload({
    deviceId: 'abc',
    hostname: 'CLT-PC-01',
    hostnameLocal: 'CLT-PC-01.local',
    ip: '192.168.1.100',
    appVersion: '2.1.0',
    os: 'win32',
    monitors: [{ id: '1', x: 0, y: 0, width: 1920, height: 1080, primary: true, online: true }],
    capabilities: { multiMonitor: false }
  })
  assert.equal(payload.deviceId, 'abc')
  assert.equal(payload.hostname, 'CLT-PC-01')
  assert.equal(payload.hostnameLocal, 'CLT-PC-01.local')
  assert.equal(payload.vncPort, 5900)
  assert.equal(payload.wsPort, 8840)
})
