exports.pcname = "DESKTOP"
exports.autorestart = 1800000
exports.autostartup = true
exports.audio = true
exports.systemAudio = true
exports.microphone = false
exports.speakerOutput = true
exports.twoWayAudio = false
exports.autoshare = true

// Window configuration
exports.window = {
  width: 1180,         // Default window width in pixels
  height: 900,         // Default window height in pixels
  minWidth: 1024,      // Minimum window width
  minHeight: 700,      // Minimum window height
  resizable: true      // Whether window can be resized
}

// Connection settings
exports.connection = {
  timeout: 10000,      // Connection timeout in milliseconds
  retryInterval: 5000, // Time between connection attempts
  maxRetries: 3        // Maximum number of connection retry attempts
}

// Server configuration
exports.server = {
  port: 8840,          // Port for HTTPS / websockify server
  scanPorts: ['5900', '5901', '5902', '5903', '5904', '5905'] // VNC ports to scan
}

// CLEVER-Service discovery defaults. Host/IP are never hardcoded; they
// come from LAN discovery or from the persisted user configuration.
exports.cleverService = {
  discoveryPort: 8842,
  defaultPort: 8000,
  defaultProtocol: 'http'
}

// Appearance settings
exports.appearance = {
  theme: 'dark',       // UI theme ('dark' or 'light')
  showSplash: false,   // Keep the dashboard visible after launch
  splashDuration: 5000 // Duration used only when showSplash is true
}

// Debug and logging settings
exports.debug = {
  verbose: false,      // Enable verbose logging
  logLevel: 'info',    // Log level (error, warn, info, debug)
  saveLogsToDisk: true // Save logs to disk
}