const assert = require('assert')
const {
  UPDATE_STATES,
  normalizeVersion,
  createUpdateStatus,
  canInstallNow,
  shouldDeferInstall
} = require('../update/updateStatus')

function test(name, fn) {
  fn()
  console.log('ok - ' + name)
}

test('formats the required updater UI states', () => {
  assert.strictEqual(createUpdateStatus('checking').message, 'Checking for updates...')
  assert.strictEqual(createUpdateStatus('latest').message, 'You are using the latest version.')
  assert.strictEqual(createUpdateStatus('available', { version: '1.2.0' }).message, 'Update available: v1.2.0')
  assert.strictEqual(createUpdateStatus('downloading').message, 'Downloading update...')
  assert.strictEqual(createUpdateStatus('downloaded').message, 'Update downloaded. Restart to install.')
  assert.strictEqual(normalizeVersion('v2.2.0'), 'v2.2.0')
})

test('does not restart while a Screencast/VNC session is active', () => {
  assert.strictEqual(canInstallNow(true), false)
  assert.strictEqual(canInstallNow(false), true)
  assert.strictEqual(shouldDeferInstall(true, 'install'), true)
  assert.strictEqual(shouldDeferInstall(false, 'install'), false)
  const deferred = createUpdateStatus(UPDATE_STATES.deferredInstall)
  assert.strictEqual(deferred.canInstall, false)
  assert.strictEqual(deferred.interruptSession, false)
  assert.ok(deferred.message.indexOf('session') !== -1)
})

test('exposes download and install actions for the dashboard', () => {
  const available = createUpdateStatus('available', { version: '2.2.0' })
  assert.strictEqual(available.canDownload, true)
  assert.strictEqual(available.canInstall, false)
  const downloaded = createUpdateStatus('downloaded')
  assert.strictEqual(downloaded.canDownload, false)
  assert.strictEqual(downloaded.canInstall, true)
})
