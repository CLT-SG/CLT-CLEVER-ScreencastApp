/* global audioHost */
(function () {
  const peers = new Map()
  const remoteAudio = new Map()
  let config = {
    systemAudio: false,
    microphone: false,
    speakerOutput: true,
    twoWayAudio: false,
    audioBitrate: 48000
  }
  let capabilities = {
    system_audio: false,
    microphone_capture: true,
    microphone_injection: false
  }
  let systemStream = null
  let micStream = null
  let selectedMic = null
  let selectedOutput = null
  let devices = []

  function log(level, msg) {
    if (window.audioHost && audioHost.log) {
      audioHost.log(level, msg)
    } else {
      console[level === 'error' ? 'error' : 'log']('[audio] ' + msg)
    }
  }

  function send(message) {
    if (window.audioHost) audioHost.send(message)
  }

  function capturing() {
    return {
      systemAudio: !!(systemStream && systemStream.getAudioTracks().some((track) => track.readyState === 'live')),
      microphone: !!(micStream && micStream.getAudioTracks().some((track) => track.readyState === 'live'))
    }
  }

  function reportStatus(state, extra) {
    send(Object.assign({
      type: 'status',
      state,
      capturing: capturing(),
      devices,
      error: extra && extra.error ? extra.error : null
    }, extra || {}))
  }

  function stopStream(stream) {
    if (!stream) return
    stream.getTracks().forEach((track) => {
      try { track.stop() } catch (err) { /* ignore */ }
    })
  }

  async function listDevices() {
    try {
      const list = await navigator.mediaDevices.enumerateDevices()
      devices = list.filter((device) => device.kind === 'audioinput' || device.kind === 'audiooutput')
        .map((device) => ({
          deviceId: device.deviceId,
          kind: device.kind,
          label: device.label || device.deviceId
        }))
      return devices
    } catch (err) {
      log('warn', 'enumerateDevices failed: ' + err.message)
      return devices
    }
  }

  function findLoopbackInput() {
    return devices.find((device) => device.kind === 'audioinput' &&
      /stereo mix|what u hear|loopback|monitor of|blackhole|soundflower|wave out/i.test(device.label))
  }

  function findInjectionOutput() {
    return devices.find((device) => device.kind === 'audiooutput' &&
      /cable input|vb-audio|voicemeeter|blackhole|soundflower|virtual/i.test(device.label))
  }

  async function captureSystemAudio() {
    if (!config.systemAudio) {
      stopStream(systemStream)
      systemStream = null
      return null
    }
    if (systemStream && systemStream.getAudioTracks().some((track) => track.readyState === 'live')) {
      return systemStream
    }
    stopStream(systemStream)
    systemStream = null

    const loopback = findLoopbackInput()
    if (loopback) {
      try {
        systemStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: { exact: loopback.deviceId },
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
            channelCount: 2,
            sampleRate: 48000
          },
          video: false
        })
        log('info', 'system audio from loopback device ' + loopback.label)
        return systemStream
      } catch (err) {
        log('warn', 'loopback capture failed: ' + err.message)
      }
    }

    if (window.audioHost && audioHost.getSources) {
      try {
        const sources = await audioHost.getSources({ types: ['screen'] })
        const source = sources && sources[0]
        if (source) {
          const mixed = await navigator.mediaDevices.getUserMedia({
            audio: {
              mandatory: {
                chromeMediaSource: 'desktop'
              }
            },
            video: {
              mandatory: {
                chromeMediaSource: 'desktop',
                chromeMediaSourceId: source.id,
                maxWidth: 16,
                maxHeight: 16,
                maxFrameRate: 1
              }
            }
          })
          mixed.getVideoTracks().forEach((track) => track.stop())
          const audioTracks = mixed.getAudioTracks()
          if (audioTracks.length) {
            systemStream = new MediaStream(audioTracks)
            log('info', 'system audio from desktop capture')
            return systemStream
          }
          log('warn', 'desktop capture returned no audio tracks')
        }
      } catch (err) {
        log('warn', 'desktop system-audio capture failed: ' + err.message)
      }
    }

    throw new Error('System audio capture is not available on this device')
  }

  async function captureMicrophone() {
    const want = config.microphone || config.twoWayAudio
    if (!want) {
      stopStream(micStream)
      micStream = null
      return null
    }
    if (micStream && micStream.getAudioTracks().some((track) => track.readyState === 'live')) {
      return micStream
    }
    stopStream(micStream)
    micStream = null
    const constraints = {
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
        sampleRate: 48000
      },
      video: false
    }
    if (selectedMic) {
      constraints.audio.deviceId = { exact: selectedMic }
    }
    micStream = await navigator.mediaDevices.getUserMedia(constraints)
    log('info', 'microphone capture started')
    return micStream
  }

  function preferOpus(sdp) {
    if (!sdp) return sdp
    const bitrate = Math.round((config.audioBitrate || 48000) / 1000)
    return sdp.replace(/a=fmtp:(\d+) .*opus.*/g, (line, payload) => {
      return 'a=fmtp:' + payload + ' minptime=10;useinbandfec=1;stereo=1;maxaveragebitrate=' + (bitrate * 1000)
    })
  }

  async function applySenderBitrate(pc) {
    const senders = pc.getSenders()
    for (const sender of senders) {
      if (!sender.track || sender.track.kind !== 'audio') continue
      try {
        const params = sender.getParameters()
        params.encodings = params.encodings && params.encodings.length ? params.encodings : [{}]
        params.encodings[0].maxBitrate = config.audioBitrate || 48000
        await sender.setParameters(params)
      } catch (err) {
        log('warn', 'could not set audio bitrate: ' + err.message)
      }
    }
  }

  function attachRemotePlayback(clientId, stream) {
    let el = remoteAudio.get(clientId)
    if (!el) {
      el = document.createElement('audio')
      el.autoplay = true
      el.playsInline = true
      document.body.appendChild(el)
      remoteAudio.set(clientId, el)
    }
    el.srcObject = stream
    el.muted = !config.speakerOutput && !config.twoWayAudio
    const injection = findInjectionOutput()
    if (injection && el.setSinkId) {
      el.setSinkId(injection.deviceId).then(() => {
        log('info', 'remote audio routed to injection device ' + injection.label)
      }).catch((err) => {
        log('warn', 'microphone injection sink failed: ' + err.message)
        if (selectedOutput && el.setSinkId) {
          el.setSinkId(selectedOutput).catch(() => {})
        }
      })
    } else if (selectedOutput && el.setSinkId) {
      el.setSinkId(selectedOutput).catch(() => {})
    }
    el.play().catch((err) => log('warn', 'remote audio play blocked: ' + err.message))
  }

  function closePeer(clientId) {
    const pc = peers.get(clientId)
    if (pc) {
      try { pc.close() } catch (err) { /* ignore */ }
      peers.delete(clientId)
    }
    const el = remoteAudio.get(clientId)
    if (el) {
      el.srcObject = null
      el.remove()
      remoteAudio.delete(clientId)
    }
  }

  function maybeStopCapture() {
    if (peers.size > 0) return
    stopStream(systemStream)
    stopStream(micStream)
    systemStream = null
    micStream = null
    log('info', 'audio capture stopped (no clients)')
    reportStatus('enabled')
  }

  async function ensurePeer(clientId) {
    if (peers.has(clientId)) {
      return peers.get(clientId)
    }
    const pc = new RTCPeerConnection({
      iceServers: [],
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require'
    })
    pc.onicecandidate = (event) => {
      send({
        type: 'signal',
        clientId,
        message: { type: 'ice', candidate: event.candidate }
      })
    }
    pc.onconnectionstatechange = () => {
      log('info', 'peer ' + clientId + ' ' + pc.connectionState)
      if (pc.connectionState === 'connected') {
        reportStatus('connected')
      } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        reportStatus('reconnecting', { error: 'WebRTC ' + pc.connectionState })
      }
    }
    pc.ontrack = (event) => {
      const stream = event.streams && event.streams[0] ? event.streams[0] : new MediaStream([event.track])
      attachRemotePlayback(clientId, stream)
    }
    peers.set(clientId, pc)
    return pc
  }

  async function addLocalTracks(pc) {
    const existing = pc.getSenders().map((sender) => sender.track).filter(Boolean)
    if (config.systemAudio) {
      try {
        const stream = await captureSystemAudio()
        stream.getAudioTracks().forEach((track) => {
          track.contentHint = 'music'
          if (!existing.includes(track)) {
            pc.addTrack(track, stream)
          }
        })
      } catch (err) {
        log('error', err.message)
        reportStatus('error', { error: err.message })
      }
    }
    if (config.microphone || config.twoWayAudio) {
      try {
        const stream = await captureMicrophone()
        stream.getAudioTracks().forEach((track) => {
          track.contentHint = 'speech'
          if (!existing.includes(track)) {
            pc.addTrack(track, stream)
          }
        })
      } catch (err) {
        log('error', 'microphone capture failed: ' + err.message)
        reportStatus('error', { error: err.message })
      }
    }
    await applySenderBitrate(pc)
  }

  async function handleOffer(clientId, sdp) {
    reportStatus('starting')
    const pc = await ensurePeer(clientId)
    await pc.setRemoteDescription({ type: 'offer', sdp })
    await addLocalTracks(pc)
    if (!config.systemAudio && !config.microphone && !config.twoWayAudio) {
      pc.addTransceiver('audio', { direction: 'recvonly' })
    }
    const answer = await pc.createAnswer()
    answer.sdp = preferOpus(answer.sdp)
    await pc.setLocalDescription(answer)
    send({
      type: 'signal',
      clientId,
      message: { type: 'answer', sdp: pc.localDescription.sdp }
    })
  }

  async function handleIce(clientId, candidate) {
    const pc = peers.get(clientId)
    if (!pc || !candidate) return
    try {
      await pc.addIceCandidate(candidate)
    } catch (err) {
      log('warn', 'addIceCandidate: ' + err.message)
    }
  }

  async function handleControl(message) {
    config = Object.assign({}, config, {
      systemAudio: message.systemAudio != null ? !!message.systemAudio : config.systemAudio,
      microphone: message.microphone != null ? !!message.microphone : config.microphone,
      speakerOutput: message.speaker != null ? !!message.speaker : config.speakerOutput,
      twoWayAudio: message.twoWay != null ? !!message.twoWay : config.twoWayAudio
    })
    if (!config.systemAudio) {
      stopStream(systemStream)
      systemStream = null
    }
    if (!config.microphone && !config.twoWayAudio) {
      stopStream(micStream)
      micStream = null
    }
    remoteAudio.forEach((el) => {
      el.muted = !config.speakerOutput && !config.twoWayAudio
    })
    for (const [clientId, pc] of peers) {
      await addLocalTracks(pc)
      send({
        type: 'signal',
        clientId,
        message: { type: 'renegotiate' }
      })
    }
  }

  async function onEvent(event) {
    if (!event || !event.type) return
    if (event.type === 'config') {
      config = Object.assign({}, config, event.config || {})
      capabilities = Object.assign({}, capabilities, event.capabilities || {})
      selectedMic = config.microphoneDeviceId || selectedMic
      selectedOutput = config.outputDeviceId || selectedOutput
      await listDevices()
      return
    }
    if (event.type === 'client-join') {
      reportStatus('starting')
      await listDevices()
      return
    }
    if (event.type === 'client-leave') {
      closePeer(event.clientId)
      maybeStopCapture()
      return
    }
    if (event.type === 'idle') {
      Array.from(peers.keys()).forEach(closePeer)
      maybeStopCapture()
      return
    }
    if (event.type === 'signal') {
      const message = event.message || {}
      if (message.type === 'offer') {
        try {
          await handleOffer(event.clientId, message.sdp)
        } catch (err) {
          log('error', 'offer failed: ' + err.message)
          reportStatus('error', { error: err.message })
          send({
            type: 'signal',
            clientId: event.clientId,
            message: { type: 'error', error: err.message }
          })
        }
        return
      }
      if (message.type === 'ice') {
        await handleIce(event.clientId, message.candidate)
        return
      }
      if (message.type === 'control') {
        await handleControl(message)
      }
    }
  }

  if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
    navigator.mediaDevices.addEventListener('devicechange', async () => {
      log('info', 'audio devices changed')
      await listDevices()
      reportStatus(peers.size ? 'reconnecting' : 'enabled')
      if (config.systemAudio && systemStream) {
        stopStream(systemStream)
        systemStream = null
        try {
          await captureSystemAudio()
          for (const pc of peers.values()) {
            await addLocalTracks(pc)
          }
        } catch (err) {
          reportStatus('error', { error: err.message })
        }
      }
    })
  }

  if (window.audioHost) {
    audioHost.onEvent(onEvent)
    audioHost.ready()
    listDevices()
    log('info', 'audio engine ready')
  }
})()
