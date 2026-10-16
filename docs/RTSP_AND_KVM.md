# ScreencastApp and RTSP / KVM video

CLT-CLEVER-ScreencastApp provides **VNC display capture** and optional
**WebRTC / Opus audio**. It is **not** in the RTSP camera or KVM-encoder video
pipeline.

| Source | Video | Audio |
| --- | --- | --- |
| Screencast type `VNC` | ScreencastApp / host VNC → CLEVER-node noVNC | ScreencastApp WebRTC (optional) |
| Screencast type `KVM-ENC` / `NOKVM-ENC` | Hardware encoder RTSP → MediaMTX → WebRTC | Encoder RTSP audio (if present) via MediaMTX |
| CCTV `RTSP` | Camera RTSP → MediaMTX → WebRTC | Camera RTSP audio via MediaMTX |

Low-latency RTSP work in CLEVER-Service / CLEVER-node does not change
ScreencastApp’s VNC or audio signalling. Keep deploying ScreencastApp for VNC
desktops; encoder KVM boxes continue to publish RTSP that MediaMTX pulls
directly (no FFmpeg republish by default).
