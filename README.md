# CLEVER Screencast KVM

CLEVER Screencast KVM is an Electron-based desktop client for sharing a local VNC desktop to CLEVER. It supports hostname/IP discovery, automatic registration with CLEVER servers, and a tray-friendly UI for monitoring and controlling the screencast connection.

## Recent updates

This repository has been modernized for the 2026 client release. The current implementation includes:

- A tray-resident Electron app with single-instance locking, minimize-to-tray behavior, and graceful shutdown
- VNC reachability monitoring with retry logic, recovery detection, and failure alerts
- A WebSocket-to-VNC bridge that binds to the local network and uses the configured VNC target
- CLEVER registration with hostname, IP, viewer count, and monitor geometry metadata
- Persistent JSON-backed settings for auto-connect, start-on-boot, ports, and registration intervals
- Auto-update checks and packaged app integration
- A secure preload bridge and renderer state dashboard for VNC and casting status

## Core features

- Multiple connection targets: direct IP, Windows hostname, and .local hostname
- Automatic VNC monitoring on the local machine
- WebSocket-based screencast flow for remote viewers
- Auto-connect and auto-start-on-boot support
- Multi-monitor metadata registration for better viewer cropping/layout handling
- System tray controls and background operation
- Frameless desktop UI for quick remote access

## Connection options

The application supports multiple ways to connect to the screen source:

1. **IP address**: Traditional direct connection such as `192.168.1.100:5900`
2. **Short hostname**: Local machine name such as `USER-PC:5900`
3. **FQDN hostname**: `.local` hostname such as `USER-PC.local:5900`

This makes the app easier to use in DHCP-heavy LAN environments where device addresses can change.

## System requirements

- Windows 10+, macOS 10.14+, or modern Linux distributions
- A VNC server installed and running on the source machine
- Network access to the CLEVER controller or remote viewer environment

## Installation

1. Download the latest release for your platform from the releases page
2. Run the installer and follow the prompts
3. Launch CLEVER Screencast KVM from the Start menu, Applications folder, or tray

## Configuration

The client allows customization of several settings:

- **Auto-connect**: Start casting automatically when the VNC server is reachable
- **Start on boot**: Launch automatically when the OS starts
- **VNC port**: Local VNC source port (default `5900`)
- **WebSocket port**: Proxy port used by remote viewers (default `8080`)
- **Registration interval**: Frequency for re-registering with CLEVER servers
- **Cache clear interval**: Periodic cleanup of local app cache

## Project structure

- `index.js`: Electron application bootstrap and lifecycle
- `lib/`: Business logic for settings, tray, VNC monitoring, and casting
- `src/index.html`: Main window UI
- `src/preload.js`: Secure bridge between the renderer and Electron IPC
- `src/renderer.js`: Client-side state rendering and UI interactions
- `package.json`: project version, dependencies, and packaging configuration
- `CHANGELOG.md`: release history and notable changes

## Development

### Setup

```bash
# Clone the repository
git clone https://github.com/closed-loop/clever-vncclient.git

# Navigate into the project directory
cd clever-vncclient

# Install dependencies
npm install

# Run the application in development mode
npm start
```

### Building

```bash
# Build for current platform
npm run build

# Build for specific platforms
npm run win64
npm run win32
npm run ubuntu64
npm run ubuntu32
```

## Troubleshooting

- **VNC connection issues**: Confirm the source machine is running a VNC server and the configured port is reachable.
- **No viewer registration**: Check network connectivity to the configured CLEVER servers and confirm the host has a valid external IPv4 address.
- **Application not appearing**: Use the tray icon or the app’s start-on-boot setting to re-open the window.
- **Port already in use**: Change the WebSocket port in the settings or free the conflicting process.

## Changelog

For a detailed list of changes between versions, please see [CHANGELOG.md](CHANGELOG.md).

## Contact

For support or inquiries, contact:
- Website: [www.closed-loop.biz](https://www.closed-loop.biz)
- Email: sales@closed-loop.biz

## License

Copyright © 2000-2026, Closed-loop Technology Pte. Ltd. All rights reserved.

This project is licensed under proprietary terms. For more details, see the LICENSE file in the repository.

