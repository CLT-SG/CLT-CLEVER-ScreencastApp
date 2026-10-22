'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const {
  isViewOnlyRequest,
  filterClientPayload
} = require('../lib/rfb-view-only')

test('detects view_only query flag', () => {
  assert.equal(isViewOnlyRequest({ url: '/screen0?view_only=1' }), true)
  assert.equal(isViewOnlyRequest({ url: '/screen0?session_mode=view-only' }), true)
  assert.equal(isViewOnlyRequest({ url: '/screen0' }), false)
  assert.equal(isViewOnlyRequest({ url: '/screen0?view_only=0' }), false)
})

test('filters interactive RFB client messages', () => {
  assert.equal(filterClientPayload(Buffer.from([4, 0, 0]), true), null)
  assert.equal(filterClientPayload(Buffer.from([5, 0, 0]), true), null)
  assert.equal(filterClientPayload(Buffer.from([6, 0, 0]), true), null)
  const keep = filterClientPayload(Buffer.from([3, 0, 0]), true)
  assert.ok(Buffer.isBuffer(keep))
  assert.equal(keep[0], 3)
  const pass = filterClientPayload(Buffer.from([5, 0, 0]), false)
  assert.equal(pass[0], 5)
})

test('electron version remains 22.3.25', () => {
  const pkg = require('../package.json')
  assert.match(String(pkg.devDependencies.electron), /22\.3\.25/)
})
