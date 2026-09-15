const test = require('node:test')
const assert = require('node:assert/strict')
const {
  connectionStatusView,
  updaterStatusView,
  overallStatusView,
  formatTimestamp,
  monitorRows,
  vncView
} = require('../lib/dashboard-state')

test('connectionStatusView maps existing connection snapshots', () => {
  const view = connectionStatusView({
    state: 'connected',
    source: 'discovered',
    deviceId: 'abc-123',
    baseUrl: 'http://clever.local:8000',
    registered: true,
    lastHeartbeatAt: new Date().toISOString(),
    vnc: { port: 5900, wsPort: 8840, wsPath: '/screen0', sharing: true }
  })
  assert.equal(view.label, 'Connected')
  assert.equal(view.tone, 'success')
  assert.equal(view.source, 'Automatically discovered')
  assert.equal(view.deviceId, 'abc-123')
  assert.equal(view.registered, true)
  assert.equal(view.vnc.wsPath, '/screen0')
})

test('connectionStatusView treats missing snapshots as disconnected', () => {
  const view = connectionStatusView(null)
  assert.equal(view.label, 'Disconnected')
  assert.equal(view.tone, 'danger')
  assert.equal(view.lastHeartbeatLabel, 'Never')
})

test('reconnecting and searching use the warning tone', () => {
  assert.equal(connectionStatusView({ state: 'reconnecting' }).tone, 'warning')
  assert.equal(connectionStatusView({ state: 'searching' }).label, 'Searching')
})

test('updaterStatusView covers check, idle, ready, and failure states', () => {
  assert.equal(updaterStatusView({ state: 'checking' }).message, 'Checking for updates...')
  assert.equal(updaterStatusView({ state: 'unavailable' }).message, 'You are using the latest version.')
  assert.equal(updaterStatusView({ state: 'available' }).canDownload, true)
  assert.equal(updaterStatusView({ state: 'ready' }).canInstall, true)
  assert.equal(updaterStatusView({ state: 'error', error: 'offline' }).tone, 'danger')
  assert.equal(updaterStatusView({ state: 'downloading', progress: 42 }).progress, 42)
})

test('overallStatusView keeps connection health as the primary header state', () => {
  const view = overallStatusView({
    sharing: true,
    connection: { state: 'connected', source: 'manual' },
    updater: { state: 'ready' }
  })
  assert.equal(view.label, 'Connected')
  assert.equal(view.tone, 'success')
  assert.equal(view.sharingLabel, 'Sharing')
  assert.equal(view.updater.canInstall, true)
})

test('monitorRows flatten existing monitor records for the dashboard table', () => {
  const rows = monitorRows([
    { id: 1, name: 'Primary Monitor', x: 0, y: 0, width: 1920, height: 1080, primary: true, online: true },
    { id: 2, x: 1920, y: 0, width: 1280, height: 1024 }
  ])
  assert.equal(rows.length, 2)
  assert.equal(rows[0].primary, true)
  assert.equal(rows[0].resolution, '1920x1080')
  assert.equal(rows[1].name, 'Monitor 2')
  assert.equal(rows[1].online, true)
})

test('formatTimestamp stays stable for empty and recent values', () => {
  assert.equal(formatTimestamp(null), 'Never')
  assert.equal(formatTimestamp('not-a-date'), 'Never')
  const now = Date.parse('2026-09-15T10:00:00.000Z')
  assert.equal(formatTimestamp('2026-09-15T09:59:58.000Z', now), 'Just now')
  assert.equal(formatTimestamp('2026-09-15T09:58:00.000Z', now), '2m ago')
})

test('vncView reuses registered VNC data instead of inventing new ports', () => {
  const view = vncView({
    vnc: { port: 5901, wsPort: 8840, wsPath: '/screen1', sharing: false }
  }, [{ path: '/screen1', port: 5901, hostname: 'CLT-PC', hostnameLocal: 'CLT-PC.local', target: '10.0.0.8:5901' }])
  assert.equal(view.port, 5901)
  assert.equal(view.wsPath, '/screen1')
  assert.equal(view.connections.length, 1)
})
