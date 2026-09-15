const { contextBridge, ipcRenderer, desktopCapturer } = require('electron')

contextBridge.exposeInMainWorld('audioHost', {
  getSources: (opts) => desktopCapturer.getSources(opts || { types: ['screen'] }),
  send: (message) => ipcRenderer.send('audio-engine-message', message),
  ready: () => ipcRenderer.send('audio-engine-ready'),
  log: (level, msg, extra) => ipcRenderer.send('audio-engine-log', { level, msg, extra }),
  onEvent: (callback) => {
    const listener = (_event, data) => callback(data)
    ipcRenderer.on('audio-engine-event', listener)
    return () => ipcRenderer.removeListener('audio-engine-event', listener)
  }
})
