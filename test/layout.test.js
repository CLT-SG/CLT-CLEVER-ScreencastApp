'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
const html = fs.readFileSync(path.join(root, 'src/index.html'), 'utf8')
const css = fs.readFileSync(path.join(root, 'src/assets/css/style.css'), 'utf8')
const renderer = fs.readFileSync(path.join(root, 'src/renderer.js'), 'utf8')

test('Screencast Status lives inside the Device panel', () => {
  const deviceStart = html.indexOf('id="device-panel"')
  const deviceEnd = html.indexOf('</section>', deviceStart)
  const deviceBlock = html.slice(deviceStart, deviceEnd)
  assert.match(deviceBlock, /Screencast Status/)
  assert.match(deviceBlock, /id="vnc-sharing-badge"/)
  assert.match(deviceBlock, /id="ws-port-label"/)
  assert.match(deviceBlock, /id="ws-path-label"/)
  assert.match(deviceBlock, /id="vnc-source-label"/)
  assert.match(deviceBlock, /id="vnc-sharing-label"/)
})

test('Screencast details and Audio panels remain separate and visible', () => {
  assert.match(html, /id="vnc-panel"/)
  assert.match(html, /Screencast details/)
  assert.match(html, /id="vnc-ports-info"/)
  assert.match(html, /id="audio-panel"/)
  assert.match(html, /id="audio-capture-label"/)
  assert.match(html, /id="audio-clients-label"/)
  // Status fields must not be duplicated outside Device
  const vncStart = html.indexOf('id="vnc-panel"')
  const vncEnd = html.indexOf('</section>', vncStart)
  const vncBlock = html.slice(vncStart, vncEnd)
  assert.doesNotMatch(vncBlock, /id="vnc-sharing-badge"/)
  assert.doesNotMatch(vncBlock, /id="ws-port-label"/)
})

test('dashboard grid prioritizes Screencast details and Audio height', () => {
  assert.match(css, /minmax\(140px,\s*1fr\)/)
  assert.match(css, /#device-panel/)
  assert.match(css, /\.panel-subheader/)
})

test('audio status distinguishes waiting for client from active capture', () => {
  assert.match(renderer, /Audio Enabled — Waiting for Client/)
  assert.match(renderer, /Idle \(waiting for remote audio client\)/)
  assert.match(renderer, /Capture Active/)
  assert.match(renderer, /audio-clients-label/)
  assert.match(renderer, /clientCount > 0/)
  assert.match(renderer, /Client Connected — Starting Capture/)
})
