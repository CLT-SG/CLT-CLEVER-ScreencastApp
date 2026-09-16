const fs = require('fs')
const os = require('os')
const path = require('path')

const MEDIA_RELATIVE = path.join('src', 'assets', 'media')

// 1x1 transparent PNG used when no branding asset can be loaded.
const FALLBACK_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
)

function defaultLogger() {
  return {
    info() {},
    warn() {},
    error() {},
    debug() {}
  }
}

function isAsarRoot(appRoot) {
  if (typeof appRoot !== 'string' || appRoot.length === 0) {
    return false
  }
  return /(^|[\\/])app\.asar$/.test(appRoot) || appRoot.includes(`${path.sep}app.asar${path.sep}`) || appRoot.includes('/app.asar/')
}

function toUnpackedRoot(appRoot) {
  if (typeof appRoot !== 'string' || appRoot.includes('app.asar.unpacked')) {
    return null
  }
  if (/(^|[\\/])app\.asar$/.test(appRoot)) {
    return appRoot.replace(/app\.asar$/, 'app.asar.unpacked')
  }
  if (appRoot.includes(`${path.sep}app.asar${path.sep}`)) {
    return appRoot.replace(`${path.sep}app.asar${path.sep}`, `${path.sep}app.asar.unpacked${path.sep}`)
  }
  if (appRoot.includes('/app.asar/')) {
    return appRoot.replace('/app.asar/', '/app.asar.unpacked/')
  }
  return null
}

function uniqueCandidates(candidates) {
  const seen = new Set()
  return candidates.filter((candidate) => {
    if (!candidate || !candidate.path) {
      return false
    }
    const key = candidate.path
    if (seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  })
}

/**
 * Centralized asset resolution for development, app.asar, asar.unpacked,
 * and extraResources layouts. Paths are built with Node's path module so
 * Windows, Linux, and macOS all work from the same code.
 */
function createAssetLoader(options = {}) {
  const logger = options.logger || defaultLogger()
  const appRoot = options.appRoot || path.join(__dirname, '..')
  const resourcesPath = options.resourcesPath || process.resourcesPath || ''
  const isPackaged = typeof options.isPackaged === 'function'
    ? !!options.isPackaged()
    : !!options.isPackaged
  const nativeImage = options.nativeImage || null
  const existsSync = options.existsSync || ((filePath) => fs.existsSync(filePath))
  const readFileSync = options.readFileSync || ((filePath) => fs.readFileSync(filePath))
  const mkdirSync = options.mkdirSync || ((dir, opts) => fs.mkdirSync(dir, opts))
  const writeFileSync = options.writeFileSync || ((filePath, data) => fs.writeFileSync(filePath, data))
  const userDataDir = options.userDataDir || null

  function environment() {
    return {
      packaged: isPackaged,
      platform: process.platform,
      appRoot,
      resourcesPath: resourcesPath || null,
      asar: isAsarRoot(appRoot)
    }
  }

  function candidatesFor(assetName) {
    const name = path.basename(String(assetName || '').replace(/\\/g, '/'))
    const list = []

    list.push({
      source: isPackaged && isAsarRoot(appRoot) ? 'app.asar' : (isPackaged ? 'packaged-app' : 'development'),
      path: path.join(appRoot, MEDIA_RELATIVE, name)
    })

    const unpackedRoot = toUnpackedRoot(appRoot)
    if (unpackedRoot) {
      list.push({
        source: 'app.asar.unpacked',
        path: path.join(unpackedRoot, MEDIA_RELATIVE, name)
      })
    } else if (resourcesPath) {
      list.push({
        source: 'app.asar.unpacked',
        path: path.join(resourcesPath, 'app.asar.unpacked', MEDIA_RELATIVE, name)
      })
    }

    if (resourcesPath) {
      list.push({
        source: 'extraResources',
        path: path.join(resourcesPath, 'media', name)
      })
      list.push({
        source: 'extraResources-root',
        path: path.join(resourcesPath, name)
      })
    }

    return uniqueCandidates(list)
  }

  function resolveAsset(assetName) {
    const env = environment()
    const candidates = candidatesFor(assetName)
    logger.info(`[assets] Resolving ${assetName} (packaged=${env.packaged} platform=${env.platform} asar=${env.asar})`)

    for (const candidate of candidates) {
      let exists = false
      try {
        exists = !!existsSync(candidate.path)
      } catch (err) {
        logger.warn(`[assets] Existence check failed for ${candidate.path}: ${err.message}`)
      }
      logger.info(`[assets] candidate source=${candidate.source} path=${candidate.path} exists=${exists}`)
      if (exists) {
        return Object.assign({ name: assetName, exists: true }, candidate)
      }
    }

    const tried = candidates.map((candidate) => candidate.path).join(' | ')
    logger.warn(`[assets] Missing asset ${assetName}. Tried: ${tried || '(no candidates)'}`)
    return {
      name: assetName,
      path: candidates[0] ? candidates[0].path : null,
      exists: false,
      source: 'missing'
    }
  }

  function readAsset(assetName) {
    const resolved = resolveAsset(assetName)
    if (!resolved.exists || !resolved.path) {
      return Object.assign({}, resolved, { buffer: null })
    }
    try {
      const buffer = readFileSync(resolved.path)
      logger.info(`[assets] Loaded ${assetName} from ${resolved.source} (${buffer.length} bytes)`)
      return Object.assign({}, resolved, { buffer })
    } catch (err) {
      logger.error(`[assets] Failed to read ${assetName} at ${resolved.path}: ${err.message}`)
      return Object.assign({}, resolved, { exists: false, buffer: null, error: err })
    }
  }

  function nativeImageFromBuffer(buffer, label) {
    if (!nativeImage || !buffer) {
      return null
    }
    try {
      const image = nativeImage.createFromBuffer(buffer)
      if (image && typeof image.isEmpty === 'function' && image.isEmpty()) {
        logger.warn(`[assets] nativeImage is empty for ${label}`)
        return null
      }
      return image
    } catch (err) {
      logger.error(`[assets] nativeImage.createFromBuffer failed for ${label}: ${err.message}`)
      return null
    }
  }

  function loadNativeImage(assetName, optionsForLoad) {
    const fallback = (optionsForLoad && optionsForLoad.fallback) || []
    const names = [assetName].concat(Array.isArray(fallback) ? fallback : [fallback]).filter(Boolean)

    for (const name of names) {
      const loaded = readAsset(name)
      if (!loaded.buffer) {
        continue
      }
      const image = nativeImageFromBuffer(loaded.buffer, name)
      if (nativeImage && !image) {
        continue
      }
      logger.info(`[assets] nativeImage ready for ${assetName} using ${name} source=${loaded.source} fallback=${name !== assetName}`)
      return Object.assign({}, loaded, {
        image,
        usedFallback: name !== assetName
      })
    }

    logger.warn(`[assets] Using generated fallback image for ${assetName}`)
    let image = nativeImageFromBuffer(FALLBACK_PNG, 'generated-fallback')
    if (!image && nativeImage && typeof nativeImage.createEmpty === 'function') {
      try {
        image = nativeImage.createEmpty()
      } catch (err) {
        logger.error(`[assets] nativeImage.createEmpty failed: ${err.message}`)
      }
    }
    return {
      name: assetName,
      path: null,
      exists: false,
      source: 'generated-fallback',
      buffer: FALLBACK_PNG,
      image,
      usedFallback: true
    }
  }

  /**
   * Copy an asset to a real filesystem path. Linux tray APIs cannot open
   * files that only exist inside app.asar; NativeImage buffers are preferred,
   * and this materialized file is the fallback.
   */
  function materializeAsset(assetName, optionsForLoad) {
    const fallback = optionsForLoad && optionsForLoad.fallback
    const loaded = readAsset(assetName)
    let buffer = loaded.buffer
    let usedFallback = false
    let source = loaded.source
    if (!buffer && fallback) {
      const fallbackLoaded = readAsset(fallback)
      buffer = fallbackLoaded.buffer
      usedFallback = !!buffer
      source = fallbackLoaded.source
    }
    if (!buffer) {
      buffer = FALLBACK_PNG
      usedFallback = true
      source = 'generated-fallback'
    }

    const destDir = userDataDir
      ? path.join(userDataDir, 'assets')
      : path.join(os.tmpdir(), 'clever-screencast-assets')
    const dest = path.join(destDir, path.basename(String(assetName).replace(/\\/g, '/')))
    try {
      mkdirSync(destDir, { recursive: true })
      writeFileSync(dest, buffer)
      logger.info(`[assets] Materialized ${assetName} -> ${dest} fallback=${usedFallback}`)
      return {
        name: assetName,
        path: dest,
        exists: true,
        source: 'materialized',
        origin: source,
        usedFallback,
        buffer
      }
    } catch (err) {
      logger.error(`[assets] Failed to materialize ${assetName}: ${err.message}`)
      return {
        name: assetName,
        path: loaded.path,
        exists: !!loaded.buffer,
        source: loaded.source,
        usedFallback,
        buffer,
        error: err
      }
    }
  }

  return {
    MEDIA_RELATIVE,
    environment,
    candidatesFor,
    resolveAsset,
    readAsset,
    loadNativeImage,
    materializeAsset
  }
}

module.exports = {
  createAssetLoader,
  MEDIA_RELATIVE,
  FALLBACK_PNG,
  isAsarRoot,
  toUnpackedRoot
}
