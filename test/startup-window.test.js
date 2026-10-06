const test = require('node:test')
const assert = require('node:assert/strict')
const { createStartupWindowPolicy } = require('../lib/startup-window')

function createPolicy(overrides = {}) {
  const events = []
  const policy = createStartupWindowPolicy({
    autoHideEnabled: true,
    onHide: () => events.push('hide'),
    onKeepVisible: () => events.push('keep'),
    logInfo: (msg) => events.push(msg),
    ...overrides
  })
  return { policy, events }
}

function markAllReady(policy, { focused = false } = {}) {
  policy.setFocused(focused)
  policy.markTrayReady()
  policy.markUiReady()
  policy.markServicesReady()
}

test('hides to tray after startup when the window is not focused', () => {
  const { policy, events } = createPolicy()
  markAllReady(policy, { focused: false })
  assert.equal(policy.getState().hiddenToTray, true)
  assert.equal(policy.getState().decided, true)
  assert.ok(events.includes('hide'))
  assert.ok(events.some((e) => String(e).includes('Startup focus state: not focused')))
  assert.ok(events.some((e) => String(e).includes('ScreencastApp running in background')))
})

test('keeps the window visible when focused at startup completion', () => {
  const { policy, events } = createPolicy()
  markAllReady(policy, { focused: true })
  assert.equal(policy.getState().hiddenToTray, false)
  assert.equal(policy.getState().waitingForBlur, true)
  assert.ok(events.includes('keep'))
  assert.equal(events.includes('hide'), false)
})

test('hides on blur after startup when the window was kept visible', () => {
  const { policy, events } = createPolicy()
  markAllReady(policy, { focused: true })
  assert.equal(events.includes('hide'), false)
  policy.setFocused(false)
  assert.equal(policy.getState().hiddenToTray, true)
  assert.ok(events.includes('hide'))
})

test('does not hide until tray, UI, and services are all ready', () => {
  const { policy, events } = createPolicy()
  policy.setFocused(false)
  policy.markTrayReady()
  policy.markUiReady()
  assert.equal(policy.getState().startupComplete, false)
  assert.equal(events.includes('hide'), false)
  policy.markServicesReady()
  assert.equal(policy.getState().startupComplete, true)
  assert.ok(events.includes('hide'))
})

test('focus after partial ready keeps window until blur once fully ready', () => {
  const { policy, events } = createPolicy()
  policy.markTrayReady()
  policy.markUiReady()
  policy.setFocused(true)
  policy.markServicesReady()
  assert.equal(events.includes('hide'), false)
  assert.equal(policy.getState().waitingForBlur, true)
  policy.setFocused(false)
  assert.ok(events.includes('hide'))
})

test('auto-hide can be disabled', () => {
  const { policy, events } = createPolicy({ autoHideEnabled: false })
  markAllReady(policy, { focused: false })
  assert.equal(policy.getState().hiddenToTray, false)
  assert.equal(events.includes('hide'), false)
})

test('hides only once even if blur fires again', () => {
  const { policy, events } = createPolicy()
  markAllReady(policy, { focused: false })
  const hideCount = events.filter((e) => e === 'hide').length
  policy.setFocused(true)
  policy.setFocused(false)
  assert.equal(events.filter((e) => e === 'hide').length, hideCount)
})

test('cancelAutoHide prevents later automatic hide', () => {
  const { policy, events } = createPolicy()
  policy.markTrayReady()
  policy.markUiReady()
  policy.setFocused(true)
  policy.markServicesReady()
  policy.cancelAutoHide('user opened settings')
  policy.setFocused(false)
  assert.equal(events.includes('hide'), false)
  assert.equal(policy.getState().decided, true)
})
