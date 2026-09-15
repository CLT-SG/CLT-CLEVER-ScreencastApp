const fs = require('fs')
const path = require('path')

const FILE_NAME = 'clever-service.json'
const DEFAULT_PORT = 8000
const DEFAULT_PROTOCOL = 'http'

function configPath(userDataDir) {
  return path.join(userDataDir, FILE_NAME)
}

function emptyConfig() {
  return {
    mode: 'auto',
    host: '',
    port: DEFAULT_PORT,
    protocol: DEFAULT_PROTOCOL,
    lastDiscovered: null
  }
}

function normalizeConfig(raw) {
  const base = emptyConfig()
  if (!raw || typeof raw !== 'object') {
    return base
  }
  const mode = raw.mode === 'manual' ? 'manual' : 'auto'
  const port = parseInt(raw.port, 10)
  const protocol = raw.protocol === 'https' ? 'https' : 'http'
  return {
    mode,
    host: typeof raw.host === 'string' ? raw.host.trim() : '',
    port: Number.isFinite(port) && port > 0 ? port : DEFAULT_PORT,
    protocol,
    lastDiscovered: raw.lastDiscovered && typeof raw.lastDiscovered === 'object'
      ? {
          host: String(raw.lastDiscovered.host || ''),
          port: parseInt(raw.lastDiscovered.port, 10) || DEFAULT_PORT,
          protocol: raw.lastDiscovered.protocol === 'https' ? 'https' : 'http'
        }
      : null
  }
}

function loadServerConfig(userDataDir, logger) {
  const filePath = configPath(userDataDir)
  try {
    if (fs.existsSync(filePath)) {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'))
      const config = normalizeConfig(parsed)
      if (logger) logger.info(`Loaded CLEVER-Service config (${config.mode})`)
      return config
    }
  } catch (err) {
    if (logger) logger.warn(`Could not read server config: ${err.message}`)
  }
  return emptyConfig()
}

function saveServerConfig(userDataDir, config, logger) {
  const normalized = normalizeConfig(config)
  const filePath = configPath(userDataDir)
  fs.mkdirSync(userDataDir, { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(normalized, null, 2), 'utf8')
  if (logger) {
    logger.info(`Saved CLEVER-Service config mode=${normalized.mode}` +
      (normalized.host ? ` host=${normalized.host}:${normalized.port}` : ''))
  }
  return normalized
}

function isManualConfigured(config) {
  const normalized = normalizeConfig(config)
  return normalized.mode === 'manual' && !!normalized.host
}

function serviceBaseUrl(target) {
  if (!target || !target.host) {
    return null
  }
  const protocol = target.protocol === 'https' ? 'https' : 'http'
  const port = parseInt(target.port, 10) || DEFAULT_PORT
  return `${protocol}://${target.host}:${port}`
}

module.exports = {
  DEFAULT_PORT,
  DEFAULT_PROTOCOL,
  configPath,
  emptyConfig,
  normalizeConfig,
  loadServerConfig,
  saveServerConfig,
  isManualConfigured,
  serviceBaseUrl
}
