const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

const {
  createAssetLoader,
  MEDIA_RELATIVE,
  FALLBACK_PNG,
  isAsarRoot,
  toUnpackedRoot
} = require('../lib/assets')

function silentLogger() {
  const lines = []
  const push = (level) => (...args) => {
    lines.push({ level, message: args.map(String).join(' ') })
  }
  return {
    lines,
    info: push('info'),
    warn: push('warn'),
    error: push('error'),
    debug: push('debug')
  }
}

function makeNativeImage() {
  const created = []
  return {
    created,
    createFromBuffer(buffer) {
      const image = {
        buffer,
        isEmpty: () => !buffer || buffer.length === 0
      }
      created.push(image)
      return image
    },
    createEmpty() {
      return { isEmpty: () => true }
    }
  }
}

function writeMedia(root, name, contents) {
  const dir = path.join(root, MEDIA_RELATIVE)
  fs.mkdirSync(dir, { recursive: true })
  const filePath = path.join(dir, name)
  fs.writeFileSync(filePath, contents)
  return filePath
}

test('development mode resolves src/assets/media without hardcoded install paths', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'screencast-dev-'))
  const logo = writeMedia(root, 'logo.png', 'dev-logo')
  const logger = silentLogger()
  const loader = createAssetLoader({
    appRoot: root,
    isPackaged: false,
    logger
  })
  const resolved = loader.resolveAsset('logo.png')
  assert.equal(resolved.exists, true)
  assert.equal(resolved.source, 'development')
  assert.equal(resolved.path, logo)
  assert.equal(resolved.path.includes('/opt/CLEVER_Screencast'), false)
  assert.equal(loader.readAsset('logo.png').buffer.toString(), 'dev-logo')
  assert.match(logger.lines.map((line) => line.message).join('\n'), /exists=true/)
})

test('packaged asar layout prefers unpacked files for native APIs', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'screencast-asar-'))
  const resources = path.join(tmp, 'resources')
  const asar = path.join(resources, 'app.asar')
  const unpacked = path.join(resources, 'app.asar.unpacked')
  writeMedia(asar, 'logo.png', 'inside-asar')
  const unpackedLogo = writeMedia(unpacked, 'logo.png', 'unpacked-logo')

  const loader = createAssetLoader({
    appRoot: asar,
    resourcesPath: resources,
    isPackaged: true,
    logger: silentLogger()
  })
  const candidates = loader.candidatesFor('logo.png')
  assert.equal(candidates[0].source, 'app.asar')
  assert.equal(candidates[0].path, path.join(asar, MEDIA_RELATIVE, 'logo.png'))
  assert.equal(candidates.some((candidate) => candidate.source === 'app.asar.unpacked'), true)
  assert.equal(
    candidates.find((candidate) => candidate.source === 'app.asar.unpacked').path,
    unpackedLogo
  )

  const nativeImage = makeNativeImage()
  const loaded = loader.loadNativeImage('logo.png')
  assert.equal(loaded.exists, true)
  assert.ok(loaded.buffer)
  assert.equal(loaded.usedFallback, false)
  loader.loadNativeImage('logo.png')
  const fromBuffer = createAssetLoader({
    appRoot: asar,
    resourcesPath: resources,
    isPackaged: true,
    nativeImage,
    logger: silentLogger()
  }).loadNativeImage('logo.png')
  assert.equal(fromBuffer.image.isEmpty(), false)
  assert.equal(fromBuffer.buffer.toString(), 'inside-asar')
})

test('extraResources media folder is used when asar files are missing', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'screencast-extra-'))
  const resources = path.join(tmp, 'resources')
  const asar = path.join(resources, 'app.asar')
  fs.mkdirSync(path.join(resources, 'media'), { recursive: true })
  const extra = path.join(resources, 'media', 'logo.png')
  fs.writeFileSync(extra, 'extra-logo')

  const loader = createAssetLoader({
    appRoot: asar,
    resourcesPath: resources,
    isPackaged: true,
    logger: silentLogger()
  })
  const resolved = loader.resolveAsset('logo.png')
  assert.equal(resolved.exists, true)
  assert.equal(resolved.source, 'extraResources')
  assert.equal(resolved.path, extra)
})

test('missing assets log the attempted path and use a generated fallback', () => {
  const logger = silentLogger()
  const nativeImage = makeNativeImage()
  const loader = createAssetLoader({
    appRoot: path.join(os.tmpdir(), 'screencast-missing-root'),
    resourcesPath: path.join(os.tmpdir(), 'screencast-missing-resources'),
    isPackaged: true,
    nativeImage,
    logger
  })
  const loaded = loader.loadNativeImage('logo.png', { fallback: 'publish.png' })
  assert.equal(loaded.usedFallback, true)
  assert.equal(loaded.source, 'generated-fallback')
  assert.equal(Buffer.isBuffer(loaded.buffer), true)
  assert.equal(loaded.image.isEmpty(), false)
  const messages = logger.lines.map((line) => line.message).join('\n')
  assert.match(messages, /Missing asset logo\.png/)
  assert.match(messages, /Using generated fallback/)
  assert.match(messages, /exists=false/)
})

test('loadNativeImage falls back to another packaged file before generating one', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'screencast-fallback-'))
  writeMedia(root, 'icon-512.png', 'icon-bytes')
  const nativeImage = makeNativeImage()
  const logger = silentLogger()
  const loader = createAssetLoader({
    appRoot: root,
    isPackaged: false,
    nativeImage,
    logger
  })
  const loaded = loader.loadNativeImage('logo.png', { fallback: ['icon-512.png'] })
  assert.equal(loaded.usedFallback, true)
  assert.equal(loaded.name, 'icon-512.png')
  assert.equal(loaded.buffer.toString(), 'icon-bytes')
  assert.match(logger.lines.map((line) => line.message).join('\n'), /fallback=true/)
})

test('readAsset does not throw when the file cannot be read', () => {
  const logger = silentLogger()
  const loader = createAssetLoader({
    appRoot: path.join('C:', 'Program Files', 'CLEVER_Screencast'),
    isPackaged: true,
    existsSync: () => true,
    readFileSync: () => {
      throw new Error('EACCES')
    },
    logger
  })
  const result = loader.readAsset('logo.png')
  assert.equal(result.buffer, null)
  assert.equal(result.exists, false)
  assert.match(logger.lines.map((line) => line.message).join('\n'), /Failed to read logo\.png/)
})

test('materializeAsset writes a real filesystem copy for native tray APIs', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'screencast-mat-src-'))
  writeMedia(root, 'logo.png', 'logo-bytes')
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'screencast-mat-dst-'))
  const loader = createAssetLoader({
    appRoot: root,
    isPackaged: false,
    userDataDir: userData,
    logger: silentLogger()
  })
  const materialized = loader.materializeAsset('logo.png')
  assert.equal(materialized.exists, true)
  assert.equal(materialized.source, 'materialized')
  assert.equal(fs.readFileSync(materialized.path, 'utf8'), 'logo-bytes')
  assert.equal(path.dirname(materialized.path), path.join(userData, 'assets'))
})

test('cross-platform candidates never use linux-only install prefixes or mixed separators as roots', () => {
  const appRoot = path.join('C:', 'Program Files', 'CLEVER_Screencast', 'resources', 'app.asar')
  const resourcesPath = path.join('C:', 'Program Files', 'CLEVER_Screencast', 'resources')
  const loader = createAssetLoader({
    appRoot,
    resourcesPath,
    isPackaged: true,
    logger: silentLogger()
  })
  const candidates = loader.candidatesFor('logo.png')
  assert.ok(candidates.length >= 3)
  for (const candidate of candidates) {
    assert.equal(candidate.path.includes('/opt/'), false)
    assert.equal(candidate.path.endsWith(`logo.png`), true)
    assert.equal(path.isAbsolute(candidate.path) || candidate.path.includes('Program Files'), true)
      const usesMediaTree = candidate.path.includes(path.join('src', 'assets', 'media'))
      || candidate.path.includes(`${path.sep}media${path.sep}`)
      || path.basename(path.dirname(candidate.path)) === 'resources'
    assert.equal(usesMediaTree, true)
  }
  const unpacked = candidates.find((candidate) => candidate.source === 'app.asar.unpacked')
  assert.ok(unpacked)
  assert.equal(unpacked.path.includes('app.asar.unpacked'), true)
  assert.equal(isAsarRoot(appRoot), true)
  assert.equal(toUnpackedRoot(appRoot).endsWith('app.asar.unpacked'), true)
})

test('existence check failures are logged and skipped instead of crashing', () => {
  const logger = silentLogger()
  const loader = createAssetLoader({
    appRoot: path.join(os.tmpdir(), 'screencast-exists-throw'),
    isPackaged: false,
    existsSync: () => {
      throw new Error('EPERM')
    },
    logger
  })
  const resolved = loader.resolveAsset('publish.png')
  assert.equal(resolved.exists, false)
  assert.equal(resolved.source, 'missing')
  assert.match(logger.lines.map((line) => line.message).join('\n'), /Existence check failed/)
})

test('linux packaged asar path is never required for nativeImage creation', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'screencast-linux-'))
  const asar = path.join(tmp, 'opt', 'CLEVER_Screencast', 'resources', 'app.asar')
  const resources = path.join(tmp, 'opt', 'CLEVER_Screencast', 'resources')
  const realLogo = fs.readFileSync(path.join(__dirname, '../src/assets/media/logo.png'))
  writeMedia(asar, 'logo.png', realLogo)
  const nativeImage = makeNativeImage()
  const loader = createAssetLoader({
    appRoot: asar,
    resourcesPath: resources,
    isPackaged: true,
    nativeImage,
    logger: silentLogger()
  })
  const loaded = loader.loadNativeImage('logo.png')
  assert.equal(loaded.source, 'app.asar')
  assert.equal(loaded.path, path.join(asar, MEDIA_RELATIVE, 'logo.png'))
  assert.equal(loaded.image.buffer.equals(realLogo), true)
  const materialized = loader.materializeAsset('logo.png')
  assert.equal(materialized.path.includes('app.asar'), false)
  assert.equal(fs.existsSync(materialized.path), true)
})

test('release media assets exist in the repository', () => {
  const mediaDir = path.join(__dirname, '../src/assets/media')
  for (const name of ['logo.png', 'publish.png', 'icon-512.png', 'status-icon.svg']) {
    assert.equal(fs.existsSync(path.join(mediaDir, name)), true, name)
  }
})

test('generated fallback png is a valid non-empty buffer', () => {
  assert.equal(FALLBACK_PNG.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), true)
})
