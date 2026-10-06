# Development

## Requirements

- **Node.js 18+** (Node 22 recommended see [`.nvmrc`](../.nvmrc))
- **npm 9+**
- A VNC server on the local machine (for example TightVNC, UltraVNC, or RealVNC) listening on port `5900` (additional screens on `5901`–`5905` are detected automatically)
- Optional: a running [CLEVER-Service](https://github.com/CLT-SG/CLEVER-Service) instance on the LAN for discovery, registration, and heartbeats

Do **not** install Electron globally. The project pins Electron as a local `devDependency`.

## Setup

```bash
git clone https://github.com/CLT-SG/CLT-CLEVER-ScreencastApp.git
cd CLT-CLEVER-ScreencastApp
npm install
npm start
```

`npm start` launches the Electron main process (`index.js`). The dashboard renderer loads `src/index.html` after the local VNC port check succeeds.

## Scripts

| Script | Description |
| --- | --- |
| `npm start` | Run the application in development |
| `npm test` | Node.js test runner (`test/*.test.js`) |
| `npm run build` | Unpacked production app (`electron-builder --dir`) |
| `npm run package` | Installer for the current OS |
| `npm run package:win` | Windows NSIS x64 |
| `npm run package:linux` | Linux AppImage + `.deb` x64 |
| `npm run package:mac` | macOS `.dmg` + `.zip` x64 |
| `npm run release` | Package and publish to GitHub Releases (CI) |

Legacy aliases `win32`, `win64`, `ubuntu32`, and `ubuntu64` still wrap `electron-builder`.

## Configuration

Runtime settings live in [`config.js`](../config.js):

| Setting | Purpose |
| --- | --- |
| `window` | Dashboard size (`1180×760` by default, resizable) |
| `server.port` | HTTPS / websockify port (`8840`) |
| `server.bindAddress` | Listen address for remote Video Wall / Console clients (`0.0.0.0`) |
| `server.scanPorts` | VNC ports to probe (`5900`–`5905`) |
| `cleverService` | Discovery UDP port, default HTTP port, discovery timeout/retry. Host/IP are **never** hardcoded |
| `autostartup` / `autoshare` | Tray and dashboard checkboxes |
| `appearance.autoHideToTray` | After startup, hide the main window to the tray when it is not focused (default `true`) |
| `audio` / `systemAudio` / `microphone` / `speakerOutput` / `twoWayAudio` | Independent WebRTC audio (dashboard Audio panel; off by default) |
| `autorestart` | Cache-clear interval |

The HTTPS/websockify server must listen on `0.0.0.0`, not `127.0.0.1`. Remote CLEVER Video Wall and Console browsers open `wss://<ScreencastApp-LAN-IP>:8840/screen0` directly. Registration with CLEVER-Service only proves discovery; it does not open the host firewall. Allow inbound TCP `8840` on the ScreencastApp machine for LAN clients.

Local VNC is dialed via the machine LAN IP when known (`192.168.x.x:5900`), with `127.0.0.1:5900` as a TCP fallback. Dialing only loopback makes UltraVNC/TightVNC reject RFB with `Sorry, loopback connections are not enabled` unless "Allow Loopback Connections" is enabled in the VNC server.

`GET https://<host>:8840/status` returns the bind address and published `/screenN` paths for remote probes.

TLS materials live in `cert/example.com+5.pem` and `cert/example.com+5-key.pem`. Startup logs print the certificate `validTo` date. An expired cert makes CLEVER Player report `WebSocket Handshake Failed` even when `/status` probes that ignore certificate errors still PASS. Regenerate with:

```bash
openssl req -x509 -newkey rsa:2048 -sha256 -days 3650 -nodes \
  -keyout cert/example.com+5-key.pem \
  -out cert/example.com+5.pem \
  -subj "/O=CLT CLEVER ScreencastApp/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,DNS:example.com,DNS:*.local,IP:127.0.0.1" \
  -addext "extendedKeyUsage=serverAuth" \
  -addext "keyUsage=digitalSignature,keyEncipherment"
```

CLEVER-Service connection mode (automatic discovery vs manual host/port) is stored in Electron `userData` as `clever-service.json`. The stable device id is stored as `device-id.json` in the same directory.

## Architecture (do not duplicate)

The dashboard **consumes** existing modules. It does not open a second registration, discovery, or VNC channel.

| Module | Responsibility |
| --- | --- |
| `index.js` | Electron main process, window, tray, IPC |
| `lib/startup-window.js` | Focus-aware startup auto-hide-to-tray policy (no service shutdown) |
| `lib/connection-manager.js` | Discovery, registration, heartbeat, reconnect, monitor sync |
| `lib/discovery.js` | UDP CLEVER-Service discovery (LAN interfaces, timeout/retry, multi-server) |
| `lib/server-session.js` | Per-server probe, registration, heartbeat, reconnect |
| `lib/registration.js` | `/api/screencast-app/*` HTTP API |
| `lib/monitors.js` | Display detection |
| `lib/updater.js` | Electron Updater (isolated from the modules above) |
| `lib/audio-bridge.js` | Independent WebRTC signaling on `/audio` (does not share VNC/RFB) |
| `lib/dashboard-state.js` | Pure view-model mapping for the dashboard |
| `preload.js` | Context-isolated IPC bridge |
| `src/renderer.js` | Dashboard UI |
| `src/audio-engine.js` | Hidden Chromium capture/encode engine |

## Logs

Logs are written to `~/clevervnc-log/YYYY-MM-DD.log` via `electron-log`. Update events use the same logger with an `Update status:` prefix.

## Related documentation

- [Optional WebRTC audio](./AUDIO.md)
- [LAN discovery](./DISCOVERY.md)
- [Electron Updater](./UPDATES.md)
- [GitHub Actions and GitHub Releases](./RELEASE.md)
- [Testing](./TESTING.md)
