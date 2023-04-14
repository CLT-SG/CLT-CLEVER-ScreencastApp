(async function () {
    const config = require('./config') //Get configuration for ScreenCast
    var rtAudio = null
    if (config.audio) {
        const WebSocket = require('ws') //create websocket server for audio
        const HttpsServer = require('https').createServer
        const fs = require("fs")
        const path = require("path")
        const server = HttpsServer({
            cert: fs.readFileSync(path.join(__dirname, '/cert/example.com+5.pem')),
            key: fs.readFileSync(path.join(__dirname, '/cert/example.com+5-key.pem'))
        })
        var wss = new WebSocket.Server({ //publish websocket server for audio
            server
        })
        wss.on('connection', function connection(ws) {
            console.log('Audio socket connected. sending data...')
        })

        const {
            RtAudio,
            RtAudioFormat,
            RtAudioStreamFlags,
            RtAudioApi
        } = require("audify")

        // Init RtAudio instance using default sound API //use WASAPI to get output speaker 
        //rtAudio = new RtAudio(RtAudioApi.WINDOWS_WASAPI)
        rtAudio = new RtAudio(RtAudioApi.WINDOWS_ASIO)

        // Open the input/output stream
        rtAudio.openStream({
                deviceId: rtAudio.getDefaultOutputDevice(), // Input device id (Get all devices using `getDevices`)
                nChannels: 2, // Number of channels
                firstChannel: 0 // First channel index on device (default = 0).
            }, {
                deviceId: rtAudio.getDefaultOutputDevice(), // Output device id (Get all devices using `getDevices`)
                nChannels: 2, // Number of channels
                firstChannel: 0 // First channel index on device (default = 0).
            },
            RtAudioFormat.RTAUDIO_SINT16, // PCM Format - Signed 16-bit integer
            44100, // Sampling rate is 44.1kHz
            10, // Frame size is 1920 (40ms)
            "CLEVER-audio", // The name of the stream (used for JACK Api)
            pcm => { // Input callback function, write every input pcm data to the output buffer
                wss.clients.forEach(function each(client) {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(pcm)
                    }
                })
                rtAudio.write(pcm)
            },
            null,
            RtAudioStreamFlags.RTAUDIO_MINIMIZE_LATENCY,
            (type, msg) => {
                console.log(type, msg)
            }
        )

        // Start the stream
        rtAudio.outputVolume = 0
        rtAudio.start()
        server.listen(8091, () => console.log('listening on *:8091'))
    }
    module.exports = rtAudio
}())