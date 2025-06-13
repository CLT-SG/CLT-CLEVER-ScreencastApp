const {
  app,
  dialog,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  Menu,
  Tray
} = require('electron')
const isMac = process.platform === 'darwin'
const path = require('path')
const fs = require('fs')
const os = require('os')
const homedir = os.homedir()
const si = require('systeminformation')
const AutoLaunch = require('auto-launch')
const isReachable = require('is-reachable')
const websockify = require('./websockify')
const { createServer } = require("https")
const async = require('async')
const logdir = path.normalize(homedir + '/clevervnc-log')
const iconPath = path.join(__dirname, '/src/assets/media/logo.png')
const publishPath = path.join(__dirname, '/src/assets/media/publish.png')
const now = new Date()
const moment = require('moment') // Replace date-and-time with moment
const datelog = moment().format('YYYY-MM-DD')
const config = require('./config')

// Configure logging
var log = require('electron-log')
log.transports.file.file = path.join(logdir, `${datelog}.log`)
var pingstat
var ipaddress

// Websockify settings
const hostname = os.hostname()
const server = createServer({
  cert: fs.readFileSync(path.join(__dirname, '/cert/example.com+5.pem')),
  key: fs.readFileSync(path.join(__dirname, '/cert/example.com+5-key.pem'))
})

// Create log directory if it doesn't exist
if (!fs.existsSync(logdir)) {
  fs.mkdirSync(logdir, { recursive: true }, (err) => {
    if (err) {
      log.warn(err)
    }
  })
}

// One instance process check
let win = null
let appIcon = null
let autoreload

const vncport = (process.platform == 'linux') ? '5900' : '5900'
const screencastAutoLaunch = new AutoLaunch({
  name: 'CLEVER Screencast',
  path: app.getPath('exe'),
})

// Menu template with updated structure for Electron v22
const template = [
  {
    label: 'Menu',
    submenu: [
      {
        label: 'Auto restart',
        submenu: [
          {
            label: "30 min",
            type: "radio",
            checked: config.autorestart == 1800000,
            click: () => {
              replaceConfig('autorestart', 'exports.autorestart = 1800000')
              setupAutoReload(1800000)
              updateMenu()
            }
          },
          {
            label: "1 hour",
            type: "radio",
            checked: config.autorestart == 3600000,
            click: () => {
              replaceConfig('autorestart', 'exports.autorestart = 3600000')
              setupAutoReload(3600000)
              updateMenu()
            }
          },
          {
            label: "3 hour",
            type: "radio",
            checked: config.autorestart == 10800000,
            click: () => {
              replaceConfig('autorestart', 'exports.autorestart = 10800000')
              setupAutoReload(10800000)
              updateMenu()
            }
          }
        ]
      },
      {
        type: 'separator'
      },
      {
        label: 'About',
        click: async () => {
          const { shell } = require('electron')
          await shell.openExternal('https://www.closed-loop.biz/contact.html')
        }
      },
      {
        label: 'Check for update',
        click: async () => {
          dialog.showMessageBox({
            type: 'info',
            title: 'Updates',
            message: 'Checking for updates...',
            buttons: ['OK']
          })
          // In a production app, this would connect to update server
        }
      },
      (isMac ? {
        role: 'close'
      } : {
        label: 'Quit',
        click: () => {
          app.isQuiting = true
          if (appIcon) appIcon.destroy()
          app.quit()
        }
      })
    ]
  },
  {
    label: 'View',
    submenu: [
      { role: 'reload' },
      { role: 'forceReload' },
      { type: 'separator' },
      { role: 'toggleDevTools' },
      { type: 'separator' },
      { role: 'resetZoom' },
      { role: 'zoomIn' },
      { role: 'zoomOut' },
      { type: 'separator' },
      { role: 'togglefullscreen' }
    ]
  }
]

function updateMenu() {
  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock()

function setupAutoReload(interval) {
  if (autoreload) {
    clearInterval(autoreload)
  }
  
  autoreload = setInterval(() => {
    if (win) {
      log.info(`Auto reload triggered (${interval}ms interval)`)
      win.webContents.session.clearCache()
    }
  }, interval)
}

try {
  if (!gotTheLock) {
    app.exit()
  } else {
    app.on('second-instance', (event, commandLine, workingDirectory) => {
      // Someone tried to run a second instance, we should focus our window
      if (win) {
        if (win.isMinimized()) {
          log.info("Restore process.")
          win.show()
        }
        win.focus()
      }
    })

    // HTTPS certificate settings
    app.commandLine.appendSwitch('ignore-certificate-errors', 'true')
    app.commandLine.appendSwitch("disable-http-cache")

    // Increase memory size
    const totalRAM = os.totalmem() / (1024 * 1024)
    app.commandLine.appendSwitch("js-flags", `--max-old-space-size=${Math.trunc(totalRAM)}`)

    // Ignore cert
    app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
      event.preventDefault()
      callback(true)
    })

    // App crash report to log
    process.on('uncaughtException', (err) => {
      log.error('Uncaught exception:', err)
    })

    // Start HTTP server
    server.listen(8840, () => log.info(`Server listening on ${hostname}:8840`))

    // App startup config
    app.whenReady().then(() => {
      // Create main window
      win = new BrowserWindow({
        //width: 350,
        //height: 460,
        width: 1200,
        height: 960,
        icon: iconPath,
        resizable: false,
        frame: false,
        webPreferences: {
          preload: path.join(__dirname, 'preload.js'),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: false,
          webSecurity: true
        }
      })

      // Auto startup settings
      if (app.isPackaged && config.autostartup) {
        app.setLoginItemSettings({
          openAtLogin: true,
        })
      }

      // Set menu - fixed for Electron v22
      updateMenu()

      // Create tray icon
      appIcon = new Tray(iconPath)
      const contextMenu = Menu.buildFromTemplate([
        {
          label: 'Show App',
          click: function () {
            win.show()
          }
        },
        {
          label: 'Quit',
          click: function () {
            app.isQuiting = true
            appIcon.destroy()
            app.quit()
          }
        }
      ])

      // New IPC handlers for window controls
      ipcMain.handle('minimize-window', () => {
        win.minimize()
      })
      
      ipcMain.handle('maximize-window', () => {
        if (win.isMaximized()) {
          win.unmaximize()
        } else {
          win.maximize()
        }
      })
      
      ipcMain.handle('close-window', () => {
        win.hide()
      })
      
      ipcMain.handle('open-about', async () => {
        const { shell } = require('electron')
        await shell.openExternal('https://www.closed-loop.biz/contact.html')
      })

      // IPC Handlers
      // Get app version
      ipcMain.handle('get-app-version', () => {
        return app.getVersion()
      })

      // Reload page
      ipcMain.handle('reload', async () => {
        win.webContents.reloadIgnoringCache()
      })

      // Restart app
      ipcMain.handle('restartapp', async () => {
        app.relaunch()
        appIcon.destroy()
        app.exit()
      })

      // Save config
      ipcMain.handle('save-config', async (event, search, replace, checked) => {
        replaceConfig(search, replace)
        if (search === 'autostartup') {
          if (checked) {
            screencastAutoLaunch.enable()
          } else {
            screencastAutoLaunch.disable()
          }
        }
      })

      // Update tray icon
      ipcMain.handle('tray-icon', async (event, trayimg) => {
        const titlenotif = "Video Wall Screencast & VNC Notification"
        if (trayimg === 'publish') {
          appIcon.setImage(publishPath)
          appIcon.setToolTip('Screencast & VNC is running.')
          appIcon.displayBalloon({
            title: titlenotif,
            content: 'Screencast & VNC start to sharing.'
          })
        } else if (trayimg === 'stopped') {
          appIcon.setImage(iconPath)
          appIcon.setToolTip('Cast not started.')
          appIcon.displayBalloon({
            title: titlenotif,
            content: 'Screencast & VNC stop to sharing.'
          })
        }
      })

      // Scan and set up VNC ports
      ipcMain.handle('port-extended', async () => {
        log.info('Scanning VNC ports')
        const ports = ['5900', '5901', '5902', '5903', '5904', '5905']
        const availablePorts = []
        
        await new Promise((resolve) => {
          async.eachSeries(ports, async (port, next) => {
            try {
              const status = await isReachable(`127.0.0.1:${port}`, { timeout: 10000 })
              if (status) {
                log.info(`VNC port ${port} is available`)
                const screenPath = `/screen${port.substring(3, 4)}`
                availablePorts.push({
                  target: `${ipaddress}:${port}`,
                  path: screenPath
                })
              }
              next()
            } catch (err) {
              log.error(`Error checking port ${port}:`, err)
              next()
            }
          }, () => {
            if (availablePorts.length > 0) {
              log.info(`Available ports: ${availablePorts.map(p => p.target).join(', ')}`)
              websockify(server, availablePorts)
            } else {
              log.warn('No VNC ports available')
            }
            resolve()
          })
        })
        
        return availablePorts
      })

      // Return IP address
      ipcMain.handle('get-ipaddress', async () => {
        return ipaddress
      })

      // Set tray context menu
      appIcon.setContextMenu(contextMenu)
      appIcon.on('double-click', () => {
        win.isVisible() ? win.hide() : win.show()
      })

      // Set up auto reload based on config
      setupAutoReload(config.autorestart)

      // Window events
      win.on('close', (event) => {
        if (!app.isQuiting) {
          event.preventDefault()
          win.hide()
          return false
        }
        return true
      })
      
      win.on('minimize', (event) => {
        event.preventDefault()
        win.hide()
      })

      // Auto hide after 5 seconds
      setTimeout(() => {
        win.hide()
      }, 5000)

      // Register dev tools shortcut
      globalShortcut.register('CommandOrControl+D', () => {
        win.webContents.openDevTools()
      })

      // Clear cache on startup
      win.webContents.session.clearCache().then(() => {
        log.info("Cache cleared on startup")
      })

      // Listen for DOM ready from renderer
      ipcMain.on('dom-ready', () => {
        log.info('DOM ready event received from renderer process')
      })

      // Check VNC status and open window
      checkVncAndOpenWindow()
    })
  }
} catch (ex) {
  log.error(ex)
}

// Helper functions
function replaceConfig(search, replace) {
  try {
    const configPath = path.join(__dirname, 'config.js')
    const data = fs.readFileSync(configPath, 'utf8')
    const re = new RegExp(`^.*${search}.*$`, 'gm')
    const formatted = data.replace(re, replace)
    fs.writeFileSync(configPath, formatted, 'utf8')
    log.info(`Config updated: ${search} = ${replace}`)
  } catch (err) {
    log.error(`Error updating config: ${err}`)
  }
}

function checkVncAndOpenWindow() {
  try {
    isReachable(`127.0.0.1:${vncport}`, { timeout: 10000 })
      .then(status => {
        if (status) {
          si.networkInterfaces('default')
            .then(ipcon => {
              ipaddress = ipcon.ip4
              win.loadFile(path.join(__dirname, 'src', 'index.html'))
              pingstat = false
              log.info(`VNC server found on port ${vncport}, loading application`)
            })
            .catch(err => {
              log.error(`Error getting network interfaces: ${err}`)
              app.exit()
            })
        } else {
          win.hide()
          const options = {
            type: 'info',
            buttons: ['Ok'],
            defaultId: 0,
            title: 'ERROR - 2',
            message: 'Cannot find VNC Server on this computer.',
            detail: 'Make sure VNC Server is running. You can download at this website https://www.tightvnc.com/download.php\r\n' +
              '\r\n\r\n' +
              `Copyright © 2000-${moment().format('YYYY')} by Closed-loop Technology Pte Ltd. All rights reserved \r\n` +
              ' www.closed-loop.biz'
          }
          
          dialog.showMessageBox(null, options)
            .then(({response}) => {
              if (response === 0) {
                app.exit()
              }
            })
          
          log.warn('VNC is not installed on this PC.')
          pingstat = true
        }
      })
      .catch(err => {
        log.error(`Error checking VNC server: ${err}`)
        app.exit()
      })
  } catch (err) {
    log.error(`Error in checkVncAndOpenWindow: ${err}`)
    app.exit()
  }
}