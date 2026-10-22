'use strict'

/**
 * Drop interactive RFB client messages for view-only WebSocket sessions.
 * Message type is the first byte of client → server RFB traffic after the
 * handshake. We only filter once the TCP pipe is bidirectional; early
 * ProtocolVersion / Security handshake bytes are never type 4/5/6 in practice
 * for standard VNC, but we still only drop when length >= 1 and type matches.
 *
 * Types dropped: KeyEvent(4), PointerEvent(5), ClientCutText(6)
 * Types kept: SetPixelFormat(0), SetEncodings(2), FramebufferUpdateRequest(3), …
 */

const DROP_TYPES = new Set([4, 5, 6])

function isViewOnlyRequest(req) {
  try {
    const raw = (req && req.url) || ''
    const qIndex = raw.indexOf('?')
    if (qIndex === -1) {
      return false
    }
    const params = new URLSearchParams(raw.slice(qIndex + 1))
    const value = (params.get('view_only') || params.get('viewOnly') || params.get('session_mode') || '').toLowerCase()
    return value === '1' || value === 'true' || value === 'view-only' || value === 'viewonly'
  } catch {
    return false
  }
}

function filterClientPayload(payload, viewOnly) {
  if (!viewOnly) {
    return payload
  }
  const buf = Buffer.isBuffer(payload) ? payload : Buffer.from(payload)
  if (buf.length < 1) {
    return buf
  }
  const type = buf[0]
  if (DROP_TYPES.has(type)) {
    return null
  }
  return buf
}

module.exports = {
  DROP_TYPES,
  isViewOnlyRequest,
  filterClientPayload
}
