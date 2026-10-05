'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const http = require('http')
const { createStatusHandler } = require('../lib/http-status')

test('status handler reports bind address and screen paths', async () => {
  const handler = createStatusHandler({
    getState: () => ({
      bindAddress: '0.0.0.0',
      port: 8840,
      hostname: 'CLT-27AIO',
      hostnameLocal: 'CLT-27AIO.local',
      ip: '192.168.1.75',
      screens: [{ path: '/screen0', target: '127.0.0.1:5900' }]
    })
  })
  const server = http.createServer(handler)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  try {
    const response = await fetch('http://127.0.0.1:' + port + '/status')
    assert.equal(response.status, 200)
    const body = await response.json()
    assert.equal(body.bindAddress, '0.0.0.0')
    assert.equal(body.port, 8840)
    assert.deepEqual(body.screens, ['/screen0'])
    const missing = await fetch('http://127.0.0.1:' + port + '/missing')
    assert.equal(missing.status, 404)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})
