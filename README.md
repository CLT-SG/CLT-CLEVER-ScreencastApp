# CLEVER Screencast KVM

CLEVER Screencast KVM is a desktop application built with Electron that provides Screencast KVM functionality with both IP-based and hostname-based connections.

## Features

- Multiple connection options: IP address, short hostname for windows, and FQDN (.local) hostname for linux 
- Automatic detection of available VNC ports (5900-5905)
- WebSocket-based VNC streaming
- Audio streaming through WebRTC (optional, independent from VNC)
- Auto-restart functionality
- System tray integration
- Frameless window design

## Connection Options

The application supports multiple ways to connect to the VNC server:

1. **IP Address**: Traditional IP-based connection (e.g., `192.168.1.100:5900`)
2. **Short Hostname**: Connect using just the computer name (e.g., `USER-PC:5900`)
3. **FQDN Hostname**: Connect using hostname.local format (e.g., `USER-PC.local:5900`)

The hostname options make it easier to connect within local networks, especially with DHCP where IP addresses may change.

## System Requirements

- Operating System: Windows 10 or later, macOS 10.14+, or modern Linux distributions
- VNC server installed and running (e.g., TightVNC, UltraVNC, RealVNC)

## Installation

1. Download the latest release for your platform from the releases page
2. Run the installer and follow the prompts
3. Launch CLEVER Screencast KVM from the Start Menu or Applications folder

## Configuration

The client allows customization of several settings:

- **Auto-startup**: Launch automatically when the computer starts
- **Audio streaming**: Optional WebRTC system audio and microphone (disabled by default)
- **Auto-restart interval**: Set the frequency to refresh the connection

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

## License

This is proprietary software owned by Closed-loop Technology Pte. Ltd. See LICENSE file for more information.

## Support

For support, please contact Closed-loop Technology Pte. Ltd:
- Email: support@closed-loop.biz
- Website: www.closed-loop.biz
2. Registers the hostname with the CLEVER controller
3. Uses the hostname for VNC connection establishment

## Websockify Bridge

The application creates a websockify bridge that:
- Converts VNC's TCP-based protocol to WebSocket protocol
- Scans ports 5900-5905 to detect available VNC servers
- Creates separate WebSocket endpoints for each detected VNC server
- Enables secure connections using TLS/SSL

## Project Structure

- `/src`: Application source code
  - `/assets`: CSS, JavaScript, and media files
  - `index.html`: Main application interface
  - `client.html`: Client connection interface
  - `master.html`: Master control interface
- `server.js`: HTTPS server implementation
- `websockify.js`: WebSockets to TCP proxy implementation
- `index.js`: Main Electron application logic
- `preload.js`: Preload script for renderer process
- `config.js`: Application configuration
- `audiostream.js`: Legacy audio entry (WebRTC now lives in `lib/audio-*` and `src/audio-engine.js`)
- `docs/AUDIO.md`: Audio transport, platform limits, and troubleshooting

## Troubleshooting

- **VNC Connection Issues**: Ensure VNC server is running on the computer. You can download TightVNC from https://www.tightvnc.com/download.php
- **Audio Not Working**: Audio is off by default. Enable System Audio in the Audio panel and see [docs/AUDIO.md](docs/AUDIO.md).
- **Auto-startup Issues**: Check system permissions for startup applications

## Changelog

For a detailed list of changes between versions, please see the [CHANGELOG.md](CHANGELOG.md) file.

## Contact

For support or inquiries, contact:
- Website: [www.closed-loop.biz](https://www.closed-loop.biz)
- Email: sales@closed-loop.biz

## License

Copyright © 2000-2023, Closed-loop Technology Pte. Ltd. All rights reserved.

This project is licensed under proprietary terms. For more details, see the [LICENSE](LICENSE) file.

