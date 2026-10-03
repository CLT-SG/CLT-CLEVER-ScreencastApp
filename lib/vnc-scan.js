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
 * Find local VNC listeners and map them to ScreencastApp websockify paths.
 * The TCP target stays on 127.0.0.1: the probe and the VNC server are on
 * this machine. Remote viewers use the advertised hostname and IP to reach
 * websockify, not this loopback target.
 */
async function scanVncTargets(options) {
  const opts = options || {}
  const ports = opts.ports || ['5900', '5901', '5902', '5903', '5904', '5905']
  const probeHost = opts.probeHost || '127.0.0.1'
  const timeoutMs = opts.timeoutMs || 1500
  const logger = opts.logger
  const targets = []

  for (const port of ports) {
    const result = await probeTcp(probeHost, port, timeoutMs)
    if (!result.ok) {
      if (logger) {
        logger.info(`VNC port ${port} is not listening on ${probeHost}` +
          (result.error ? ` (${result.error})` : ''))
      }
      continue
    }
    const path = screenPathForPort(port)
    const target = {
      target: `${probeHost}:${port}`,
      path,
      hostname: opts.hostname || '',
      hostnameLocal: opts.hostnameLocal || '',
      ip: opts.ip || '',
      port: String(port)
    }
    targets.push(target)
    if (logger) {
      logger.info(`VNC port ${port} is available; websockify ${path} -> ${target.target}` +
        (opts.ip ? ` advertised ${opts.ip}:${opts.wsPort || 8840}${path}` : ''))
    }
  }

  return targets
}

module.exports = {
  screenPathForPort,
  probeTcp,
  scanVncTargets
}
