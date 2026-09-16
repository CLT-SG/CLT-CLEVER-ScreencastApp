# Development

## Requirements

- **Node.js 18+** (Node 22 recommended — see [`.nvmrc`](../.nvmrc))
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
| `server.scanPorts` | VNC ports to probe (`5900`–`5905`) |
| `cleverService` | Discovery UDP port and default HTTP port. Host/IP are **never** hardcoded |
| `autostartup` / `autoshare` | Tray and dashboard checkboxes |
| `audio` / `systemAudio` / `microphone` / `speakerOutput` / `twoWayAudio` | Independent WebRTC audio (dashboard Audio panel; off by default) |
| `autorestart` | Cache-clear interval |

CLEVER-Service connection mode (automatic discovery vs manual host/port) is stored in Electron `userData` as `clever-service.json`. The stable device id is stored as `device-id.json` in the same directory.

## Architecture (do not duplicate)

The dashboard **consumes** existing modules. It does not open a second registration, discovery, or VNC channel.

| Module | Responsibility |
| --- | --- |
| `index.js` | Electron main process, window, tray, IPC |
| `lib/connection-manager.js` | Discovery, registration, heartbeat, reconnect, monitor sync |
| `lib/discovery.js` | UDP CLEVER-Service discovery |
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
- [Electron Updater](./UPDATES.md)
- [GitHub Actions and GitHub Releases](./RELEASE.md)
- [Testing](./TESTING.md)
