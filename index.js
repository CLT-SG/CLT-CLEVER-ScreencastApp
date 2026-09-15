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
const { createAutoUpdateController } = require('./update/autoUpdate')

// Configure logging
var log = require('electron-log')
log.transports.file.file = path.join(logdir, `${datelog}.log`)
var pingstat
var ipaddress
var hostname = os.hostname()
var hostnameLocal = `${hostname}.local`

// Helper function to get host information - both IP and hostnames
async function getHostInfo() {
  try {
    const networkInfo = await si.networkInterfaces('default')
    return {
      ip: networkInfo.ip4,
      hostname: hostname,
      hostnameLocal: hostnameLocal
    }
  } catch (err) {
    log.error(`Error getting host info: ${err}`)
    return {
      ip: '127.0.0.1',
      hostname: hostname,
      hostnameLocal: hostnameLocal
    }
  }
}

// Websockify settings
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
let isSharing = false // Track sharing state
let updater = null

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
          if (updater) {
            updater.checkForUpdates(true)
          }
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
    server.listen(config.server?.port || 8840, () => log.info(`Server listening on ${hostname}:${config.server?.port || 8840}`))

    // App startup config
    app.whenReady().then(() => {
      // Create main window
      win = new BrowserWindow({
        width: config.window?.width || 1120,
        height: config.window?.height || 760,
        minWidth: config.window?.minWidth || 960,
        minHeight: config.window?.minHeight || 680,
        icon: iconPath,
        resizable: config.window?.resizable !== undefined ? config.window.resizable : true,
        frame: false,
        webPreferences: {
          preload: path.join(__dirname, 'preload.js'),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: false,
          webSecurity: true
        }
      })
      
      // Add CSS to hide scrollbars at application level
      win.webContents.on('did-finish-load', () => {
        win.webContents.insertCSS(`
          ::-webkit-scrollbar {
            display: none !important;
          }
          * {
            -ms-overflow-style: none !important;
            scrollbar-width: none !important;
          }
        `)
        log.info('Applied CSS to hide scrollbars')
      })

      // Auto startup settings
      if (app.isPackaged && config.autostartup) {
        app.setLoginItemSettings({
          openAtLogin: true,
        })
      }

      // Set menu - fixed for Electron v22
      updateMenu()

      // Create tray icon with enhanced menu
      appIcon = new Tray(iconPath)
      const contextMenu = Menu.buildFromTemplate([
        {
          label: 'Connection Status',
          enabled: false,
        },
        {
          type: 'separator'
        },
        {
          label: 'Start Sharing',
          id: 'start-sharing',
          click: function () {
            win.webContents.send('tray-action', 'start');
          }
        },
        {
          label: 'Stop Sharing',
          id: 'stop-sharing',
          enabled: false, // Initially disabled since sharing is off
          click: function () {
            win.webContents.send('tray-action', 'stop');
          }
        },
        {
          type: 'separator'
        },
        {
          label: 'Show Application',
          click: function () {
            win.show()
          }
        },
        {
          label: 'Connection Info',
          submenu: [
            {
              label: `Hostname: ${hostname}`,
              enabled: false
            },
            {
              label: `FQDN: ${hostnameLocal}`,
              enabled: false
            }
          ]
        },
        {
          type: 'separator'
        },
        {
          label: 'Settings',
          submenu: [
            {
              label: 'Auto Startup',
              type: 'checkbox',
              checked: config.autostartup,
              click: (item) => {
                replaceConfig('autostartup', `exports.autostartup = ${item.checked}`);
                if (item.checked) {
                  screencastAutoLaunch.enable();
                } else {
                  screencastAutoLaunch.disable();
                }
              }
            },
            {
              label: 'Auto Share on Launch',
              type: 'checkbox',
              checked: config.autoshare,
              click: (item) => {
                replaceConfig('autoshare', `exports.autoshare = ${item.checked}`);
              }
            },
            {
              label: 'Enable Audio',
              type: 'checkbox',
              checked: config.audio,
              click: (item) => {
                replaceConfig('audio', `exports.audio = ${item.checked}`);
              }
            }
          ]
        },
        {
          label: 'About',
          click: async () => {
            const { shell } = require('electron')
            await shell.openExternal('https://www.closed-loop.biz/contact.html')
          }
        },
        {
          type: 'separator'
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

      // Update the first menu item to show connection status
      function updateTrayMenu(status) {
        const statusLabel = status ? 'Connected' : 'Disconnected';
        contextMenu.items[0].label = `Status: ${statusLabel}`;
        
        // Update button enabled states based on status
        contextMenu.items[2].enabled = !status; // Start Sharing
        contextMenu.items[3].enabled = status;  // Stop Sharing
        
        isSharing = status; // Update sharing state
        appIcon.setContextMenu(contextMenu);
      }

      // Add a new IPC handler for updating the tray menu status
      ipcMain.handle('update-tray-status', (event, status) => {
        updateTrayMenu(status);
      });

      // Update tray icon with tooltip and balloon notification
      ipcMain.handle('tray-icon', async (event, trayimg) => {
        const titlenotif = "Video Wall Screencast & VNC Notification"
        if (trayimg === 'publish') {
          appIcon.setImage(publishPath)
          appIcon.setToolTip('Screencast & VNC is running')
          updateTrayMenu(true);
          appIcon.displayBalloon({
            title: titlenotif,
            content: 'Screencast & VNC has started sharing',
            iconType: 'info'
          })
        } else if (trayimg === 'stopped') {
          appIcon.setImage(iconPath)
          appIcon.setToolTip('Screencast & VNC is not sharing')
          updateTrayMenu(false);
          if (updater) updater.onSharingStopped()
          appIcon.displayBalloon({
            title: titlenotif,
            content: 'Screencast & VNC has stopped sharing',
            iconType: 'warning'
          })
        }
      })

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

      // Scan and set up VNC ports
      ipcMain.handle('port-extended', async () => {
        log.info('Scanning VNC ports')
        const ports = config.server?.scanPorts || ['5900', '5901', '5902', '5903', '5904', '5905']
        const availablePorts = []
        
        try {
          await new Promise((resolve) => {
            async.eachSeries(ports, (port, callback) => {
              isReachable(`127.0.0.1:${port}`, { timeout: 10000 })
                .then(status => {
                  if (status) {
                    log.info(`VNC port ${port} is available`)
                    const screenPath = `/screen${port.substring(3, 4)}`
                    // Add both hostname formats for each port
                    availablePorts.push({
                      target: `${ipaddress}:${port}`,
                      path: screenPath,
                      hostname: hostname,
                      hostnameLocal: hostnameLocal,
                      port: port
                    })
                  }
                  callback() // Properly call the callback function
                })
                .catch(err => {
                  log.error(`Error checking port ${port}: ${err}`)
                  callback() // Make sure to call callback even on error
                })
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
        } catch (err) {
          log.error(`Error in port scanning: ${err}`)
        }
        
        return availablePorts
      })

      // Return host information
      ipcMain.handle('get-host-info', async () => {
        return await getHostInfo()
      })

      ipcMain.handle('get-system-info', async () => {
        try {
          const [osInfo, graphics, cpu] = await Promise.all([
            si.osInfo(),
            si.graphics(),
            si.cpu()
          ])
          const displays = (graphics.displays || []).map((display, index) => ({
            id: index + 1,
            model: display.model || display.vendor || `Display ${index + 1}`,
            vendor: display.vendor || '',
            resolution: [display.currentResX || display.resolutionX, display.currentResY || display.resolutionY]
              .filter(Boolean)
              .join('x') || 'Unknown',
            builtin: !!display.builtin,
            connection: display.connection || display.displayId || ''
          }))
          return {
            hostname,
            hostnameLocal,
            platform: process.platform,
            arch: process.arch,
            os: osInfo.distro || osInfo.platform || process.platform,
            release: osInfo.release || os.release(),
            cpu: cpu.brand || cpu.manufacturer || 'Unknown CPU',
            displays,
            appVersion: app.getVersion(),
            packaged: app.isPackaged
          }
        } catch (err) {
          log.error(`Error getting system info: ${err}`)
          return {
            hostname,
            hostnameLocal,
            platform: process.platform,
            arch: process.arch,
            os: process.platform,
            release: os.release(),
            cpu: '',
            displays: [],
            appVersion: app.getVersion(),
            packaged: app.isPackaged
          }
        }
      })

      ipcMain.handle('check-clever-servers', async () => {
        const servers = Array.isArray(config.cleverserver) ? config.cleverserver : []
        const results = []
        for (const host of servers) {
          try {
            const online = await isReachable(host, { timeout: 4000 })
            results.push({ host, online })
          } catch (err) {
            results.push({ host, online: false })
          }
        }
        return {
          servers: results,
          onlineCount: results.filter((item) => item.online).length
        }
      })

      ipcMain.handle('get-app-settings', () => {
        return {
          autostartup: !!config.autostartup,
          autoshare: !!config.autoshare,
          audio: !!config.audio
        }
      })

      ipcMain.handle('updater-check', () => updater && updater.checkForUpdates(true))
      ipcMain.handle('updater-download', () => updater && updater.downloadUpdate())
      ipcMain.handle('updater-install', () => updater && updater.installUpdate())
      ipcMain.handle('updater-status', () => updater && updater.getStatus())

      // Set tray context menu
      appIcon.setContextMenu(contextMenu)

      // Fix double-click behavior to properly show window
      appIcon.on('double-click', () => {
        if (!win.isVisible()) {
          win.show()
          win.focus()
        } else {
          win.hide()
        }
      })

      updater = createAutoUpdateController({
        app,
        log,
        dialog,
        isSharing: () => isSharing,
        sendToRenderer: (channel, data) => {
          if (win && !win.isDestroyed()) {
            win.webContents.send(channel, data)
          }
        }
      })

      // Set up auto reload based on config
      setupAutoReload(config.autorestart)

      setTimeout(() => {
        if (updater) updater.checkForUpdates(false)
      }, 8000)

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

      // Track window visibility for tray double-click handler
      win.on('hide', () => {
        log.info('Window hidden')
      })

      win.on('show', () => {
        log.info('Window shown')
        win.focus() // Ensure window is focused when shown
      })

      // Auto hide after configured time (or 5 seconds by default)
      if (config.appearance?.showSplash !== false) {
        setTimeout(() => {
          win.hide()
        }, config.appearance?.splashDuration || 5000)
      }

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

async function checkVncAndOpenWindow() {
  try {
    const timeout = config.connection?.timeout || 10000
    const status = await isReachable(`127.0.0.1:${vncport}`, { timeout })
    if (status) {
      const hostInfo = await getHostInfo()
      ipaddress = hostInfo.ip
      win.loadFile(path.join(__dirname, 'src', 'index.html'))
      pingstat = false
      log.info(`VNC server found on port ${vncport}, loading application`)
      log.info(`Host information: IP=${hostInfo.ip}, Hostname=${hostInfo.hostname}, Hostname.local=${hostInfo.hostnameLocal}`)
      
      // Auto-start sharing if enabled in config
      if (config.autoshare) {
        // Give time for the renderer to initialize
        setTimeout(() => {
          log.info('Auto-starting sharing based on config setting')
          win.webContents.send('tray-action', 'start')
        }, 3000)
      }
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
  } catch (err) {
    log.error(`Error in checkVncAndOpenWindow: ${err}`)
    app.exit()
  }
}