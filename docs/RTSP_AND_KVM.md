# ScreencastApp and RTSP / KVM video

CLT-CLEVER-ScreencastApp provides **VNC display capture** and optional
**WebRTC / Opus audio**. It is **not** in the RTSP camera or KVM-encoder video
pipeline.

| Source | Video | Audio |
| --- | --- | --- |
| Screencast type `VNC` | ScreencastApp / host VNC → CLEVER-node noVNC | ScreencastApp WebRTC (optional) |
| Screencast type `KVM-ENC` / `NOKVM-ENC` | Encoder RTSP → FFmpeg TCP remux (always-on) → MediaMTX → WebRTC | Remuxed to G.711 for WebRTC (AAC is not WebRTC-playable) |
| CCTV `RTSP` | Camera RTSP → FFmpeg remux → MediaMTX → WebRTC | Same WebRTC-safe audio remux when present |

Do **not** point MediaMTX `source:` at the encoder for Video Wall use: many
KVM boxes cause `RTP packets lost` / `payload is too short` and unstable
playback. CLEVER-Service remuxes through FFmpeg first.

Select the encoder’s **HDMI** (or intended) speaker/output so the RTSP stream
embeds that audio. Built-in speakers play locally only. After upgrading
CLEVER-Service ingest, force-sync MediaMTX paths.

Low-latency RTSP work in CLEVER-Service / CLEVER-node does not change
ScreencastApp’s VNC or audio signalling. Keep deploying ScreencastApp for VNC
desktops; encoder KVM boxes continue to publish RTSP that MediaMTX pulls
(with optional WebRTC-safe audio remux in CLEVER-Service).

### RTSP recovery ownership

Automatic recovery after an RTSP camera / KVM-ENC restart is handled by:

- **CLEVER-Service** — MediaMTX path lifecycle and stale-source force-replace
- **CLEVER-node** — WHEP session recreate, stall detection, UI reconnect states
- **CLEVER-Player** — hosts the webview only (no full-window reload required)

ScreencastApp must not be restarted or reconfigured for RTSP recovery. Leave
unrelated VNC sessions alone when encoder RTSP paths recover.
