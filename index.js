'use strict'

const path = require('path')
const {
  app,
  dialog,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  screen
} = require('electron')
const { autoUpdater } = require('electron-updater')
const AutoLaunch = require('auto-launch')

const log = require('./lib/logger')
const { Settings } = require('./lib/settings')
const { CastService } = require('./lib/cast-service')
const { VncMonitor } = require('./lib/vnc-monitor')
const { TrayManager } = require('./lib/tray')

const ICON_IDLE = path.join(__dirname, 'src', 'assets', 'media', 'logo.png')
const ICON_PUBLISH = path.join(__dirname, 'src', 'assets', 'media', 'publish.png')
const INDEX_PAGE = path.join(__dirname, 'src', 'index.html')
const PRELOAD = path.join(__dirname, 'src', 'preload.js')

class CleverVncApp {
  constructor () {
    this.win = null
    this.tray = null
    this.settings = null
    this.castService = null
    this.vncMonitor = null
    this.autoLauncher = null
    this._cacheTimer = null
    this._wasCasting = false
    this._quitting = false
  }

  run () {
    if (!app.requestSingleInstanceLock()) {
      app.exit()
      return
    }
    app.on('second-instance', () => this.showWindow())

    // The video wall servers use self-signed certificates.
    app.commandLine.appendSwitch('ignore-certificate-errors', 'true')
    app.commandLine.appendSwitch('disable-http-cache')
    app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
      event.preventDefault()
      callback(true)
    })

    app.on('window-all-closed', () => { /* keep running in the tray */ })
    app.on('before-quit', () => {
      this._quitting = true
    })
    app.on('will-quit', () => {
      globalShortcut.unregisterAll()
      if (this.vncMonitor) this.vncMonitor.stop()
      if (this.castService) this.castService.shutdown()
    })

    app.whenReady().then(() => this._onReady())
  }

  _onReady () {
    this.settings = new Settings(path.join(app.getPath('userData'), 'settings.json'), log)
    this.autoLauncher = new AutoLaunch({
      name: 'CLEVER Screencast & VNC',
      path: process.execPath
    })

    this._createWindow()
    this._createTray()
    this._createServices()
    this._registerIpc()
    this._setupAutoUpdater()

    globalShortcut.register('CommandOrControl+D', () => {
      if (this.win) this.win.webContents.toggleDevTools()
    })

    this._scheduleCacheClear(this.settings.get('cacheClearMinutes'))
    this.castService.startRegistration()
    this.vncMonitor.start()

    // The app autostarts with the OS; get out of the user's way.
    setTimeout(() => {
      if (this.win && !this.win.isDestroyed()) this.win.hide()
    }, 5000)
  }

  _createWindow () {
    this.win = new BrowserWindow({
      width: 350,
      height: 460,
      icon: ICON_IDLE,
      resizable: false,
      frame: false,
      webPreferences: {
        preload: PRELOAD,
        contextIsolation: true,
        nodeIntegration: false,
        zoomFactor: 1
      }
    })
    this.win.loadFile(INDEX_PAGE)

    this.win.on('minimize', (event) => {
      event.preventDefault()
      this.win.hide()
    })
    this.win.on('close', (event) => {
      if (!this._quitting) {
        event.preventDefault()
        this.win.hide()
      }
    })
    this.win.on('closed', () => {
      this.win = null
    })
  }

  _createTray () {
    this.tray = new TrayManager({
      idleIcon: ICON_IDLE,
      publishIcon: ICON_PUBLISH,
      settings: this.settings,
      actions: {
        onShow: () => this.showWindow(),
        onQuit: () => {
          this._quitting = true
          app.quit()
        },
        onCheckUpdate: () => this._checkForUpdates(true),
        onSetCacheInterval: (minutes) => {
          this.settings.set('cacheClearMinutes', minutes)
          this._scheduleCacheClear(minutes)
        }
      }
    })
  }

  // Connected monitors in VNC framebuffer coordinates: physical pixels,
  // origin at the top-left of the virtual desktop (matching how VNC
  // servers expose a multi-monitor desktop as one framebuffer).
  _getMonitors () {
    const primaryId = screen.getPrimaryDisplay().id
    const monitors = screen.getAllDisplays().map((display, i) => {
      let bounds = display.bounds
      if (typeof screen.dipToScreenRect === 'function') {
        // Windows: exact DIP -> physical pixel conversion
        try {
          bounds = screen.dipToScreenRect(null, display.bounds)
        } catch (err) {
          bounds = display.bounds
        }
      }
      if (bounds === display.bounds && display.scaleFactor && display.scaleFactor !== 1) {
        bounds = {
          x: Math.round(display.bounds.x * display.scaleFactor),
          y: Math.round(display.bounds.y * display.scaleFactor),
          width: Math.round(display.bounds.width * display.scaleFactor),
          height: Math.round(display.bounds.height * display.scaleFactor)
        }
      }
      return {
        label: display.label || 'Display ' + (i + 1),
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        primary: display.id === primaryId
      }
    })
    // Shift so the top-left monitor sits at (0,0) like the VNC framebuffer
    const minX = Math.min(...monitors.map((m) => m.x))
    const minY = Math.min(...monitors.map((m) => m.y))
    for (const m of monitors) {
      m.x -= minX
      m.y -= minY
    }
    return monitors
  }

  _createServices () {
    this.castService = new CastService({
      settings: this.settings,
      logger: log,
      getMonitors: () => this._getMonitors()
    })

    // Re-announce the device when the monitor layout changes so CLEVER
    // Web always has the current geometry.
    const reRegister = () => this.castService.registerNow()
    screen.on('display-added', reRegister)
    screen.on('display-removed', reRegister)
    screen.on('display-metrics-changed', reRegister)

    this.castService.on('state', () => {
      const casting = this.castService.casting
      if (casting !== this._wasCasting) {
        this._wasCasting = casting
        this.tray.setCasting(casting)
      }
      this.broadcastState()
    })

    this.vncMonitor = new VncMonitor({
      port: this.settings.get('vncPort'),
      logger: log
    })
    this.vncMonitor.on('status', () => this.broadcastState())
    this.vncMonitor.on('reachable', () => {
      log.info('VNC server detected, client ready.')
      if (this.settings.get('autoConnect')) {
        this.castService.startCast()
      }
    })
    this.vncMonitor.on('attempts-exhausted', () => this._showVncDialog())
  }

  _registerIpc () {
    ipcMain.handle('app:get-state', () => this.getState())
    ipcMain.handle('cast:start', async () => {
      await this.castService.startCast()
      return this.getState()
    })
    ipcMain.handle('cast:stop', () => {
      this.castService.stopCast()
      return this.getState()
    })
    ipcMain.handle('cast:restart', async () => {
      await this.castService.restartCast()
      return this.getState()
    })
    ipcMain.handle('settings:set', async (event, key, value) => {
      this.settings.set(key, value)
      if (key === 'startOnBoot') {
        await this._applyStartOnBoot(value)
      }
      return this.getState()
    })
    ipcMain.on('window:hide', () => {
      if (this.win) this.win.hide()
    })
    ipcMain.on('update:install', () => {
      this._quitting = true
      autoUpdater.quitAndInstall()
    })
  }

  async _applyStartOnBoot (enabled) {
    if (!app.isPackaged) {
      log.info('start-on-boot skipped (development build)')
      return
    }
    try {
      if (enabled) {
        await this.autoLauncher.enable()
      } else {
        await this.autoLauncher.disable()
      }
      log.info('start-on-boot ' + (enabled ? 'enabled' : 'disabled'))
    } catch (err) {
      log.warn('start-on-boot change failed: ' + err.message)
    }
  }

  _setupAutoUpdater () {
    autoUpdater.logger = log
    autoUpdater.on('update-available', () => this._sendToWindow('update', { status: 'available' }))
    autoUpdater.on('update-downloaded', () => this._sendToWindow('update', { status: 'downloaded' }))
    autoUpdater.on('error', (err) => log.warn('auto-update error: ' + err.message))
    this._checkForUpdates(false)
  }

  _checkForUpdates (interactive) {
    if (!app.isPackaged) {
      if (interactive) {
        dialog.showMessageBox(this.win, {
          type: 'info',
          message: 'Updates are only available in the installed application.'
        })
      }
      return
    }
    autoUpdater.checkForUpdatesAndNotify().catch((err) => {
      log.warn('update check failed: ' + err.message)
    })
  }

  _scheduleCacheClear (minutes) {
    if (this._cacheTimer) {
      clearInterval(this._cacheTimer)
    }
    this._cacheTimer = setInterval(() => {
      if (this.win) {
        this.win.webContents.session.clearCache()
        log.info('session cache cleared (every ' + minutes + ' min)')
      }
    }, minutes * 60 * 1000)
  }

  _showVncDialog () {
    const year = new Date().getFullYear()
    dialog.showMessageBox(this.win, {
      type: 'info',
      buttons: ['Keep waiting', 'Exit'],
      defaultId: 0,
      title: 'VNC Server not found',
      message: 'Cannot find VNC Server on this computer yet.',
      detail: 'Make sure VNC Server is running. You can download it at ' +
        'https://www.tightvnc.com/download.php\r\n' +
        'The app will keep checking in the background and start automatically ' +
        'once the VNC Server is available.\r\n\r\n' +
        'Copyright © 2000-' + year + ' by Closed-loop Technology Pte Ltd. ' +
        'All rights reserved\r\nwww.closed-loop.biz'
    }).then(({ response }) => {
      if (response === 1) {
        this._quitting = true
        app.exit()
      }
    })
  }

  getState () {
    return {
      version: app.getVersion(),
      hostname: this.castService.hostname,
      ipAddress: this.castService.ipAddress || null,
      vncReachable: this.vncMonitor.reachable,
      casting: this.castService.casting,
      viewers: this.castService.viewers,
      castError: this.castService.lastError,
      settings: this.settings.all
    }
  }

  broadcastState () {
    this._sendToWindow('state', this.getState())
  }

  showWindow () {
    if (this.win) {
      this.win.show()
      this.win.focus()
    }
  }

  _sendToWindow (channel, payload) {
    if (this.win && !this.win.isDestroyed()) {
      this.win.webContents.send(channel, payload)
    }
  }
}

log.errorHandler.startCatching()
new CleverVncApp().run()
