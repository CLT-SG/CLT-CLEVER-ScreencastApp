'use strict'

const http = require('http')
const https = require('https')
const { URL } = require('url')

const SERVICE_TYPE = 'clever-service'
const DISCOVER_PATH = '/api/screencast-app/discover'
const DEFAULT_HTTP_PORTS = [80, 8000]
const DEFAULT_TIMEOUT_MS = 700
const DEFAULT_CONCURRENCY = 32
const MAX_BODY_BYTES = 8192

function isCleverDiscoverBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return false
  }
  if (body.type === SERVICE_TYPE || body.service === 'CLEVER-Service') {
    return true
  }
  return body.apiBase === '/api/screencast-app' && (body.port || body.hostname)
}

function getJson(targetUrl, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false
    const finish = (value) => {
      if (settled) {
        return
      }
      settled = true
      resolve(value)
    }
    let parsed
    try {
      parsed = new URL(targetUrl)
    } catch (_err) {
      finish(null)
      return
    }
    const transport = parsed.protocol === 'https:' ? https : http
    const req = transport.request({
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers: { Accept: 'application/json' },
      timeout: timeoutMs || DEFAULT_TIMEOUT_MS,
      rejectUnauthorized: false
    }, (res) => {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        res.resume()
        finish(null)
        return
      }
      const chunks = []
      let size = 0
      res.on('data', (chunk) => {
        size += chunk.length
        if (size > MAX_BODY_BYTES) {
          req.destroy()
          finish(null)
          return
        }
        chunks.push(chunk)
      })
      res.on('end', () => {
        try {
          finish(JSON.parse(Buffer.concat(chunks).toString('utf8')))
        } catch (_err) {
          finish(null)
        }
      })
    })
    req.on('timeout', () => {
      req.destroy()
      finish(null)
    })
    req.on('error', () => finish(null))
    req.end()
  })
}

function mapPool(items, limit, worker) {
  if (!items.length) {
    return Promise.resolve()
  }
  let index = 0
  const width = Math.min(limit || DEFAULT_CONCURRENCY, items.length)
  const runners = []
  const run = async () => {
    while (index < items.length) {
      const current = items[index]
      index += 1
      await worker(current)
    }
  }
  for (let i = 0; i < width; i++) {
    runners.push(run())
  }
  return Promise.all(runners)
}

function serverFromHttpBody(body, host, port, protocol) {
  const httpPort = parseInt(port, 10)
  const hostname = (body && (body.hostname || body.service)) || host
  return {
    hostname,
    host,
    ip: host,
    advertisedIp: body && body.ip ? body.ip : null,
    port: httpPort,
    protocol: protocol === 'https' || (body && body.protocol === 'https') ? 'https' : 'http',
    discoveryPort: parseInt(body && body.discoveryPort, 10) || 8842,
    apiBase: (body && body.apiBase) || '/api/screencast-app',
    serverId: (body && (body.id || body.serverId)) || (String(hostname).toLowerCase() + ':' + httpPort),
    source: 'discovered',
    via: host
  }
}

async function probeHttpDiscover(host, port, options) {
  const protocol = (options && options.protocol) || 'http'
  const timeoutMs = (options && options.timeoutMs) || DEFAULT_TIMEOUT_MS
  const path = (options && options.path) || DISCOVER_PATH
  const body = await getJson(protocol + '://' + host + ':' + port + path, timeoutMs)
  if (!isCleverDiscoverBody(body)) {
    return null
  }
  const server = serverFromHttpBody(body, host, port, protocol)
  server.port = parseInt(port, 10)
  return server
}

async function scanHttpTargets(targets, options) {
  const found = []
  const timeoutMs = (options && options.timeoutMs) || DEFAULT_TIMEOUT_MS
  const concurrency = (options && options.concurrency) || DEFAULT_CONCURRENCY
  const onFound = options && options.onFound
  await mapPool(targets, concurrency, async (target) => {
    const server = await probeHttpDiscover(target.host, target.port, {
      protocol: target.protocol,
      timeoutMs
    })
    if (!server) {
      return
    }
    found.push(server)
    if (onFound) {
      onFound(server)
    }
  })
  return found
}

function httpScanTargets(hosts, ports) {
  const list = []
  const httpPorts = (ports && ports.length) ? ports : DEFAULT_HTTP_PORTS
  hosts.forEach((host) => {
    httpPorts.forEach((port) => {
      list.push({ host, port: parseInt(port, 10), protocol: 'http' })
    })
  })
  return list
}

module.exports = {
  SERVICE_TYPE,
  DISCOVER_PATH,
  DEFAULT_HTTP_PORTS,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_CONCURRENCY,
  isCleverDiscoverBody,
  serverFromHttpBody,
  probeHttpDiscover,
  scanHttpTargets,
  httpScanTargets
}
