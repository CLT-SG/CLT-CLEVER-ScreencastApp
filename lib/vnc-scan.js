'use strict'

const net = require('net')
const { websockifyPath } = require('./host-names')

function screenPathForPort(port) {
  return '/' + websockifyPath(port)
}

function probeTcp(host, port, timeoutMs) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port: Number(port) })
    let settled = false
    const finish = (ok, error) => {
      if (settled) {
        return
      }
      settled = true
      socket.removeAllListeners()
      socket.destroy()
      resolve({ ok, error: error ? String(error.message || error) : null })
    }
    socket.setTimeout(timeoutMs || 1500)
    socket.once('connect', () => finish(true, null))
    socket.once('timeout', () => finish(false, new Error('timeout')))
    socket.once('error', (err) => finish(false, err))
  })
}

/**
 * Choose the TCP host websockify should dial for a local VNC server.
 *
 * UltraVNC / TightVNC often accept TCP on 127.0.0.1 but then reject RFB with
 * "Sorry, loopback connections are not enabled". When a LAN IP is known,
 * dial that first so the VNC server sees a non-loopback peer. Keep
 * 127.0.0.1 as a TCP fallback when the LAN address refuses the connection
 * (VNC bound to loopback only).
 */
async function chooseVncProxyHost(options) {
  const opts = options || {}
  const port = opts.port
  const lanIp = opts.ip ? String(opts.ip).trim() : ''
  const probeHost = opts.probeHost || '127.0.0.1'
  const timeoutMs = opts.timeoutMs || 1500
  const logger = opts.logger
  const probe = typeof opts.probeFn === 'function' ? opts.probeFn : probeTcp

  const loopback = await probe(probeHost, port, timeoutMs)
  if (!loopback.ok) {
    return {
      ok: false,
      host: null,
      alternateHost: null,
      error: loopback.error
    }
  }

  if (lanIp && lanIp !== probeHost) {
    const lan = await probe(lanIp, port, timeoutMs)
    if (lan.ok) {
      if (logger) {
        logger.info(`VNC port ${port} reachable on ${lanIp}; ` +
          `proxy via LAN (avoids UltraVNC loopback-disabled rejection)`)
      }
    } else if (logger) {
      logger.info(`VNC port ${port} probe on ${lanIp} failed` +
        (lan.error ? ` (${lan.error})` : '') +
        `; still preferring LAN with loopback fallback`)
    }
    // Prefer LAN even when the probe races: connecting to 127.0.0.1 makes
    // UltraVNC reject RFB when AllowLoopback is off.
    return {
      ok: true,
      host: lanIp,
      alternateHost: probeHost,
      error: null
    }
  }

  return {
    ok: true,
    host: probeHost,
    alternateHost: null,
    error: null
  }
}

/**
 * Find local VNC listeners and map them to ScreencastApp websockify paths.
 * Presence is probed on 127.0.0.1; the TCP proxy target prefers the LAN IP
 * so UltraVNC does not treat the websockify hop as a forbidden loopback.
 * Remote viewers still connect to websockify on the advertised hostname/IP.
 */
async function scanVncTargets(options) {
  const opts = options || {}
  const ports = opts.ports || ['5900', '5901', '5902', '5903', '5904', '5905']
  const probeHost = opts.probeHost || '127.0.0.1'
  const timeoutMs = opts.timeoutMs || 1500
  const logger = opts.logger
  const targets = []

  for (const port of ports) {
    const choice = await chooseVncProxyHost({
      port,
      ip: opts.ip,
      probeHost,
      timeoutMs,
      logger,
      probeFn: opts.probeFn
    })
    if (!choice.ok) {
      if (logger) {
        logger.info(`VNC port ${port} is not listening on ${probeHost}` +
          (choice.error ? ` (${choice.error})` : ''))
      }
      continue
    }
    const path = screenPathForPort(port)
    const target = {
      target: `${choice.host}:${port}`,
      path,
      hostname: opts.hostname || '',
      hostnameLocal: opts.hostnameLocal || '',
      ip: opts.ip || '',
      port: String(port),
      alternateTarget: choice.alternateHost
        ? `${choice.alternateHost}:${port}`
        : null
    }
    targets.push(target)
    if (logger) {
      logger.info(`VNC port ${port} is available; websockify ${path} -> ${target.target}` +
        (target.alternateTarget ? ` (fallback ${target.alternateTarget})` : '') +
        (opts.ip ? ` advertised ${opts.ip}:${opts.wsPort || 8840}${path}` : ''))
    }
  }

  return targets
}

function isLoopbackDisabledReason(buffer) {
  const text = Buffer.isBuffer(buffer) ? buffer.toString('utf8') : String(buffer || '')
  return /loopback connections are not enabled/i.test(text)
}

module.exports = {
  screenPathForPort,
  probeTcp,
  chooseVncProxyHost,
  scanVncTargets,
  isLoopbackDisabledReason
}
