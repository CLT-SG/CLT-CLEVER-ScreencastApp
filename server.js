const express = require('express')
const fs = require('fs')
const https = require('https')
const path = require('path')
const { Server: SocketIOServer } = require('socket.io')
const log = require('electron-log')

// Initialize Express app
const app = express()

// SSL/TLS Configuration
const options = {
  cert: fs.readFileSync(path.join(__dirname, '/cert/example.com+5.pem')),
  key: fs.readFileSync(path.join(__dirname, '/cert/example.com+5-key.pem')),
  minVersion: 'TLSv1.2' // Enforce minimum TLS version for security
}

// Create HTTPS server
const server = https.createServer(options, app)

// Configure Socket.IO with security options
const io = new SocketIOServer(server, {
  cors: {
    origin: ['https://localhost:8840', 'https://127.0.0.1:8840'],
    methods: ['GET', 'POST'],
    credentials: true
  },
  maxHttpBufferSize: 1e8 // Set to 100MB for audio streaming
})

// -------------------- Socket.IO Signaling Logic --------------------
io.on('connection', (socket) => {
  log.info('Client connected:', socket.id)

  // Handle WebRTC signaling
  socket.on('offer', (offer) => {
    log.info('Received offer from client')
    socket.broadcast.emit('offer', offer)
  })

  socket.on('answer', (answer) => {
    log.info('Received answer from client')
    socket.broadcast.emit('answer', answer)
  })

  socket.on('candidate', (candidate) => {
    log.info('Received ICE candidate from client')
    socket.broadcast.emit('candidate', candidate)
  })

  socket.on('requestConnection', () => {
    log.info('Client requested connection')
    socket.emit('connectionConfirmed', {
      success: true,
      timestamp: Date.now()
    })
  })

  socket.on('audioStream', (stream) => {
    log.info('Received audio stream from master')
    // Broadcast audio stream to all clients except sender
    socket.broadcast.emit('audioStream', stream)
  })

  // Handle disconnect
  socket.on('disconnect', () => {
    log.info('Client disconnected:', socket.id)
  })
})

// -------------------- Security Headers --------------------
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'SAMEORIGIN')
  res.setHeader('X-XSS-Protection', '1; mode=block')
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:;")
  next()
})

// -------------------- Static File Serving --------------------
app.use('/', express.static(path.join(__dirname, 'src')))

// Routes
app.get('/client', (req, res) => {
  res.sendFile(path.join(__dirname, '/src/client.html'))
})

app.get('/master', (req, res) => {
  res.sendFile(path.join(__dirname, '/src/master.html'))
})

// -------------------- Error handling --------------------
app.use((err, req, res, next) => {
  log.error('Express error:', err)
  res.status(500).send('Server Error')
})

// -------------------- Start the Server --------------------
const PORT = 8840
server.listen(PORT, () => {
  log.info(`HTTPS server listening on *:${PORT}`)
})

module.exports = server