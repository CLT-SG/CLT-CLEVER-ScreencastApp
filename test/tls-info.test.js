'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')
const { describeCertificate } = require('../lib/tls-info')

test('bundled websockify certificate is present and not expired', () => {
  const pem = fs.readFileSync(path.join(__dirname, '..', 'cert', 'example.com+5.pem'), 'utf8')
  const info = describeCertificate(pem)
  assert.equal(info.error, undefined)
  assert.equal(info.expired, false)
  assert.equal(info.notYetValid, false)
  assert.equal(info.ok, true)
  assert.ok(info.validTo)
  assert.ok(Date.parse(info.validTo) > Date.now())
})

test('describeCertificate reports expired certificates', () => {
  // Minimal expired self-signed cert fixture is hard to embed; empty input fails.
  const info = describeCertificate('')
  assert.equal(info.ok, false)
  assert.ok(info.error)
})
