# Optional WebRTC Audio

CLT-CLEVER-ScreencastApp streams **system audio and microphone over WebRTC**, independently from VNC.

## Architecture

```
Player / Preview / noVNC
        │  RFB over WebSocket   (/screen0 …)     ← unchanged VNC
        │  WebRTC signaling     (/audio)         ← independent
        ▼
ScreencastApp HTTPS :8840
        ├── websockify → local VNC 5900+
        └── audio signaling → hidden Chromium audio engine
                              (Opus, capture only while a client is connected)
```

Audio never shares the VNC framebuffer, RFB encodings, or screenshot path.

## Defaults

| Control | Default |
| --- | --- |
| System Audio | Disabled |
| Microphone | Disabled |
| Speaker / Output | Enabled (used only after a stream exists) |
| Two-way Audio | Disabled |

Capture and encoding start only when:

1. The matching control is enabled, **and**
2. A remote client is connected to `wss://<host>:<wsPort>/audio`.

Disabling audio tears down capture. It does **not** reconnect or restart VNC.

## Transport

- **Media:** WebRTC, Opus, ~48 kbps, 10 ms ptime, in-band FEC
- **Signaling:** JSON WebSocket on the existing HTTPS server, path `/audio`
- **ICE:** host candidates (LAN). No TURN. Failures are reported without touching VNC.

## Platform support

| OS | System audio | Microphone capture | Microphone injection |
| --- | --- | --- | --- |
| Windows | Yes (desktop loopback / Stereo Mix) | Yes | Yes if VB-Audio Cable / VoiceMeeter is installed |
| Linux | Yes when a Pulse/PipeWire monitor exists | Yes | Yes if a null/virtual sink is present |
| macOS | Only with a virtual device (BlackHole, Loopback) | Yes | Same virtual device |

Unsupported features are advertised as `unsupported` and fail gracefully.

## Configuration (`config.js`)

```js
exports.audio = false          // legacy alias for systemAudio
exports.systemAudio = false
exports.microphone = false
exports.speakerOutput = true
exports.twoWayAudio = false
```

An existing `exports.audio = true` still enables system audio.

## Troubleshooting

Logs are written to `~/clevervnc-log/` with an `[audio]` prefix.

| Symptom | Check |
| --- | --- |
| Status stays Disabled | Enable System Audio or Microphone in the Audio panel |
| Status stays Waiting for Client | No viewer has joined `wss://host:wsPort/audio` yet. Open the source in CLEVER-Player Video Wall/Console with System Audio enabled here (or Audio Stream under `/screencasts`). VNC alone (`/screen0`) does not register an audio client. Check **Clients** stays at 0 if audio seems stuck. |
| Status Error, VNC still works | Expected. Read the error line; VNC is independent |
| macOS has no system audio | Install BlackHole (or similar) and restart |
| Player cannot hear audio | Confirm Clients > 0 and Capture Active; confirm `wss://host:wsPort/audio` is reachable |
| Remote voice not injected | No virtual cable detected; playback uses the default speakers |

## End-to-end viewer path

1. Enable **System Audio** in ScreencastApp (host policy). Status shows **Waiting for Client** until a viewer joins `/audio`.
2. Optionally enable **Audio Stream** under CLEVER-Service `/screencasts` (`has_audio` → `audio_system=1` on preview URLs).
3. Open the source in CLEVER-Player Video Wall or Console.
4. CLEVER-node resolves the device, then auto-registers on `/audio` when `hasAudio` is true (Audio Stream **or** host System Audio capability).
5. ScreencastApp shows **Clients ≥ 1** and **Capture Active** / **Audio Streaming**; desktop audio plays in the viewer.

Capture still starts only while a remote `/audio` client is connected. Turning System Audio off on the host (and clearing Audio Stream) stops new auto-subscribe; Settings can still enable audio manually when the Audio section is visible.

## Reconnection

Audio reconnects on its own (`reconnecting` → `connected`). VNC / noVNC / websockify sessions are left alone.
