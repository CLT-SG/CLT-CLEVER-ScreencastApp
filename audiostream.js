/**
 * Legacy PCM WebSocket audio (audify / port 8091) was replaced by an
 * independent WebRTC + Opus session on the existing HTTPS server:
 *
 *   wss://<host>:<wsPort>/audio
 *
 * Capture lives in src/audio-engine.js and only runs when a remote
 * client is connected and the matching control is enabled.
 */
module.exports = null
