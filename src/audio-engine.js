/* global audioHost */
(function () {
  const peers = new Map()
  const remoteAudio = new Map()
  const offerChains = new Map()
  const recoverTimers = new Map()
  let deviceChangeTimer = null
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

  function clearRecoverTimer(clientId) {
    const timer = recoverTimers.get(clientId)
    if (timer) {
      clearTimeout(timer)
      recoverTimers.delete(clientId)
    }
  }

  function closePeer(clientId) {
    clearRecoverTimer(clientId)
    const pc = peers.get(clientId)
    if (pc) {
      try { pc.close() } catch (err) { /* ignore */ }
      peers.delete(clientId)
    }
    offerChains.delete(clientId)
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

  /** Prefer connected peers; avoid sticky Connection Lost when one of many fails. */
  function reportAggregateStatus(extra) {
    if (peers.size === 0) {
      // Mid-recovery peers are empty while signaling clients may still be joined.
      reportStatus((extra && extra.error) ? 'reconnecting' : 'starting', extra)
      return
    }
    let anyConnected = false
    let anyConnecting = false
    let anyBad = false
    let badState = null
    peers.forEach((pc) => {
      const state = pc.connectionState
      if (state === 'connected') anyConnected = true
      else if (state === 'connecting' || state === 'new' || state === 'checking') anyConnecting = true
      else if (state === 'disconnected' || state === 'failed' || state === 'closed') {
        anyBad = true
        badState = state
      }
    })
    if (anyConnected) {
      reportStatus('connected', extra)
      return
    }
    if (anyConnecting) {
      reportStatus('starting', extra)
      return
    }
    if (anyBad) {
      reportStatus('reconnecting', {
        error: (extra && extra.error) || ('WebRTC ' + (badState || 'interrupted'))
      })
    }
  }

  function requestPeerRenegotiate(clientId) {
    send({
      type: 'signal',
      clientId,
      message: { type: 'renegotiate' }
    })
  }

  /**
   * WebRTC often flips to disconnected briefly on LAN; wait before tearing
   * down. failed is terminal — recreate via client renegotiate.
   */
  function schedulePeerRecovery(clientId, reason, delayMs) {
    clearRecoverTimer(clientId)
    const delay = delayMs == null ? (reason === 'failed' ? 400 : 2500) : delayMs
    recoverTimers.set(clientId, setTimeout(() => {
      recoverTimers.delete(clientId)
      const pc = peers.get(clientId)
      if (!pc) return
      const state = pc.connectionState
      if (state === 'connected' || state === 'connecting') {
        reportAggregateStatus()
        return
      }
      log('warn', 'recovering peer ' + clientId + ' after ' + state)
      closePeer(clientId)
      reportAggregateStatus({ error: 'Audio connection interrupted' })
      requestPeerRenegotiate(clientId)
    }, delay))
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
        clearRecoverTimer(clientId)
        reportAggregateStatus()
      } else if (pc.connectionState === 'failed') {
        reportAggregateStatus({ error: 'WebRTC failed' })
        schedulePeerRecovery(clientId, 'failed')
      } else if (pc.connectionState === 'disconnected') {
        reportAggregateStatus({ error: 'WebRTC disconnected' })
        schedulePeerRecovery(clientId, 'disconnected')
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

  function queueOffer(clientId, sdp, offerId) {
    const prev = offerChains.get(clientId) || Promise.resolve()
    const next = prev.catch(() => {}).then(() => handleOffer(clientId, sdp, offerId))
    offerChains.set(clientId, next)
    return next
  }

  async function handleOffer(clientId, sdp, offerId) {
    reportStatus('starting')
    let pc = peers.get(clientId)
    // A second offer while mid-handshake (common with 3 Video Wall slots)
    // must replace the peer; applying another remote offer in have-remote-offer
    // or answering twice leaves viewers in signalingState "stable" with stale SDP.
    if (pc && pc.signalingState !== 'stable') {
      log('warn', 'replacing peer ' + clientId + ' for new offer (was ' + pc.signalingState + ')')
      closePeer(clientId)
      pc = null
    }
    pc = await ensurePeer(clientId)
    await pc.setRemoteDescription({ type: 'offer', sdp })
    await addLocalTracks(pc)
    if (!config.systemAudio && !config.microphone && !config.twoWayAudio) {
      if (!pc.getTransceivers().length) {
        pc.addTransceiver('audio', { direction: 'recvonly' })
      }
    }
    const answer = await pc.createAnswer()
    answer.sdp = preferOpus(answer.sdp)
    await pc.setLocalDescription(answer)
    const message = { type: 'answer', sdp: pc.localDescription.sdp }
    if (offerId != null) {
      message.offerId = offerId
    }
    send({
      type: 'signal',
      clientId,
      message
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

  async function handleControl(clientId, message) {
    const prev = {
      systemAudio: config.systemAudio,
      microphone: config.microphone,
      twoWayAudio: config.twoWayAudio
    }
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
    const captureChanged = prev.systemAudio !== config.systemAudio ||
      prev.microphone !== config.microphone ||
      prev.twoWayAudio !== config.twoWayAudio
    // Only renegotiate the client that sent control. Broadcasting renegotiate
    // to every Video Wall slot caused duplicate answers → stable-state errors.
    const targets = captureChanged
      ? Array.from(peers.keys())
      : (clientId && peers.has(clientId) ? [clientId] : [])
    for (const id of targets) {
      const pc = peers.get(id)
      if (!pc) continue
      await addLocalTracks(pc)
      send({
        type: 'signal',
        clientId: id,
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
          await queueOffer(event.clientId, message.sdp, message.offerId)
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
        await handleControl(event.clientId, message)
      }
    }
  }

  async function refreshCaptureAfterDeviceChange() {
    log('info', 'audio devices changed')
    await listDevices()
    // Do not flip the dashboard to Connection Lost for enumeration noise —
    // Windows fires devicechange often during desktop/loopback capture.
    if (!peers.size) {
      reportStatus('enabled')
      return
    }
    if (!config.systemAudio && !config.microphone && !config.twoWayAudio) {
      reportAggregateStatus()
      return
    }
    const needSystem = !!(config.systemAudio && systemStream)
    const needMic = !!((config.microphone || config.twoWayAudio) && micStream)
    if (!needSystem && !needMic) {
      reportAggregateStatus()
      return
    }
    try {
      if (needSystem) {
        stopStream(systemStream)
        systemStream = null
        await captureSystemAudio()
      }
      if (needMic) {
        stopStream(micStream)
        micStream = null
        await captureMicrophone()
      }
      const ids = Array.from(peers.keys())
      for (const id of ids) {
        const pc = peers.get(id)
        if (!pc) continue
        await addLocalTracks(pc)
        requestPeerRenegotiate(id)
      }
      reportAggregateStatus()
    } catch (err) {
      reportStatus('error', { error: err.message })
    }
  }

  if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
    navigator.mediaDevices.addEventListener('devicechange', () => {
      if (deviceChangeTimer) clearTimeout(deviceChangeTimer)
      deviceChangeTimer = setTimeout(() => {
        deviceChangeTimer = null
        refreshCaptureAfterDeviceChange().catch((err) => {
          log('warn', 'devicechange refresh failed: ' + err.message)
        })
      }, 750)
    })
  }

  if (window.audioHost) {
    audioHost.onEvent(onEvent)
    audioHost.ready()
    listDevices()
    log('info', 'audio engine ready')
  }
})()
