const https = require('https')
const fs = require('fs')
const path = require('path')
const express = require('express')
const cors = require('cors')
const log = require('electron-log')
const moment = require('moment')

// Create the Express app
const app = express()

// Enable CORS for all routes
app.use(cors())

// Static file serving - only serve the necessary files now that master/client HTML is removed
app.use('/assets', express.static(path.join(__dirname, 'src', 'assets')))

// Simplified server implementation without master/client
module.exports = function startServer() {
  try {
    // Load SSL certificates
    const server = https.createServer({
      cert: fs.readFileSync(path.join(__dirname, '/cert/example.com+5.pem')),
      key: fs.readFileSync(path.join(__dirname, '/cert/example.com+5-key.pem'))
    }, app)
    
    // Simple status endpoint
    app.get('/status', (req, res) => {
      res.json({
        status: 'running',
        time: moment().format('YYYY-MM-DD HH:mm:ss'),
        version: require('./package.json').version
      })
    })
    
    // Start the server
    server.listen(8840, () => {
      log.info(`HTTPS Server started on port 8840 at ${moment().format('YYYY-MM-DD HH:mm:ss')}`)
    })
    
    return server
  } catch (error) {
    log.error(`Error starting server: ${error.message}`)
    throw error
  }
}