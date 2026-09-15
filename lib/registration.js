const http = require('http')
const https = require('https')
const { URL } = require('url')
const { serviceBaseUrl } = require('./server-config')

const REGISTER_PATH = '/api/screencast-app/register'
const HEARTBEAT_PATH = '/api/screencast-app/heartbeat'
const DISCOVER_PATH = '/api/screencast-app/discover'
const UNREGISTER_PATH = '/api/screencast-app/unregister'

function requestJson(baseUrl, pathname, method, body, timeoutMs) {
  return new Promise((resolve, reject) => {
    let target
    try {
      target = new URL(pathname, baseUrl)
    } catch (err) {
      reject(err)
      return
    }
    const payload = body ? JSON.stringify(body) : null
    const transport = target.protocol === 'https:' ? https : http
    const req = transport.request({
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port,
      path: target.pathname + target.search,
      method,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {})
      },
      timeout: timeoutMs || 8000,
      rejectUnauthorized: false
    }, (res) => {
      const chunks = []
      res.on('data', (chunk) => chunks.push(chunk))
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        let json = null
        if (text) {
          try {
            json = JSON.parse(text)
          } catch (err) {
            json = { raw: text }
          }
        }
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ statusCode: res.statusCode, body: json })
        } else {
          const error = new Error(`HTTP ${res.statusCode} ${pathname}`)
          error.statusCode = res.statusCode
          error.body = json
          reject(error)
        }
      })
    })
    req.on('timeout', () => {
      req.destroy(new Error(`Timeout ${pathname}`))
    })
    req.on('error', reject)
    if (payload) {
      req.write(payload)
    }
    req.end()
  })
}

async function probeService(target, logger) {
  const baseUrl = serviceBaseUrl(target)
  if (!baseUrl) {
    throw new Error('Missing CLEVER-Service address')
  }
  if (logger) logger.info(`Probing CLEVER-Service ${baseUrl}${DISCOVER_PATH}`)
  const result = await requestJson(baseUrl, DISCOVER_PATH, 'GET')
  return result.body
}

async function registerDevice(target, payload, logger) {
  const baseUrl = serviceBaseUrl(target)
  if (!baseUrl) {
    throw new Error('Missing CLEVER-Service address')
  }
  if (logger) logger.info(`Registering ScreencastApp ${payload.deviceId} with ${baseUrl}`)
  const result = await requestJson(baseUrl, REGISTER_PATH, 'POST', payload)
  if (logger) logger.info(`Registered with CLEVER-Service as ${payload.hostnameLocal || payload.hostname}:${payload.vncPort || 5900}`)
  return result.body
}

async function sendHeartbeat(target, payload, logger) {
  const baseUrl = serviceBaseUrl(target)
  if (!baseUrl) {
    throw new Error('Missing CLEVER-Service address')
  }
  if (logger) logger.info(`Heartbeat ${payload.deviceId} -> ${baseUrl}`)
  const result = await requestJson(baseUrl, HEARTBEAT_PATH, 'POST', payload)
  return result.body
}

async function unregisterDevice(target, payload, logger) {
  const baseUrl = serviceBaseUrl(target)
  if (!baseUrl) {
    return null
  }
  try {
    if (logger) logger.info(`Unregistering ${payload.deviceId} from ${baseUrl}`)
    const result = await requestJson(baseUrl, UNREGISTER_PATH, 'POST', payload, 3000)
    return result.body
  } catch (err) {
    if (logger) logger.warn(`Unregister failed: ${err.message}`)
    return null
  }
}

function buildRegistrationPayload(info) {
  return {
    deviceId: info.deviceId,
    hostname: info.hostname,
    hostnameLocal: info.hostnameLocal,
    ip: info.ip,
    macAddress: info.macAddress || null,
    os: info.os,
    osRelease: info.osRelease,
    appVersion: info.appVersion,
    status: info.status || 'online',
    sharing: !!info.sharing,
    lastSeen: info.lastSeen || new Date().toISOString(),
    vncPort: info.vncPort || 5900,
    wsPort: info.wsPort || 8840,
    audioPort: info.audioPort || 6900,
    monitors: info.monitors || [],
    capabilities: info.capabilities || {}
  }
}

module.exports = {
  REGISTER_PATH,
  HEARTBEAT_PATH,
  DISCOVER_PATH,
  UNREGISTER_PATH,
  requestJson,
  probeService,
  registerDevice,
  sendHeartbeat,
  unregisterDevice,
  buildRegistrationPayload
}
