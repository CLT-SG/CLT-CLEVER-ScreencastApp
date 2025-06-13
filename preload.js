// Import required modules
const { contextBridge, ipcRenderer } = require('electron')
const fs = require('fs')
const path = require('path')
const moment = require('moment')
const os = require('os')

// Load config safely
const config = require(path.join(__dirname, 'config.js'))

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('api', {
  // IPC communication
  send: (channel, data) => {
    // Allowed channels for sending
    const validChannels = ['reload', 'restartapp', 'save-config', 'tray-icon', 'port-extended', 'get-ipaddress']
    if (validChannels.includes(channel)) {
      return ipcRenderer.invoke(channel, data)
    }
  },
  
  // System information
  os: {
    hostname: () => os.hostname(),
    platform: () => os.platform(),
    release: () => os.release(),
    totalmem: () => os.totalmem(),
    homedir: () => os.homedir()
  },
  
  // File system limited access
  fs: {
    readFile: (filePath, options) => {
      // Only allow reading from specific directories
      if (filePath.startsWith(path.join(__dirname, 'src'))) {
        return fs.readFileSync(filePath, options)
      }
      return null
    }
  },
  
  // Date and time utilities
  time: {
    now: () => new Date(),
    format: (date, format) => moment(date).format(format)
  },
  
  // App configuration
  config: {
    pcname: config.pcname,
    cleverserver: config.cleverserver,
    autorestart: config.autorestart,
    autostartup: config.autostartup,
    audio: config.audio
  },
  
  // Application version (will be set by main process)
  getAppVersion: () => ipcRenderer.invoke('get-app-version')
})

// Log preload execution
console.log('Preload script executed')