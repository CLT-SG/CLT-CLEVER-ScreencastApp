# CLEVER ScreencastApp

CLEVER ScreencastApp is an Electron desktop application for Screencast KVM: local VNC discovery, Websockify bridging, optional audio, and registration with CLEVER-Service.

## Dashboard

The main window is a management dashboard. It keeps status, connection, monitor, VNC, update, and control information visible without extra pages:

- Application status and sharing state
- CLEVER-Service host reachability
- Device IP, hostname, and FQDN
- Attached monitor information
- Detected VNC endpoints (ports 5900-5905)
- GitHub Release update status
- Start / Stop / Restart and startup settings

Discovery, registration, monitor detection, VNC/Websockify, and Screencast-VNC behavior are unchanged.

## Auto Update

Packaged builds check GitHub Releases for this repository through electron-updater. The dashboard shows:

```text
Checking for updates...
You are using the latest version.
Update available: v1.2.0
Downloading update...
Update downloaded.
Restart to install.
```

Updates do not restart an active Screencast/VNC session. See [docs/auto-update.md](docs/auto-update.md) for configuration, GitHub Actions, versioning, platform packages, and troubleshooting.

## Connection Options

The application supports multiple ways to connect to the VNC server:

1. **IP Address**: Traditional IP-based connection (e.g., `192.168.1.100:5900`)
2. **Short Hostname**: Connect using just the computer name (e.g., `USER-PC:5900`)
3. **FQDN Hostname**: Connect using hostname.local format (e.g., `USER-PC.local:5900`)

## System Requirements

- Windows 10 or later, macOS 10.14+, or a modern Linux distribution
- A VNC server installed and running (for example TightVNC, UltraVNC, or RealVNC)

## Installation

Download the latest Windows, Linux, or macOS package from GitHub Releases and run the installer.

## Configuration

`config.js` stores:

- **cleverserver**: CLEVER-Service hosts shown on the dashboard
- **Auto-startup**: Launch when the computer starts
- **Auto share**: Start sharing after launch
- **Audio streaming**: Enable or disable audio
- **Window size**: Dashboard window defaults

## Development

```bash
git clone https://github.com/clt-sg/clt-clever-screencastapp.git
cd clt-clever-screencastapp
npm install
npm test
npm start
```

### Building

```bash
npm run build      # current platform, do not publish
npm run win64      # Windows NSIS
npm run linux      # Linux AppImage + deb
npm run mac        # macOS dmg + zip (x64 and arm64)
```

Release tags (`v*`) trigger GitHub Actions, which publish artifacts and electron-updater metadata. See [docs/auto-update.md](docs/auto-update.md).

## Websockify Bridge

The application creates a websockify bridge that:

- Converts VNC TCP to WebSocket
- Scans ports 5900-5905 for available VNC servers
- Creates a WebSocket endpoint for each detected server

## Project Structure

- `/src`: Dashboard HTML, CSS, and renderer
- `index.js`: Electron main process
- `preload.js`: Renderer IPC bridge
- `update/`: Electron Updater status helpers
- `server.js`: HTTPS status server
- `websockify.js`: WebSockets to TCP proxy
- `config.js`: Application configuration
- `audiostream.js`: Audio streaming
- `.github/workflows/release.yml`: Windows / Linux / macOS publish pipeline

## Troubleshooting

- **VNC Connection Issues**: Ensure a VNC server is running. TightVNC is available from https://www.tightvnc.com/download.php
- **Audio Not Working**: Verify that audio streaming is enabled in config.js
- **Updates**: See [docs/auto-update.md](docs/auto-update.md)

## Changelog

See [CHANGELOG.md](CHANGELOG.md).

## License

Copyright © 2000-2026, Closed-loop Technology Pte. Ltd. All rights reserved.
