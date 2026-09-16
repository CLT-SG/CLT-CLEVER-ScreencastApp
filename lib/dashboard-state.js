'use strict'

const { MESSAGES: UPDATER_MESSAGES } = require('./updater')

const CONNECTION_LABELS = {
  searching: 'Searching',
  connected: 'Connected',
  disconnected: 'Disconnected',
  reconnecting: 'Reconnecting',
  discovered: 'Discovered',
  connecting: 'Connecting',
  registered: 'Registered',
  unavailable: 'Unavailable',
  rejected: 'Rejected',
  error: 'Error'
}

const CONNECTION_TONES = {
  searching: 'warning',
  connected: 'success',
  disconnected: 'danger',
  reconnecting: 'warning',
  discovered: 'warning',
  connecting: 'warning',
  registered: 'success',
  unavailable: 'danger',
  rejected: 'danger',
  error: 'danger'
}

const SOURCE_LABELS = {
  manual: 'Manual configuration',
  discovered: 'Automatically discovered'
}

function connectionStatusView(snapshot) {
  if (!snapshot) {
    return {
      state: 'disconnected',
      label: CONNECTION_LABELS.disconnected,
      tone: CONNECTION_TONES.disconnected,
      source: 'Not configured',
      baseUrl: 'Searching...',
      deviceId: '',
      registered: false,
      lastHeartbeatAt: null,
      lastHeartbeatLabel: 'Never',
      error: null,
      vnc: emptyVncView(),
      discovery: discoveryView(null),
      servers: []
    }
  }

  const state = snapshot.state && CONNECTION_LABELS[snapshot.state] ? snapshot.state : 'disconnected'
  const source = SOURCE_LABELS[snapshot.source]
    || (snapshot.config && snapshot.config.mode === 'manual'
      ? SOURCE_LABELS.manual
      : 'Automatic discovery')

  return {
    state,
    label: CONNECTION_LABELS[state],
    tone: CONNECTION_TONES[state] || 'neutral',
    source,
    baseUrl: snapshot.baseUrl || 'Searching...',
    deviceId: snapshot.deviceId || '',
    registered: snapshot.registered === true || state === 'connected',
    lastHeartbeatAt: snapshot.lastHeartbeatAt || null,
    lastHeartbeatLabel: formatTimestamp(snapshot.lastHeartbeatAt),
    error: snapshot.lastError || snapshot.error || null,
    vnc: vncView(snapshot, null),
    discovery: discoveryView(snapshot.discovery, snapshot.servers),
    servers: serverRows(snapshot.servers)
  }
}

function discoveryView(discovery, servers) {
  const count = Array.isArray(servers) ? servers.length : (discovery && discovery.discoveredCount) || 0
  const enabled = !!(discovery && (discovery.enabled || discovery.running))
  const phase = (discovery && discovery.phase) || (enabled ? 'searching' : 'stopped')
  let stateLabel = 'Stopped'
  if (phase === 'searching') stateLabel = 'Searching'
  else if (phase === 'waiting') stateLabel = 'Waiting to retry'
  else if (phase === 'stopped' && enabled) stateLabel = 'Enabled'
  else if (enabled) stateLabel = 'Enabled'
  return {
    enabled,
    phase,
    stateLabel,
    enabledLabel: enabled ? 'Enabled' : 'Disabled',
    count,
    countLabel: count + ' server' + (count === 1 ? '' : 's'),
    message: count ? null : ((discovery && discovery.message) || 'No CLEVER-Service servers discovered'),
    lastRoundAt: discovery && discovery.lastRoundAt,
    nextRetryAt: discovery && discovery.nextRetryAt,
    interfaces: (discovery && discovery.interfaces) || []
  }
}

function serverRows(servers) {
  return (servers || []).map((server) => {
    const state = server.state && CONNECTION_LABELS[server.state] ? server.state : 'discovered'
    const registered = !!server.registered
    const statusLabel = server.statusLabel
      || (registered && (state === 'connected' || state === 'registered')
        ? 'Connected / Registered'
        : CONNECTION_LABELS[state])
    return {
      id: server.id || server.serverId || (server.host + ':' + server.port),
      hostname: server.hostname || server.host,
      ip: server.ip || server.host,
      port: server.port,
      protocol: server.protocol || 'http',
      serverId: server.serverId || server.id || '',
      state,
      statusLabel,
      tone: CONNECTION_TONES[state] || 'neutral',
      registered,
      lastHeartbeatAt: server.lastHeartbeatAt || null,
      lastHeartbeatLabel: formatTimestamp(server.lastHeartbeatAt),
      lastSeenAt: server.lastSeenAt || null,
      lastSeenLabel: formatTimestamp(server.lastSeenAt),
      error: server.lastError || null,
      reconnecting: state === 'reconnecting'
    }
  })
}

function updaterStatusView(status) {
  const state = (status && status.state) || 'idle'
  const message = (status && status.message) || UPDATER_MESSAGES[state] || UPDATER_MESSAGES.idle
  const toneByState = {
    idle: 'neutral',
    checking: 'neutral',
    available: 'warning',
    unavailable: 'success',
    downloading: 'warning',
    ready: 'warning',
    error: 'danger',
    dev: 'neutral'
  }
  return {
    state,
    message,
    tone: toneByState[state] || 'neutral',
    progress: Number(status && status.progress) || 0,
    version: (status && status.version) || null,
    currentVersion: (status && status.currentVersion) || '',
    error: (status && status.error) || null,
    canDownload: state === 'available',
    canInstall: state === 'ready',
    busy: state === 'checking' || state === 'downloading'
  }
}

function overallStatusView(input) {
  const connection = connectionStatusView(input && input.connection)
  const updater = updaterStatusView(input && input.updater)
  const sharing = !!(input && input.sharing)
  return {
    tone: connection.tone,
    label: connection.label,
    sharing,
    sharingLabel: sharing ? 'Sharing' : 'Idle',
    sharingTone: sharing ? 'success' : 'neutral',
    updater
  }
}

function formatTimestamp(value, nowMs) {
  if (!value) {
    return 'Never'
  }
  const then = Date.parse(value)
  if (!Number.isFinite(then)) {
    return 'Never'
  }
  const now = nowMs != null ? nowMs : Date.now()
  const delta = Math.max(0, now - then)
  if (delta < 5000) return 'Just now'
  if (delta < 60000) return `${Math.floor(delta / 1000)}s ago`
  if (delta < 3600000) return `${Math.floor(delta / 60000)}m ago`
  if (delta < 86400000) return `${Math.floor(delta / 3600000)}h ago`
  try {
    return new Date(then).toISOString().replace('T', ' ').slice(0, 19)
  } catch (_err) {
    return 'Never'
  }
}

function emptyVncView() {
  return {
    port: 5900,
    wsPort: 8840,
    wsPath: '/screen0',
    sharing: false,
    connections: []
  }
}

function vncView(snapshot, ports) {
  const registered = snapshot && snapshot.vnc ? snapshot.vnc : {}
  const connections = Array.isArray(ports) ? ports : []
  return {
    port: registered.port || 5900,
    wsPort: registered.wsPort || 8840,
    wsPath: registered.wsPath || '/screen0',
    sharing: !!registered.sharing,
    connections
  }
}

function monitorRows(monitors) {
  return (monitors || []).map((monitor, index) => ({
    id: String(monitor.id != null ? monitor.id : index),
    name: monitor.name || monitor.label || `Monitor ${index + 1}`,
    primary: !!monitor.primary,
    resolution: monitor.resolution || `${monitor.width || 0}x${monitor.height || 0}`,
    x: Number(monitor.x) || 0,
    y: Number(monitor.y) || 0,
    width: Number(monitor.width) || 0,
    height: Number(monitor.height) || 0,
    online: monitor.online !== false
  }))
}

module.exports = {
  CONNECTION_LABELS,
  CONNECTION_TONES,
  SOURCE_LABELS,
  connectionStatusView,
  updaterStatusView,
  overallStatusView,
  formatTimestamp,
  vncView,
  monitorRows,
  discoveryView,
  serverRows
}
