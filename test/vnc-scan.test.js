'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const net = require('net')
const {
  screenPathForPort,
  probeTcp,
  chooseVncProxyHost,
  scanVncTargets,
  isLoopbackDisabledReason
} = require('../lib/vnc-scan')

test('websockify paths follow the VNC port offset', () => {
  assert.equal(screenPathForPort(5900), '/screen0')
  assert.equal(screenPathForPort('5901'), '/screen1')
  assert.equal(screenPathForPort(5910), '/screen10')
})

test('detects UltraVNC loopback-disabled RFB reason text', () => {
  assert.equal(
    isLoopbackDisabledReason(Buffer.from('Sorry, loopback connections are not enabled')),
    true
  )
  assert.equal(isLoopbackDisabledReason(Buffer.from('RFB 003.008\n')), false)
})

test('prefers LAN IP so UltraVNC does not see a forbidden loopback peer', async () => {
  const choice = await chooseVncProxyHost({
    port: 5900,
    ip: '192.168.1.75',
    probeFn: async (host) => ({ ok: host === '127.0.0.1' || host === '192.168.1.75', error: null })
  })
  assert.equal(choice.ok, true)
  assert.equal(choice.host, '192.168.1.75')
  assert.equal(choice.alternateHost, '127.0.0.1')
})

test('still prefers LAN when LAN probe fails but loopback is up', async () => {
  const choice = await chooseVncProxyHost({
    port: 5900,
    ip: '192.168.1.75',
    probeFn: async (host) => ({
      ok: host === '127.0.0.1',
      error: host === '192.168.1.75' ? 'connect ECONNREFUSED' : null
    })
  })
  assert.equal(choice.ok, true)
  assert.equal(choice.host, '192.168.1.75')
  assert.equal(choice.alternateHost, '127.0.0.1')
})

test('scan maps an open local VNC port and prefers the LAN address', async () => {
  const server = net.createServer()
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  try {
    const open = await probeTcp('127.0.0.1', port, 1000)
    assert.equal(open.ok, true)
    const targets = await scanVncTargets({
      ports: [String(port)],
      hostname: 'CLT-27AIO',
      hostnameLocal: 'CLT-27AIO.local',
      ip: '192.168.1.77',
      wsPort: 8840,
      // Force LAN preference without binding a real second interface.
      probeFn: async (host) => ({ ok: host === '127.0.0.1' || host === '192.168.1.77', error: null })
    })
    assert.equal(targets.length, 1)
    assert.equal(targets[0].target, '192.168.1.77:' + port)
    assert.equal(targets[0].alternateTarget, '127.0.0.1:' + port)
    assert.equal(targets[0].path, screenPathForPort(port))
    assert.equal(targets[0].ip, '192.168.1.77')
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})
