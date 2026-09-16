const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')
const pkg = require('../package.json')

test('package version is semantic', () => {
  assert.match(pkg.version, /^\d+\.\d+\.\d+(-[a-z]+\.\d+)?$/)
})

test('electron-builder publishes GitHub update metadata for supported OS targets', () => {
  assert.equal(pkg.build.publish.provider, 'github')
  assert.equal(pkg.build.publish.owner, 'CLT-SG')
  assert.equal(pkg.build.publish.repo, 'CLT-CLEVER-ScreencastApp')
  assert.equal(pkg.build.win.target, 'nsis')
  assert.deepEqual(pkg.build.mac.target, ['dmg', 'zip'])
  assert.deepEqual(pkg.build.linux.target, ['AppImage', 'deb'])
  assert.equal(pkg.dependencies['electron-updater'] != null, true)
})

test('electron-builder unpacks media assets for native tray APIs', () => {
  assert.equal(pkg.build.asar, true)
  assert.ok(Array.isArray(pkg.build.asarUnpack))
  assert.equal(pkg.build.asarUnpack.some((pattern) => pattern.includes('src/assets/media')), true)
  assert.notEqual(pkg.build.directories.buildResources, 'src/assets/media')
  assert.equal(pkg.build.files.includes('src/assets/media/**/*'), true)
  assert.equal(pkg.build.win.icon, 'src/assets/media/icon-512.png')
  assert.equal(pkg.build.linux.icon, 'src/assets/media/icon-512.png')
  assert.equal(pkg.build.mac.icon, 'src/assets/media/icon-512.png')
})

test('main process uses centralized asset loading instead of development-only paths', () => {
  const index = fs.readFileSync(path.join(__dirname, '../index.js'), 'utf8')
  assert.equal(index.includes("path.join(__dirname, '/src/assets/media/logo.png')"), false)
  assert.equal(index.includes("path.join(__dirname, '/src/assets/media/publish.png')"), false)
  assert.match(index, /createAssetLoader/)
  assert.match(index, /unhandledRejection/)
  assert.match(index, /createSafeTray/)
  assert.match(index, /loadNativeImage/)
})

test('release and ci workflows exist with a Windows/Linux/macOS matrix', () => {
  const release = fs.readFileSync(path.join(__dirname, '../.github/workflows/release.yml'), 'utf8')
  const ci = fs.readFileSync(path.join(__dirname, '../.github/workflows/ci.yml'), 'utf8')
  assert.match(release, /tags:\s*\n\s*- 'v\*'/ )
  assert.match(release, /electron-builder/)
  assert.match(release, /GH_TOKEN/)
  assert.match(release, /windows-latest/)
  assert.match(release, /ubuntu-latest/)
  assert.match(release, /macos-latest/)
  assert.match(ci, /npm test/)
})
