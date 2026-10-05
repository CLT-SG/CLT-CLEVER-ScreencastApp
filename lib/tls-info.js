'use strict'

const crypto = require('crypto')

/**
 * Summarize the HTTPS/websockify certificate so startup logs show expiry
 * before remote Video Wall clients hit WebSocket Handshake Failed.
 */
function describeCertificate(pem) {
  const text = Buffer.isBuffer(pem) ? pem.toString('utf8') : String(pem || '')
  if (!text.trim()) {
    return {
      ok: false,
      error: 'empty certificate'
    }
  }
  try {
    const cert = new crypto.X509Certificate(text)
    const validTo = new Date(cert.validTo)
    const validFrom = new Date(cert.validFrom)
    const now = Date.now()
    const expired = Number.isFinite(validTo.getTime()) && validTo.getTime() < now
    const notYetValid = Number.isFinite(validFrom.getTime()) && validFrom.getTime() > now
    return {
      ok: !expired && !notYetValid,
      subject: cert.subject,
      issuer: cert.issuer,
      validFrom: cert.validFrom,
      validTo: cert.validTo,
      expired,
      notYetValid,
      san: cert.subjectAltName || null
    }
  } catch (err) {
    return {
      ok: false,
      error: err && err.message ? err.message : String(err)
    }
  }
}

function attachTlsDiagnostics(server, logger) {
  if (!server || typeof server.on !== 'function') {
    return
  }
  const log = logger || console
  server.on('tlsClientError', (err, tlsSocket) => {
    const remote = (tlsSocket && tlsSocket.remoteAddress) || 'unknown'
    const port = tlsSocket && tlsSocket.remotePort
    log.warn(`[tls] client handshake failed from ${remote}` +
      (port ? (':' + port) : '') +
      ` reason=${err && err.message ? err.message : err}`)
  })
  server.on('secureConnection', (tlsSocket) => {
    const remote = (tlsSocket && tlsSocket.remoteAddress) || 'unknown'
    const port = tlsSocket && tlsSocket.remotePort
    log.info(`[tls] secure connection from ${remote}` +
      (port ? (':' + port) : '') +
      ` protocol=${tlsSocket.getProtocol ? tlsSocket.getProtocol() : 'n/a'}`)
  })
  server.on('connection', (socket) => {
    const remote = (socket && socket.remoteAddress) || 'unknown'
    const port = socket && socket.remotePort
    log.info(`[tcp] inbound connection from ${remote}` +
      (port ? (':' + port) : ''))
  })
}

module.exports = {
  describeCertificate,
  attachTlsDiagnostics
}
