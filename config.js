exports.pcname = "DESKTOP"
exports.cleverserver = ["192.168.1.208", "192.168.1.100", "192.168.1.104"]
exports.autorestart = 1800000
exports.autostartup = true
exports.audio = true
exports.autoshare = true

// Window configuration
exports.window = {
  width: 1120,
  height: 760,
  minWidth: 960,
  minHeight: 680,
  resizable: true
}

// Connection settings
exports.connection = {
  timeout: 10000,      // Connection timeout in milliseconds
  retryInterval: 5000, // Time between connection attempts
  maxRetries: 3        // Maximum number of connection retry attempts
}

// Server configuration
exports.server = {
  port: 8840,          // Port for HTTPS server
  scanPorts: ['5900', '5901', '5902', '5903', '5904', '5905'] // VNC ports to scan
}

// Appearance settings
exports.appearance = {
  theme: 'dark',
  showSplash: false,
  splashDuration: 0
}

// Debug and logging settings
exports.debug = {
  verbose: false,      // Enable verbose logging
  logLevel: 'info',    // Log level (error, warn, info, debug)
  saveLogsToDisk: true // Save logs to disk
}