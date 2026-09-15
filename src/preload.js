'use strict'

const { contextBridge, ipcRenderer } = require('electron')

// Minimal, promise-based bridge between the sandboxed renderer and the
// main process. The renderer has no Node.js access.
contextBridge.exposeInMainWorld('clever', {
  getState: () => ipcRenderer.invoke('app:get-state'),
  startCast: () => ipcRenderer.invoke('cast:start'),
  stopCast: () => ipcRenderer.invoke('cast:stop'),
  restartCast: () => ipcRenderer.invoke('cast:restart'),
  setSetting: (key, value) => ipcRenderer.invoke('settings:set', key, value),
  hideWindow: () => ipcRenderer.send('window:hide'),
  installUpdate: () => ipcRenderer.send('update:install'),
  onState: (callback) => ipcRenderer.on('state', (_event, state) => callback(state)),
  onUpdateEvent: (callback) => ipcRenderer.on('update', (_event, info) => callback(info))
})
