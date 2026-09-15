'use strict'

function isIp(value) {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(String(value || '').trim())
}

function normalizeName(value) {
  return String(value || '').trim().replace(/\.+$/, '')
}

function connectionCandidates(hostname, hostnameLocal, ip) {
  const names = []
  ;[hostname, hostnameLocal, ip].forEach((value) => {
    const trimmed = normalizeName(value)
    if (trimmed && names.indexOf(trimmed) === -1) {
      names.push(trimmed)
    }
  })
  return names
}

function preferredHostname(hostname, hostnameLocal, ip) {
  const candidates = connectionCandidates(hostname, hostnameLocal, ip)
  return candidates[0] || ''
}

function deriveHostnameLocal(hostname, hostnameLocal) {
  const local = normalizeName(hostnameLocal)
  if (local) {
    return local
  }
  const host = normalizeName(hostname)
  if (host && /\.local$/i.test(host)) {
    return host
  }
  return null
}

function namesMatch(left, right) {
  const a = normalizeName(left).toLowerCase()
  const b = normalizeName(right).toLowerCase()
  if (!a || !b) {
    return false
  }
  if (a === b) {
    return true
  }
  return a.replace(/\.local$/i, '') === b.replace(/\.local$/i, '')
}

function splitHostScreen(value) {
  const raw = String(value || '').trim()
  const pos = raw.lastIndexOf(':')
  if (pos === -1) {
    return { hostname: raw, screen: null }
  }
  const suffix = raw.slice(pos + 1)
  if (!suffix || !/^(\d+|screen\d+)$/i.test(suffix)) {
    return { hostname: raw, screen: null }
  }
  return { hostname: raw.slice(0, pos), screen: suffix }
}

function websockifyPath(vncPort, screenno) {
  if (screenno !== undefined && screenno !== null && screenno !== '') {
    const raw = String(screenno)
    return raw.indexOf('screen') === 0 ? raw : ('screen' + raw)
  }
  if (vncPort !== undefined && vncPort !== null && vncPort !== '') {
    return 'screen' + Math.max(0, Number(vncPort) - 5900)
  }
  return 'screen0'
}

function websocketPort(wsPort, registered) {
  if (wsPort) {
    return Number(wsPort)
  }
  if (registered) {
    return 8840
  }
  return null
}

function vncPort(port, screenno) {
  if (port) {
    return Number(port)
  }
  const screen = Number(screenno == null ? 1 : screenno)
  if (!screen || screen <= 0) {
    return 5900
  }
  return 5900 + (screen - 1)
}

function describeCandidate(value) {
  const name = normalizeName(value)
  if (isIp(name)) {
    return {
      kind: 'ip',
      trying: 'Trying IP: ' + name,
      unavailable: 'IP unavailable'
    }
  }
  if (/\.local$/i.test(name)) {
    return {
      kind: 'fqdn',
      trying: 'Trying FQDN: ' + name,
      unavailable: 'FQDN unavailable'
    }
  }
  return {
    kind: 'hostname',
    trying: 'Trying hostname: ' + name,
    unavailable: 'Hostname unavailable'
  }
}

function deviceWebsockify(device) {
  if (!device) {
    return null
  }
  const registered = !!(device.deviceId || device.device_id || device.wsPort || device.ws_port)
  const wsPort = websocketPort(device.wsPort || device.ws_port, registered)
  if (!wsPort) {
    return null
  }
  const path = String(device.wsPath || device.path || '')
    .replace(/^\//, '') || websockifyPath(device.vncPort || device.vnc_port || 5900)
  return {
    wsPort,
    vncPort: vncPort(device.vncPort || device.vnc_port, device.screenno),
    path
  }
}

function applyRegisteredWebsockify(current, device) {
  const settings = current || {}
  const ws = deviceWebsockify(device)
  if (!ws) {
    return {
      port: settings.port || null,
      path: settings.path || '',
      vncPort: settings.vncPort || null
    }
  }
  const port = settings.port
  const path = String(settings.path || '').replace(/^\//, '')
  const legacyPort = !port || Number(port) === 8080 || Number(port) === 0
  const emptyPath = !path || path === 'websockify'
  return {
    port: legacyPort ? ws.wsPort : Number(port),
    path: emptyPath ? ws.path : path,
    vncPort: ws.vncPort
  }
}

function buildScreencastUrl(baseHost, value, extras) {
  const extra = extras || {}
  const parsed = splitHostScreen(value)
  const hostname = preferredHostname(parsed.hostname, extra.hostnameLocal, extra.ip)
  const params = []
  if (hostname) {
    params.push('hostname=' + encodeURIComponent(hostname))
  }
  if (extra.hostnameLocal && normalizeName(extra.hostnameLocal) !== hostname) {
    params.push('hostname_local=' + encodeURIComponent(normalizeName(extra.hostnameLocal)))
  }
  if (extra.ip && normalizeName(extra.ip) !== hostname) {
    params.push('ip=' + encodeURIComponent(normalizeName(extra.ip)))
  }
  const registered = !!(extra.deviceId || extra.wsPort)
  const path = extra.path || (parsed.screen && registered ? websockifyPath(extra.vncPort, parsed.screen) : '')
  if (path) {
    params.push('path=' + encodeURIComponent(path))
    params.push('screen=' + encodeURIComponent(path))
  } else if (parsed.screen) {
    params.push('screen=' + encodeURIComponent(
      String(parsed.screen).indexOf('screen') === 0 ? parsed.screen : ('screen' + parsed.screen)
    ))
  }
  const port = websocketPort(extra.wsPort, registered)
  if (port) {
    params.push('port=' + encodeURIComponent(String(port)))
  }
  if (extra.vncPort) {
    params.push('vnc_port=' + encodeURIComponent(String(extra.vncPort)))
  }
  return (baseHost || '') + (params.length ? ('?' + params.join('&')) : '')
}

module.exports = {
  isIp,
  normalizeName,
  connectionCandidates,
  preferredHostname,
  deriveHostnameLocal,
  namesMatch,
  splitHostScreen,
  websockifyPath,
  websocketPort,
  vncPort,
  describeCandidate,
  deviceWebsockify,
  applyRegisteredWebsockify,
  buildScreencastUrl
}
