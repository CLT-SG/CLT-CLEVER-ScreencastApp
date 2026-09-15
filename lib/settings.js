'use strict'

const fs = require('fs')
const path = require('path')

const DEFAULTS = Object.freeze({
  autoConnect: true,
  startOnBoot: false,
  vncPort: 5900,
  websocketPort: 8080,
  cleverServers: ['192.168.1.208', '192.168.1.100'],
  cleverPort: 9100,
  registerIntervalMinutes: 15,
  cacheClearMinutes: 30
})

/**
 * Small JSON-file backed settings store kept in the Electron userData
 * directory, so preferences survive updates and reinstalls.
 */
class Settings {
  constructor (file, logger) {
    this._file = file
    this._log = logger
    this._data = { ...DEFAULTS, ...this._load() }
  }

  _load () {
    try {
      if (fs.existsSync(this._file)) {
        return JSON.parse(fs.readFileSync(this._file, 'utf8'))
      }
    } catch (err) {
      this._log.warn('settings: could not read ' + this._file + ': ' + err.message)
    }
    return {}
  }

  _save () {
    try {
      fs.mkdirSync(path.dirname(this._file), { recursive: true })
      fs.writeFileSync(this._file, JSON.stringify(this._data, null, 2))
    } catch (err) {
      this._log.warn('settings: could not write ' + this._file + ': ' + err.message)
    }
  }

  get (key) {
    return this._data[key]
  }

  set (key, value) {
    if (!(key in DEFAULTS)) {
      this._log.warn('settings: ignoring unknown key "' + key + '"')
      return
    }
    this._data[key] = value
    this._save()
  }

  get all () {
    return { ...this._data }
  }
}

module.exports = { Settings, DEFAULTS }
