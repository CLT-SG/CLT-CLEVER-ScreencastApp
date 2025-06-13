// This is a separate preload script for the master.html and client.html pages
const { contextBridge, ipcRenderer } = require('electron')
const moment = require('moment')
const path = require('path')

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

// Safe subset of APIs for web content
contextBridge.exposeInMainWorld(
  'webApi', {
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    reloadPage: () => ipcRenderer.invoke('reload'),
    // Date formatting functions using moment
    formatDate: (date, format) => moment(date).format(format),
    currentDate: () => moment().format('YYYY-MM-DD'),
    // System information
    getIpAddress: () => ipcRenderer.invoke('get-ipaddress'),
    // Window controls
    minimize: () => ipcRenderer.invoke('minimize-window'),
    maximize: () => ipcRenderer.invoke('maximize-window'),
    close: () => ipcRenderer.invoke('close-window'),
    // Configuration
    saveConfig: (search, replace, checked) => ipcRenderer.invoke('save-config', search, replace, checked)
  }
)

// Log preload execution
console.log('Web preload script executed')
contextBridge.exposeInMainWorld('io', {
  connect: (url) => {
    if (typeof io !== 'undefined') {
      return io(url);
    } else {
      console.error('Socket.IO is not available');
      return null;
    }
  }
});

// DOM-ready listener to notify main process
window.addEventListener('DOMContentLoaded', () => {
  ipcRenderer.send('dom-ready')
})