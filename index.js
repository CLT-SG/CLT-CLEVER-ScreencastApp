const {
  app,
  dialog,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  Menu,
  Tray
} = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')
const homedir = os.homedir()
const isReachable = require('is-reachable')
const appdir = path.normalize(homedir + '/app')
const logdir = path.normalize(homedir + '/clevervnc-log')
const iconPath = path.join(__dirname, '/src/assets/media/logo.png')
const publishPath = path.join(__dirname, '/src/assets/media/publish.png')
const now = new Date()
const date = require('date-and-time')
const datelog = date.format(now, 'YYYY-MM-DD')
var log = require('electron-log')
log.transports.file.file = logdir + '/' + datelog + '.log'
var pingstat

//check if folder app and logs exists
if (!fs.existsSync(appdir)) {
  fs.mkdir(appdir, 0755, (err) => {
    if (err) {
      log.warn(err)
    }
  })
}
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
const template = [
  // { role: 'fileMenu' }
  {
    label: 'File',
    submenu: [{
      role: 'quit'
    }]
  },
  // { role: 'viewMenu' }
  {
    label: 'View',
    submenu: [{
        role: 'forcereload'
      },
      {
        type: 'separator'
      },
      {
        role: 'toggledevtools'
      },
    ]
  },
  {
    role: 'help',
    submenu: [{
      label: 'Contact Us',
      click: async () => {
        const {
          shell
        } = require('electron')
        await shell.openExternal('https://www.closed-loop.biz/contact.html')
      }
    }]
  }
]
const gotTheLock = app.requestSingleInstanceLock()

try {
  //update config-app.js to current update
  fs.stat(appdir + '/clever-config.js', function (err, stats) {
    if (err) {
      log.warn(err)
    } else {
      var mtime = stats.mtime
      mtime = date.format(mtime, 'YYYY-MM-DD')
      var updateDate = date.parse('2020-02-06', 'YYYY-MM-DD')
      updateDate = date.format(updateDate, 'YYYY-MM-DD')
      if (mtime < updateDate) {
        fs.writeFile(appdir + '/clever-config.js',
          "var hostserver = '192.168.1.88'; // change hostname here\r\n\r\n\r\n" +
          "module.exports.hostserver = hostserver; // localhost in local network\r\n" +
          "module.exports.cleverweb = hostserver + ':3000'; // localhost:3000 in local network\r\n" +
          "module.exports.mediaserver = hostserver + ':8000'; // localhost:8000 in local network\r\n" +
          "module.exports.screenapi = hostserver + ':9559'; // localhost:9559 in local network\r\n" +
          "module.exports.screenserver = hostserver + ':7890'; // localhost:7890 in local network\r\n" +
          "module.exports.timeout = 10000;\r\n",
          function (err, data) {
            if (err) {
              log.warn(err)
            }
            log.info('Config file created.')
            const options = {
              type: 'info',
              buttons: ['Ok'],
              defaultId: 2,
              title: 'Setup and configuration',
              message: 'Config file has been updated.',
              detail: 'Please change hostserver at this location ' + appdir + '/clever-config.js \r\n' +
                '\r\n\r\n' +
                'Copyright © 2000-' + date.format(now, 'YYYY') + ' by Closed-loop Technology Pte Ltd. All rights reserved \r\n' +
                ' www.closed-loop.biz'
            }
            dialog.showMessageBox(null, options).then((data) => {
              if (data.response == 0) {
                app.exit()
                app.relaunch()
              }
            })
          })
      }
    }
  })
} catch (err) {
  console.log(err)
  log.warn(err)
}
try {
  const config = require(appdir + '/clever-config')
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
        width: 300,
        height: 150,
        icon: iconPath,
        resizable: false, //false to disable resizable
        webPreferences: {
          webSecurity: false,
          enableRemoteModule: true,
          devTools: false,
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
        var titlenotif = "Video Wall Remote Desktop Notification"
        if (trayimg == 'publish') {
          appIcon.setImage(publishPath)
          appIcon.setToolTip('Remote desktop is running.')
          appIcon.displayBalloon({
            title: titlenotif,
            content: 'Remote desktop start to sharing.'
          })
        } else if (trayimg == 'stopped') {
          appIcon.setImage(iconPath)
          appIcon.setToolTip('Cast not started.')
          appIcon.displayBalloon({
            title: titlenotif,
            content: 'Remote desktop stop to sharing.'
          })
        }
      })
      appIcon.setContextMenu(contextMenu)
      appIcon.on('double-click', () => {
        win.show()
      })
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

      //CLEAR CACHE AND COOKIE EVERY STARTUP
      const ses = win.webContents.session
      ses.clearCache(() => {
        console.log("Cache cleared!")
      })

      var status
      //check url status and open
      (async () => {
        await isReachable('127.0.0.1:5900', {
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
              detail: 'Make sure VNC Server is running. You can download at this website\r\n' +
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
  fs.writeFile(appdir + '/clever-config.js',
    "var hostserver = '192.168.1.88'; // change hostname here\r\n\r\n\r\n" +
    "module.exports.hostserver = hostserver; // localhost in office\r\n" +
    "module.exports.cleverweb = hostserver + ':3000'; // localhost:3000 in local network\r\n" +
    "module.exports.mediaserver = hostserver + ':8000'; // localhost:8000 in local network\r\n" +
    "module.exports.screenapi = hostserver + ':9559'; // localhost:9559 in local network\r\n" +
    "module.exports.screenserver = hostserver + ':7890'; // localhost:7890 in local network\r\n" +
    "module.exports.timeout = 10000;\r\n",
    function (err, data) {
      if (err) {
        log.warn(err)
      }
      log.info('Config file created.')
      const options = {
        type: 'info',
        buttons: ['Ok'],
        defaultId: 2,
        title: 'Setup and configuration',
        message: 'Config file has been created.',
        detail: 'Please change hostserver at this location ' + appdir + '/clever-config.js \r\n' +
          '\r\n\r\n' +
          'Copyright © 2000-' + date.format(now, 'YYYY') + ' by Closed-loop Technology Pte Ltd. All rights reserved \r\n' +
          ' www.closed-loop.biz'
      };
      dialog.showMessageBox(null, options).then((data) => {
        if (data.response == 0) {
          app.exit()
          app.relaunch()
        }
      })
    })
}
