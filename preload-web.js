// This is a separate preload script for the master.html and client.html pages
const { contextBridge, ipcRenderer } = require('electron')

// Expose protected methods for web pages
contextBridge.exposeInMainWorld('webBridge', {
  // Allow sending socket commands safely
  sendSocketCommand: (command, data) => {
    const validCommands = ['offer', 'answer', 'candidate', 'requestConnection', 'audioStream']
    if (validCommands.includes(command)) {
      return ipcRenderer.invoke('socket-command', command, data)
    }
  },
  
  // Get app information
  getAppInfo: () => {
    return ipcRenderer.invoke('get-app-info')
  },
  
  // Log events securely
  log: (level, message) => {
    const validLevels = ['info', 'warn', 'error', 'debug']
    if (validLevels.includes(level)) {
      return ipcRenderer.invoke('log', level, message)
    }
  }
})

// Log preload execution
console.log('Web preload script executed')
