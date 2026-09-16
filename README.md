# CLEVER Screencast KVM

Electron desktop application for CLEVER Screencast KVM: local VNC/screencast publishing, CLEVER-Service discovery and registration, and a compact operations dashboard.

## Features

- CLEVER-Service LAN discovery, multi-server status, registration, heartbeat, and reconnect
- Stable device ID, hostname, FQDN (`.local`), and IP reporting
- Monitor detection and live layout sync (name, primary, resolution, position, size)
- VNC port scan (`5900`–`5905`) and websockify/WebSocket publishing
- Optional WebRTC system audio and microphone (independent from VNC; off by default)
- Auto-start, auto-share, tray, and auto-restart settings
- Electron Updater from GitHub Releases (Check for Updates + automatic check/download)
- Windows, Linux, and macOS packaged builds via GitHub Actions

The dashboard **displays** the existing connection, monitor, VNC, and audio services. It does not replace or duplicate CLEVER-Service or CLEVER-node protocols.

## Connection options

1. **IP address** — `192.168.1.100:5900`
2. **Short hostname** — `USER-PC:5900`
3. **FQDN** — `USER-PC.local:5900`

## Requirements

- Windows 10+, macOS 10.14+, or a modern Linux distribution
- A VNC server running on the machine (for example [TightVNC](https://www.tightvnc.com/download.php))

## Installation

Download the latest Windows, Linux, or macOS package from the GitHub Releases page and run the installer. Packaged installs can check GitHub Releases for updates (see [docs/UPDATES.md](docs/UPDATES.md)).

## Documentation

| Topic | File |
| --- | --- |
| Project setup and architecture | [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) |
| LAN discovery and firewall | [docs/DISCOVERY.md](docs/DISCOVERY.md) |
| Optional WebRTC audio | [docs/AUDIO.md](docs/AUDIO.md) |
| Electron Updater | [docs/UPDATES.md](docs/UPDATES.md) |
| Versioning, GitHub Actions, GitHub Releases | [docs/RELEASE.md](docs/RELEASE.md) |
| Test plan | [docs/TESTING.md](docs/TESTING.md) |

```bash
npm install
npm start
npm test
```

## Project structure

- `index.js` — Electron main process
- `lib/` — CLEVER-Service connection, discovery, registration, monitors, updater, WebRTC audio
- `src/index.html` / `src/renderer.js` / `src/assets/css/style.css` — dashboard UI
- `src/audio-engine.js` — hidden Chromium capture/encode engine
- `preload.js` — context-isolated IPC bridge
- `websockify.js` / `server.js` — WebSocket-to-VNC bridge (audio signaling shares the HTTPS port on `/audio`)
- `.github/workflows/` — CI and multi-platform release

## Troubleshooting

- **Cannot discover a remote CLEVER-Service**: confirm UDP 8842 is allowed on both machines and that `php artisan screencast:discover` is running. See [docs/DISCOVERY.md](docs/DISCOVERY.md). Manual host/IP still works.
- **VNC connection issues**: ensure a VNC server is running. TightVNC: https://www.tightvnc.com/download.php
- **Audio not working**: audio is off by default. Enable System Audio or Microphone in the Audio panel; see [docs/AUDIO.md](docs/AUDIO.md). Enabling audio does not start VNC.
- **Update failed**: expected for `npm start` and when no GitHub Release exists. The rest of the app keeps running.

## Changelog

See [CHANGELOG.md](CHANGELOG.md).

## License

Copyright © 2000-2026, Closed-loop Technology Pte. Ltd. All rights reserved.

This project is licensed under proprietary terms. See [LICENSE](LICENSE).

Support: support@closed-loop.biz · [www.closed-loop.biz](https://www.closed-loop.biz)
