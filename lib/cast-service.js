'use strict'

const os = require('os')
const http = require('http')
const { EventEmitter } = require('events')
const { WebsockifyServer } = require('./websockify')

/** First external IPv4 address, or undefined when offline. */
function getLocalIPv4 () {
  const interfaces = os.networkInterfaces()
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address
      }
    }
  }
  return undefined
}

/**
 * Owns the screencast side of the client:
 *  - the websockify proxy (ws :websocketPort -> local VNC :vncPort)
 *  - periodic registration of this device with the CLEVER servers
 *
 * Events: 'state' (emitted whenever casting/viewer state changes)
 */
class CastService extends EventEmitter {
  constructor ({ settings, logger = console, getMonitors = null }) {
    super()
    this._settings = settings
    this._log = logger
    this._getMonitors = getMonitors
    this._proxy = null
    this._registerTimer = null
    this.lastError = null
  }

  get casting () {
    return !!(this._proxy && this._proxy.listening)
  }

  get viewers () {
    return this._proxy ? this._proxy.clientCount : 0
  }

  get hostname () {
    return os.hostname()
  }

  get ipAddress () {
    return getLocalIPv4()
  }

  /** Start the websockify proxy. Safe to call when already running. */
  async startCast () {
    if (this.casting) {
      return
    }
    // Target accepts a hostname or an IP address; fall back to the
    // machine hostname when no external IPv4 address was detected.
    // Bind the WebSocket side to every interface so remote viewers
    // (video wall / clever-web) can reach it.
    const target = (this.ipAddress || this.hostname || '127.0.0.1') +
      ':' + this._settings.get('vncPort')
    this._proxy = new WebsockifyServer({
      source: '0.0.0.0:' + this._settings.get('websocketPort'),
      target,
      logger: this._log
    })
    this._proxy.on('client-connected', () => this.emit('state'))
    this._proxy.on('client-disconnected', () => this.emit('state'))
    this._proxy.on('error', (err) => {
      this.lastError = err.message
      this.emit('state')
    })

    try {
      await this._proxy.start()
      this.lastError = null
    } catch (err) {
      this._proxy = null
      this.lastError = err.code === 'EADDRINUSE'
        ? 'Port ' + this._settings.get('websocketPort') + ' is already in use.'
        : err.message
      this._log.warn('cast-service: could not start proxy: ' + err.message)
    }
    this.emit('state')
  }

  /** Stop the websockify proxy and drop every viewer. */
  stopCast () {
    if (this._proxy) {
      this._proxy.stop()
      this._proxy = null
      this._log.info('cast-service: casting stopped')
    }
    this.emit('state')
  }

  async restartCast () {
    this.stopCast()
    await this.startCast()
  }

  /** Begin announcing this device to the CLEVER servers periodically. */
  startRegistration () {
    if (this._registerTimer) {
      return
    }
    const intervalMs = this._settings.get('registerIntervalMinutes') * 60 * 1000
    const register = () => this._registerAll()
    register()
    this._registerTimer = setInterval(register, intervalMs)
  }

  stopRegistration () {
    if (this._registerTimer) {
      clearInterval(this._registerTimer)
      this._registerTimer = null
    }
  }

  /** Force an immediate re-registration (e.g. after monitor layout changes). */
  registerNow () {
    this._registerAll()
  }

  _registerAll () {
    const ip = this.ipAddress
    if (!ip) {
      this._log.warn('cast-service: no external IPv4 address yet, skipping registration')
      return
    }
    for (const server of this._settings.get('cleverServers')) {
      this._registerWith(server, ip)
    }
  }

  _registerWith (server, ip) {
    let body = 'devicename=' + encodeURIComponent(this.hostname) +
      '&ipadd=' + encodeURIComponent(ip)
    // Include the monitor layout so CLEVER Web can offer per-monitor
    // cropping in the screencast viewer.
    if (this._getMonitors) {
      try {
        const monitors = this._getMonitors()
        if (Array.isArray(monitors) && monitors.length > 0) {
          body += '&monitors=' + encodeURIComponent(JSON.stringify(monitors))
        }
      } catch (err) {
        this._log.warn('cast-service: could not read monitor info: ' + err.message)
      }
    }
    const req = http.request({
      host: server,
      port: this._settings.get('cleverPort'),
      path: '/castsave',
      method: 'POST',
      timeout: 10000,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body)
      }
    }, (res) => {
      res.resume()
      this._log.info('cast-service: registered ' + this.hostname + ' (' + ip +
        ') with ' + server + ' [' + res.statusCode + ']')
    })
    req.on('timeout', () => req.destroy(new Error('timeout')))
    req.on('error', (err) => {
      this._log.warn('cast-service: could not reach CLEVER server ' + server + ': ' + err.message)
    })
    req.end(body)
  }

  shutdown () {
    this.stopRegistration()
    this.stopCast()
  }
}

module.exports = { CastService, getLocalIPv4 }
