const url = require('url')
const WebSocket = require('ws')

const routers = new WeakMap()

function pathnameOf(request) {
  try {
    return url.parse(request.url || '').pathname || ''
  } catch (err) {
    return ''
  }
}

function getRouter(server, logger) {
  if (routers.has(server)) {
    return routers.get(server)
  }
  const routes = []
  server.on('upgrade', (request, socket, head) => {
    const pathname = pathnameOf(request)
    const route = routes.find((entry) => entry.match(pathname, request))
    if (!route) {
      if (logger) logger.warn(`[ws] no route for ${pathname}`)
      socket.destroy()
      return
    }
    route.wss.handleUpgrade(request, socket, head, (ws) => {
      route.wss.emit('connection', ws, request)
    })
  })
  const router = { routes, add(match, wss) { routes.push({ match, wss }) } }
  routers.set(server, router)
  return router
}

function createRoutedServer(server, match, options, logger) {
  const wss = new WebSocket.Server(Object.assign({
    noServer: true,
    perMessageDeflate: false
  }, options || {}))
  getRouter(server, logger).add(match, wss)
  return wss
}

function isAudioPath(pathname) {
  const path = String(pathname || '')
  return path === '/audio' || path.indexOf('/audio/') === 0 || path.indexOf('/audio?') === 0
}

module.exports = {
  getRouter,
  createRoutedServer,
  isAudioPath,
  pathnameOf
}
