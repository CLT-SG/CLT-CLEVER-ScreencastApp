'use strict'

/**
 * Lightweight HTTPS status surface for remote Video Wall / Console probes.
 * ScreencastApp keeps websockify on the same TLS port; this handler only
 * answers plain HTTP GETs so clients can tell bind/listen from VNC path issues.
 */
function createStatusHandler(options) {
  const opts = options || {}
  const getState = typeof opts.getState === 'function' ? opts.getState : () => ({})

  return function handleStatusRequest(req, res) {
    const url = String(req.url || '')
    const pathname = url.split('?')[0]
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' })
      res.end('Method Not Allowed')
      return
    }

    const state = getState() || {}
    if (pathname === '/status' || pathname === '/') {
      const body = JSON.stringify({
        status: 'running',
        service: 'CLT-CLEVER-ScreencastApp',
        bindAddress: state.bindAddress || null,
        port: state.port || null,
        hostname: state.hostname || null,
        hostnameLocal: state.hostnameLocal || null,
        ip: state.ip || null,
        screens: (state.screens || []).map((screen) => screen.path),
        vncTargets: state.screens || [],
        time: new Date().toISOString()
      })
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store'
      })
      if (req.method === 'HEAD') {
        res.end()
        return
      }
      res.end(body)
      return
    }

    if (pathname === '/screens') {
      const body = JSON.stringify({
        screens: state.screens || [],
        bindAddress: state.bindAddress || null,
        port: state.port || null
      })
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store'
      })
      if (req.method === 'HEAD') {
        res.end()
        return
      }
      res.end(body)
      return
    }

    res.writeHead(404, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    })
    res.end(JSON.stringify({
      error: 'not_found',
      path: pathname,
      screens: (state.screens || []).map((screen) => screen.path)
    }))
  }
}

module.exports = {
  createStatusHandler
}
