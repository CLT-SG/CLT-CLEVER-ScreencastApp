const express = require('express')
const fs = require('fs')
const https = require('https')
const path = require('path')
const app = express()


// SSL/TLS Configuration
const options = {
    cert: fs.readFileSync(path.join(__dirname, '/cert/example.com+5.pem')),
    key: fs.readFileSync(path.join(__dirname, '/cert/example.com+5-key.pem'))
}

// Create HTTPS server
const server = https.createServer(options, app)
const io = require('socket.io')(server)


// Attach Socket.IO to the HTTPS server instance

// -------------------- Socket.IO Signaling Logic --------------------
// Socket.IO Signaling Logic
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    socket.on('offer', (offer) => {
        console.log('Received offer from client:', offer);
        socket.broadcast.emit('offer', offer);
    });

    socket.on('answer', (answer) => {
        console.log('Received answer from client:', answer);
        socket.broadcast.emit('answer', answer);
    });

    socket.on('candidate', (candidate) => {
        console.log('Received ICE candidate from client:', candidate);
        socket.broadcast.emit('candidate', candidate);
    });

    socket.on('requestConnection', () => {
        console.log('Client requested connection');
        // Handle the request here, you might want to send some signaling information back to the client
    });

    socket.on('audioStream', (stream) => {
        console.log('Received audio stream from master', stream);
        // Broadcast audio stream to all clients except sender
        socket.broadcast.emit('audioStream', stream);
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});

// -------------------- Static File Serving --------------------

// Serve files under the '/client' URL path
app.use('/', express.static(path.join(__dirname, 'src')))

// Specific route to serve client.html
app.get('/client', function (req, res) {
    res.sendFile(__dirname + "/src/client.html")
})

// Specific route to serve client.html
app.get('/master', function (req, res) {
    res.sendFile(__dirname + "/src/master.html")
})

// -------------------- Start the Server --------------------
server.listen(8840, () => console.log('HTTPS server listening on *:8840'))