'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const net = require('net')
const { screenPathForPort, probeTcp, scanVncTargets } = require('../lib/vnc-scan')

test('websockify paths follow the VNC port offset', () => {
  assert.equal(screenPathForPort(5900), '/screen0')
  assert.equal(screenPathForPort('5901'), '/screen1')
  assert.equal(screenPathForPort(5910), '/screen10')
})

test('scan maps an open local VNC port to loopback, not the LAN address', async () => {
  const server = net.createServer()
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  try {
    const open = await probeTcp('127.0.0.1', port, 1000)
    assert.equal(open.ok, true)
    const closed = await probeTcp('127.0.0.1', port + 1, 500)
    assert.equal(closed.ok, false)
    const targets = await scanVncTargets({
      ports: [String(port)],
      hostname: 'CLT-27AIO',
      hostnameLocal: 'CLT-27AIO.local',
      ip: '192.168.1.77',
      wsPort: 8840
    })
    assert.equal(targets.length, 1)
    assert.equal(targets[0].target, '127.0.0.1:' + port)
    assert.equal(targets[0].path, screenPathForPort(port))
    assert.equal(targets[0].ip, '192.168.1.77')
    assert.equal(targets[0].hostnameLocal, 'CLT-27AIO.local')
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})
