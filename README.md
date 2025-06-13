# CLEVER VNC Client

A desktop application built with Electron to provide screen casting and VNC functionality for the CLEVER system. This application enables remote screen monitoring, casting to video walls, and secure communication through websockify.

## Overview

CLEVER VNC Client enables seamless screen sharing and remote control by:

- Creating a secure websockify bridge between VNC and WebSockets
- Supporting hostname-based connections rather than IP-only addressing
- Providing audio streaming capabilities
- Enabling closed-loop communication with the CLEVER controller system
- Auto-reconnection and auto-startup functionality

## Installation

### Prerequisites

- Node.js (v14 or higher recommended)
- npm (v6 or higher recommended)
- VNC Server installed and running (e.g., TightVNC)

### Development Setup

1. Install global dependencies:
   ```bash
   npm install -g electron
   ```

2. Install project dependencies:
   ```bash
   npm install
   ```

3. Start the application in development mode:
   ```bash
   npm start
   ```

### Building the Application

Build for specific platforms:

- Windows 32-bit:
  ```bash
  npm run win32
  ```

- Windows 64-bit:
  ```bash
  npm run win64
  ```

- Ubuntu/Linux 32-bit:
  ```bash
  npm run ubuntu32
  ```

- Ubuntu/Linux 64-bit:
  ```bash
  npm run ubuntu64
  ```

## Configuration

The application can be configured through the `config.js` file:

- `pcname`: Computer name for identification (default: "DESKTOP")
- `cleverserver`: Array of CLEVER server addresses to connect to
- `autorestart`: Time interval for automatic client restart in milliseconds
- `autostartup`: Enable/disable application launch at system startup
- `audio`: Enable/disable audio streaming

## Using Hostname Instead of IP

CLEVER VNC Client uses hostname-based addressing which provides several benefits:
- More resilient to network changes (DHCP-assigned IPs)
- Easier identification of devices in the network
- Better integration with network security policies

The application automatically:
1. Detects the system hostname
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
- `audiostream.js`: Audio streaming functionality

## Troubleshooting

- **VNC Connection Issues**: Ensure VNC server is running on the computer. You can download TightVNC from https://www.tightvnc.com/download.php
- **Audio Not Working**: Verify that audio streaming is enabled in config.js
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

