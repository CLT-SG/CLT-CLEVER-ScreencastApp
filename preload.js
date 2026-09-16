// Import required modules
const { contextBridge, ipcRenderer } = require('electron')
const moment = require('moment') // Use moment instead of date-and-time
const path = require('path')
const os = require('os')

// Load config safely
const config = require(path.join(__dirname, 'config.js'))

const dashboardState = require(path.join(__dirname, 'lib/dashboard-state'))

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
  
  // Date and time utilities
  time: {
    now: () => new Date(),
    format: (dateObj, format) => moment(dateObj).format(format),
    getCurrentDate: () => moment().format('YYYY-MM-DD'),
    parseDate: (dateString, format) => moment(dateString, format)
  },
  
  // App configuration (runtime values come from userData, not hardcoded IPs)
  config: {
    pcname: config.pcname,
    autorestart: config.autorestart,
    autostartup: config.autostartup,
    audio: config.audio,
    systemAudio: config.systemAudio,
    microphone: config.microphone,
    speakerOutput: config.speakerOutput,
    twoWayAudio: config.twoWayAudio,
    autoshare: config.autoshare
  },
  
  // Application version (will be set by main process)
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  reloadPage: () => ipcRenderer.invoke('reload'),
  restartApp: () => ipcRenderer.invoke('restartapp'),
  saveConfig: (search, replace, checked) => ipcRenderer.invoke('save-config', search, replace, checked),
  setTrayIcon: (trayimg) => ipcRenderer.invoke('tray-icon', trayimg),
  scanPortsExtended: () => ipcRenderer.invoke('port-extended'),
  getIpAddress: () => ipcRenderer.invoke('get-ipaddress'),
  minimize: () => ipcRenderer.invoke('minimize-window'),
  maximize: () => ipcRenderer.invoke('maximize-window'),
  close: () => ipcRenderer.invoke('close-window'),
  openAbout: () => ipcRenderer.invoke('open-about'),
  getHostInfo: () => ipcRenderer.invoke('get-host-info'),
  getServiceConnection: () => ipcRenderer.invoke('get-service-connection'),
  saveServiceConfig: (partial) => ipcRenderer.invoke('save-service-config', partial),
  startServiceDiscovery: () => ipcRenderer.invoke('start-service-discovery'),
  getMonitors: () => ipcRenderer.invoke('get-monitors'),
  getAudioStatus: () => ipcRenderer.invoke('get-audio-status'),
  setAudioConfig: (partial) => ipcRenderer.invoke('set-audio-config', partial),
  getUpdateStatus: () => ipcRenderer.invoke('updater-status'),
  checkForUpdates: () => ipcRenderer.invoke('updater-check'),
  downloadUpdate: () => ipcRenderer.invoke('updater-download'),
  installUpdate: () => ipcRenderer.invoke('updater-install'),

  // Tray control
  updateTrayStatus: (status) => ipcRenderer.invoke('update-tray-status', status),
  
  // Listen for tray actions
  onTrayAction: (callback) => {
    ipcRenderer.on('tray-action', (_, action) => callback(action));
    return () => {
      ipcRenderer.removeAllListeners('tray-action');
    };
  },
  onServiceConnection: (callback) => {
    ipcRenderer.on('service-connection', (_, snapshot) => callback(snapshot));
    return () => {
      ipcRenderer.removeAllListeners('service-connection');
    };
  },
  onMonitorsUpdated: (callback) => {
    ipcRenderer.on('monitors-updated', (_, monitors) => callback(monitors));
    return () => {
      ipcRenderer.removeAllListeners('monitors-updated');
    };
  },
  onAudioStatus: (callback) => {
    ipcRenderer.on('audio-status', (_, snapshot) => callback(snapshot));
    return () => {
      ipcRenderer.removeAllListeners('audio-status');
    };
  },
  onUpdateStatus: (callback) => {
    ipcRenderer.on('updater-status', (_, status) => callback(status));
    return () => {
      ipcRenderer.removeAllListeners('updater-status');
    };
  },
})

contextBridge.exposeInMainWorld('dashboardState', {
  connectionStatusView: dashboardState.connectionStatusView,
  updaterStatusView: dashboardState.updaterStatusView,
  overallStatusView: dashboardState.overallStatusView,
  formatTimestamp: dashboardState.formatTimestamp,
  vncView: dashboardState.vncView,
  monitorRows: dashboardState.monitorRows
})

// Log preload execution
console.log('Preload script executed')

// DOM-ready listener to notify main process
window.addEventListener('DOMContentLoaded', () => {
  ipcRenderer.send('dom-ready')
})
