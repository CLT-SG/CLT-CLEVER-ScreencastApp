'use strict'

const net = require('net')
const { EventEmitter } = require('events')

/** TCP reachability probe with timeout. */
function probePort (host, port, timeoutMs) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port })
    const done = (ok) => {
      socket.destroy()
      resolve(ok)
    }
    socket.setTimeout(timeoutMs)
    socket.once('connect', () => done(true))
    socket.once('timeout', () => done(false))
    socket.once('error', () => done(false))
  })
}

/**
 * Polls the local VNC server port until it is reachable and keeps
 * monitoring it afterwards, so the app both recovers when the VNC
 * server is still starting up (e.g. right after boot) and notices when
 * it goes away again.
 *
 * Events:
 *  'status' (reachable: boolean)      - every probe result
 *  'reachable'                        - first successful probe
 *  'attempts-exhausted' (attempts)    - after `maxAttempts` consecutive
 *                                       initial failures (fired once)
 */
class VncMonitor extends EventEmitter {
  constructor ({ host = '127.0.0.1', port = 5900, intervalMs = 10000, timeoutMs = 5000, maxAttempts = 3, logger = console }) {
    super()
    this._host = host
    this._port = port
    this._intervalMs = intervalMs
    this._timeoutMs = timeoutMs
    this._maxAttempts = maxAttempts
    this._log = logger
    this._timer = null
    this._failedAttempts = 0
    this._everReachable = false
    this._alerted = false
    this.reachable = false
  }

  start () {
    if (this._timer) {
      return
    }
    const tick = async () => {
      const ok = await probePort(this._host, this._port, this._timeoutMs)
      const changed = ok !== this.reachable
      this.reachable = ok

      if (ok) {
        this._failedAttempts = 0
        if (!this._everReachable) {
          this._everReachable = true
          this._log.info('vnc-monitor: VNC server detected on ' + this._host + ':' + this._port)
          this.emit('reachable')
        } else if (changed) {
          this._log.info('vnc-monitor: VNC server is back on ' + this._host + ':' + this._port)
        }
      } else if (!this._everReachable) {
        this._failedAttempts++
        this._log.warn('vnc-monitor: VNC server not reachable on ' + this._host + ':' +
          this._port + ' (attempt ' + this._failedAttempts + '), retrying in ' +
          (this._intervalMs / 1000) + 's')
        if (this._failedAttempts >= this._maxAttempts && !this._alerted) {
          this._alerted = true
          this.emit('attempts-exhausted', this._failedAttempts)
        }
      } else if (changed) {
        this._log.warn('vnc-monitor: VNC server went away on ' + this._host + ':' + this._port)
      }

      if (changed || !this._everReachable) {
        this.emit('status', ok)
      }
    }
    tick()
    this._timer = setInterval(tick, this._intervalMs)
  }

  stop () {
    if (this._timer) {
      clearInterval(this._timer)
      this._timer = null
    }
  }
}

module.exports = { VncMonitor, probePort }
