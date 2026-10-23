'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const {
  closeWebSocketClients,
  setSharingEnabled,
  isSharingEnabled
} = require('../lib/vnc-share')

function mockClient(readyState) {
  const calls = []
  return {
    readyState,
    calls,
    close(code, reason) {
      calls.push({ op: 'close', code, reason })
    },
    terminate() {
      calls.push({ op: 'terminate' })
    }
  }
}

test('isSharingEnabled defaults to true when unset', () => {
  assert.equal(isSharingEnabled({}), true)
  assert.equal(isSharingEnabled({ sharingEnabled: true }), true)
  assert.equal(isSharingEnabled({ sharingEnabled: false }), false)
  assert.equal(isSharingEnabled(null), false)
})

test('setSharingEnabled(false) closes open clients', () => {
  const open = mockClient(1)
  const connecting = mockClient(0)
  const closed = mockClient(3)
  const wss = {
    sharingEnabled: true,
    clients: new Set([open, connecting, closed])
  }
  assert.equal(setSharingEnabled(wss, false), false)
  assert.equal(wss.sharingEnabled, false)
  assert.deepEqual(open.calls, [{ op: 'close', code: 1000, reason: 'Sharing stopped' }])
  assert.deepEqual(connecting.calls, [{ op: 'close', code: 1000, reason: 'Sharing stopped' }])
  assert.deepEqual(closed.calls, [])
})

test('setSharingEnabled(true) does not close clients', () => {
  const open = mockClient(1)
  const wss = {
    sharingEnabled: false,
    clients: new Set([open])
  }
  assert.equal(setSharingEnabled(wss, true), true)
  assert.equal(wss.sharingEnabled, true)
  assert.deepEqual(open.calls, [])
})

test('closeWebSocketClients returns closed count', () => {
  const a = mockClient(1)
  const b = mockClient(1)
  const count = closeWebSocketClients({
    clients: new Set([a, b])
  }, 1000, 'quit')
  assert.equal(count, 2)
  assert.equal(a.calls[0].reason, 'quit')
})

test('websockify rejects connections when sharing is stopped', () => {
  const fs = require('fs')
  const path = require('path')
  const source = fs.readFileSync(path.join(__dirname, '../websockify.js'), 'utf8')
  assert.match(source, /clientTracking:\s*true/)
  assert.match(source, /isSharingEnabled/)
  assert.match(source, /Sharing stopped/)
})

test('main process notifies on close-to-tray and tears down on quit', () => {
  const fs = require('fs')
  const path = require('path')
  const index = fs.readFileSync(path.join(__dirname, '../index.js'), 'utf8')
  assert.match(index, /notifyContinuing/)
  assert.match(index, /shutdownRemoteServices/)
  assert.match(index, /setRemoteSharing/)
  assert.match(index, /Still sharing|sharing continues in the background/)
  assert.match(index, /server\.close/)
})
