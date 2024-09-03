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
const si = require('systeminformation');
const AutoLaunch = require('auto-launch')
const isReachable = require('is-reachable')
//const server = require('http').Server(app)
///const websockify = require('@sukkis/node-multi-websockify') //multi websockify for noVNC
const websockify = require('./websockify') //multi websockify for noVNC
const {
  createServer
} = require("https")
const async = require('async') //async foreach function
const logdir = path.normalize(homedir + '/clevervnc-log')
const iconPath = path.join(__dirname, '/src/assets/media/logo.png')
const publishPath = path.join(__dirname, '/src/assets/media/publish.png')
const now = new Date()
const date = require('date-and-time')
const datelog = date.format(now, 'YYYY-MM-DD')
const config = require('./config') //Get configuration for ScreenCast
//const rtAudio = require('./audiostream')
var log = require('electron-log')
log.transports.file.file = logdir + '/' + datelog + '.log'
var pingstat
var ipaddress

//Websockify settings.
const hostname = os.hostname()
const server = createServer({
  cert: fs.readFileSync(path.join(__dirname, '/cert/example.com+5.pem')),
  key: fs.readFileSync(path.join(__dirname, '/cert/example.com+5-key.pem'))
})
server.listen(8840, hostname, () => console.log(`listening on ${hostname}:8840`))

if (!fs.existsSync(logdir)) {
  fs.mkdir(logdir, 0x755, (err) => {
    if (err) {
      log.warn(err)
    }
  })
}

//One instance process check
let win = null
let appIcon = null
var autoreload

var vncport = (process.platform == 'linux') ? '5900' : '5900'

const template = [
  // { role: 'fileMenu' }
  {
    label: 'Menu',
    submenu: [{
        label: 'Auto restart',
        submenu: [{
            label: "30 min",
            type: "radio",
            checked: config.autorestart == 1800000 ? true : false,
            click: (menuItem, browserWindow, event) => {
              menuItem.checked = true
              replaceConfig('autorestart', 'exports.autorestart = 1800000')
              if (autoreload) {
                clearInterval(autoreload)
              }
              if (menuItem.checked) {
                autoreload = setInterval(function () {
                  console.log('3hour')
                  //win.webContents.reloadIgnoringCache()
                  win.webContents.session.clearCache()
                }, 1800000)
              }
              const menu = Menu.buildFromTemplate(template)
              Menu.setApplicationMenu(menu)
            }
          },
          {
            label: "1 hour",
            type: "radio",
            checked: config.autorestart == 3600000 ? true : false,
            click: (menuItem, browserWindow, event) => {
              menuItem.checked = true
              replaceConfig('autorestart', 'exports.autorestart = 3600000')
              if (autoreload) {
                clearInterval(autoreload)
              }
              if (menuItem.checked) {
                autoreload = setInterval(function () {
                  console.log('6hour')
                  //win.webContents.reloadIgnoringCache()
                  win.webContents.session.clearCache()
                }, 3600000)
              }
              const menu = Menu.buildFromTemplate(template)
              Menu.setApplicationMenu(menu)
            }
          },
          {
            label: "3 hour",
            type: "radio",
            checked: config.autorestart == 10800000 ? true : false,
            click: (menuItem, browserWindow, event) => {
              menuItem.checked = true
              replaceConfig('autorestart', 'exports.autorestart = 10800000')
              if (autoreload) {
                clearInterval(autoreload)
              }
              if (e.checked) {
                autoreload = setInterval(function () {
                  console.log('9hour')
                  //win.webContents.reloadIgnoringCache()
                  win.webContents.session.clearCache()
                }, 10800000)
              }
              const menu = Menu.buildFromTemplate(template)
              Menu.setApplicationMenu(menu)
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
        label: 'Quit',
        click: async () => {
          app.isQuiting = true
          appIcon.destroy()
          app.quit()
          app.exit()
        }
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

    //increase memory size
    var totalRAM = os.totalmem()
    totalRAM = totalRAM / (1024 * 1024)
    app.commandLine.appendSwitch("js-flags", "--max-old-space-size=" + Math.trunc(totalRAM))

    //ignore cert
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

      //RUN WINDOWS AT STARTU
      if (app.isPackaged) {
        if (config.autostartup == 'Y') {
          app.setLoginItemSettings({
            openAtLogin: true,
          })
        }
      }

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
            appIcon.destroy()
            app.quit()
            app.exit()
          }
        }
      ])

      //reload page
      ipcMain.handle('reload', async (event, reload) => {
        win.webContents.reloadIgnoringCache()
        return
      })

      //restart page
      ipcMain.handle('restartapp', async (event, restart) => {
        app.relaunch()
        appIcon.destroy()
        app.exit()
        return
      })

      //save config
      ipcMain.handle('save-config', async (event, search, replace, checked) => {
        replaceConfig(search, replace)
        if (search == 'startup') {
          if (checked) screencastAutoLaunch.enable()
          else screencastAutoLaunch.disable()
        }
        return
      })

      //set icon color
      ipcMain.handle('tray-icon', async (event, trayimg) => {
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
        return
      })

      //check vnc port 5901-5905
      //set icon color
      ipcMain.handle('port-extended', async (event, msg) => {
        console.log(ipaddress)
        var port = ['5900', '5901', '5902', '5903', '5904', '5905']
        var availPort = []
        async.eachSeries(port, function (isPort, next) {
            isReachable('127.0.0.1:' + isPort, {
              timeout: 10000
            }).then((status) => {
              if (status == true) {
                var screenPath = '/screen' + isPort.substring(3, 4)
                var targetObj = new Object()
                targetObj.target = ipaddress + ':' + isPort //targer address
                targetObj.path = screenPath // path
                availPort.push(targetObj)
              }
              next()
            })
          },
          function (err) {
            if (err) {
              return err
            }
            console.log('available port : ', availPort)
            websockify(server, availPort) // create websockify servers in array of objects
            return availPort
          })
      })

      //give ip address
      ipcMain.handle('get-ipaddress', async (event, msg) => {
        return ipaddress
      })

      appIcon.setContextMenu(contextMenu)
      appIcon.on('double-click', () => {
        if (win.isVisible()) return win.hide()
        win.show()
      })

      autoreload = setInterval(function () {
        //win.webContents.reloadIgnoringCache()
        win.webContents.session.clearCache()
      }, config.autorestart)

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
            si.networkInterfaces('default').then(ipcon => {
              ipaddress = ipcon.ip4
              win.loadURL("file://" + __dirname + "/src/index.html")
              pingstat = false
            })
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

function replaceConfig(search, replace) {
  fs.readFile(path.join(__dirname, 'config.js'), 'utf8', function (err, data) {
    let searchString = search
    let re = new RegExp('^.*' + searchString + '.*$', 'gm')
    let formatted = data.replace(re, replace)
    fs.writeFile(path.join(__dirname, 'config.js'), formatted, 'utf8', function (err) {
      if (err) return console.log(err)
    })
  })
}