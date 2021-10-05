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
const isReachable = require('is-reachable')
const logdir = path.normalize(homedir + '/clevervnc-log')
const iconPath = path.join(__dirname, '/src/assets/media/logo.png')
const publishPath = path.join(__dirname, '/src/assets/media/publish.png')
const now = new Date()
const date = require('date-and-time')
const datelog = date.format(now, 'YYYY-MM-DD')
var log = require('electron-log')
log.transports.file.file = logdir + '/' + datelog + '.log'
var pingstat

if (!fs.existsSync(logdir)) {
  fs.mkdir(logdir, 0755, (err) => {
    if (err) {
      log.warn(err)
    }
  })
}

//One instance process check
let win = null
let appIcon = null
var autorload

var vncport = (process.platform == 'linux') ? '5900' : '5900'

const template = [
  // { role: 'fileMenu' }
  {
    label: 'Menu',
    submenu: [
      //{
      //  role: 'forcereload'
      //},
      {
        label: 'Auto restart',
        submenu: [
          {
            label: "30 min",
            type: "radio",
            checked: true,
            click: e => {
              if (autorload) { clearInterval(autoreload) }
              if (e.checked) {
                autorload = setInterval(function () {
                  console.log('3hour')
                  //win.webContents.reloadIgnoringCache()
                  win.webContents.session.clearCache()
                }, 1800000
                )
              }
            }
          },
          {
            label: "1 hour",
            type: "radio",
            click: e => {
              if (autorload) { clearInterval(autoreload) }
              if (e.checked) {
                autorload = setInterval(function () {
                  console.log('6hour')
                  //win.webContents.reloadIgnoringCache()
                  win.webContents.session.clearCache()
                }, 3600000
                )
              }
            }
          },
          {
            label: "3 hour",
            type: "radio",
            click: e => {
              if (autorload) { clearInterval(autoreload) }
              if (e.checked) {
                autorload = setInterval(function () {
                  console.log('9hour')
                  //win.webContents.reloadIgnoringCache()
                  win.webContents.session.clearCache()
                }, 10800000
                )
              }
            }
          }
        ]
      },
      {
        type: 'separator'
      },
      //{
      // role: 'toggledevtools'
      //},
      {
        label: 'About',
        click: async () => {
          const {
            shell
          } = require('electron')
          await shell.openExternal('https://www.closed-loop.biz/contact.html')
        }
      },
      {
        label: 'Check for update',
        click: async () => {
          console.log('need to find how to auto update')
        }
      },
      (isMac ? {
        role: 'close'
      } : {
        role: 'quit'
      })
    ]
  }
]
const gotTheLock = app.requestSingleInstanceLock()

try {
  if (!gotTheLock) {
    app.exit()
  } else {
    app.on('second-instance', (event, commandLine, workingDirectory) => {
      // Someone tried to run a second instance, we should focus our window.
      if (win) {
        if (win.isMinimized()) {
          log.info("Restore process.")
          win.show()
        }
        win.focus()
      }
    })
    //PREVENT HTTPS TO CHCEK CERIIFICED
    //app.disableHardwareAcceleration()
    app.commandLine.appendSwitch('ignore-certificate-errors', 'true')

    //disabled cache
    app.commandLine.appendSwitch("disable-http-cache")

    app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
      event.preventDefault()
      callback(true)
    })
    //APP CRASH REPORT TO LOG
    app.on('uncaughtException', (err) => {
      log.warn('uncaughtException', err)
    })

    //APP START UP CONFIG
    app.on('ready', () => {
      win = new BrowserWindow({
        //width: 800,
        //height: 600,
        width: 350,
        height: 460,
        icon: iconPath,
        resizable: false, //false to disable resizable
        frame: false,
        webPreferences: {
          webSecurity: false,
          enableRemoteModule: true,
          devTools: true,
          nodeIntegration: true,
          webSecurity: false,
          zoomFactor: 1
        }
      })

      //Menu Settings
      const menu = Menu.buildFromTemplate(template)
      Menu.setApplicationMenu(menu)

      //Tray Settings
      appIcon = new Tray(iconPath)
      var contextMenu = Menu.buildFromTemplate([{
        label: 'Show App',
        click: function () {
          win.show()
        }
      },
      {
        label: 'Quit',
        click: function () {
          app.isQuiting = true
          app.quit()
        }
      }
      ])

      //set icon color
      ipcMain.on('tray-icon', (event, trayimg) => {
        var titlenotif = "Video Wall Screencast & VNC Notification"
        if (trayimg == 'publish') {
          appIcon.setImage(publishPath)
          appIcon.setToolTip('Screencast & VNC is running.')
          appIcon.displayBalloon({
            title: titlenotif,
            content: 'Screencast & VNC start to sharing.'
          })
        } else if (trayimg == 'stopped') {
          appIcon.setImage(iconPath)
          appIcon.setToolTip('Cast not started.')
          appIcon.displayBalloon({
            title: titlenotif,
            content: 'Screencast & VNC stop to sharing.'
          })
        }
      })
      appIcon.setContextMenu(contextMenu)
      appIcon.on('double-click', () => {
        win.show()
      })

      autorload = setInterval(function () {
        console.log('30 mins')
        //win.webContents.reloadIgnoringCache()
        win.webContents.session.clearCache()
      }, 1800000
      )

      win.on('close', function (event) {
        win = null
      })
      win.on('minimize', function (event) {
        event.preventDefault()
        win.hide()
      })

      //win CONFIG
      win.on('closed', () => {
        win = null
      })

      //auto hide
      setTimeout(function () {
        win.hide()
      }, 5000)

      //SHORTCUT KEY
      globalShortcut.register('CommandOrControl+D', () => {
        win.openDevTools()
      })

      //CLEAR CACHE AND COOKIE EVERY STARTUP
      const ses = win.webContents.session
      ses.clearCache(() => {
        console.log("Cache cleared!")
      })

      var status
      //check url status and open
      (async () => {
        await isReachable('127.0.0.1:' + vncport, {
          timeout: 10000
        }).then((status) => {
          if (status == true) {
            win.loadURL("file://" + __dirname + "/src/index.html")
            pingstat = false
          } else {
            win.hide()
            const options = {
              type: 'info',
              buttons: ['Ok'],
              defaultId: 2,
              title: 'ERROR - 2',
              message: 'Cannot find VNC Server on this computer.',
              detail: 'Make sure VNC Server is running. You can download at this website https://www.tightvnc.com/download.php\r\n' + +
                '\r\n\r\n' +
                'Copyright © 2000-' + date.format(now, 'YYYY') + ' by Closed-loop Technology Pte Ltd. All rights reserved \r\n' +
                ' www.closed-loop.biz'
            }
            dialog.showMessageBox(null, options).then((data) => {
              if (data.response == 0) {
                app.exit()
              }
            })
            log.warn('VNC is not installed on this pc.')
            pingstat = true
          }
        })
      })()
    })
  }
} catch (ex) {
  log.warn(ex)
}
