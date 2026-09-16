# Changelog

All notable changes to the CLEVER Screencast KVM will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.4.0] - 2026-09-16

### Added
- Multi-server CLEVER-Service discovery list with per-server connection and registration state
- Discovery timeout, retry/backoff, network-change rediscovery, and Start / Stop / Refresh controls
- Per-server Register, Unregister, and Reconnect actions
- LAN interface filtering and per-interface UDP probes
- Unicast UDP /24 probe and HTTP `/api/screencast-app/discover` scan on ports 80 and 8000 when broadcast is blocked
- Discovery documentation (`docs/DISCOVERY.md`) including Windows/Linux/macOS firewall notes

### Changed
- Automatic discovery no longer stops after the first server reply
- Discovery prefers the UDP source IPv4 when a server advertises `127.0.0.1` or another unusable address
- Compatible npm updates: Express 4.22, `ws` 8.21, `systeminformation` 5.33, `electron-log` 5.4, `electron-updater` 6.8
- Electron remains 22.3.x and electron-builder remains 24.13.x so native packaging and the current updater architecture stay intact. Remaining npm audit findings are in those packages (`tar` / `app-builder-lib` / Electron CVEs) and require a future major upgrade.

### Fixed
- Remote LAN discovery failed when CLEVER-Service announced a loopback IP from hostname resolution
- Broadcast probes could be sent only from an unbound socket, which is unreliable on Windows and multi-homed hosts
- Directed broadcasts were computed only for `/8`, `/16`, and `/24` networks

## [2.2.0] - 2026-09-15

### Added
- Electron Updater with Check for Updates, automatic check/download, and Restart and Install
- GitHub Releases as the update provider (`CLT-SG/CLT-CLEVER-ScreencastApp`)
- GitHub Actions CI and Windows/Linux/macOS release workflow
- Compact professional dashboard for connection, monitors, VNC, audio, and management
- Optional independent WebRTC system audio and microphone (off by default; see docs/AUDIO.md)
- Dashboard last-heartbeat, registration, device ID, and update status from existing services
- Deployment, updater, and release documentation

### Changed
- Default window is a resizable landscape dashboard instead of the tall utility layout
- Menu and tray Check for Updates now call the updater module instead of a stub dialog
- Dashboard stays visible after launch (close still hides to the tray)

### Fixed
- VNC rescan now refreshes the connection table instead of leaving a spinner

## [2.1.0] - 2023-11-14

### Added
- Support for Electron 22.x
- Enhanced WebRTC audio streaming with better compatibility
- Improved security with contextIsolation enabled
- Modern IPC communication between main and renderer processes
- Better error handling throughout the application

### Changed
- Updated dependencies to latest compatible versions
- Modernized code with current JavaScript standards
- Improved security with proper preload scripts and IPC handling
- Enhanced WebRTC implementation with latest standards
- Improved audio visualization with smoother rendering

### Fixed
- Memory leak in WebSocket connections
- Connection stability issues
- Potential security vulnerabilities in dependencies
- Audio synchronization problems
- Error handling during connection failures

## [2.0.9] - 25-12-2022

### Added
- Audio streaming functionality through WebRTC
- WebSocket signaling server for audio transmission
- HTTPS implementation for secure connections
- Socket.IO integration for real-time communication
- Master-client architecture for audio streaming control

### Changed
- Improved hostname-based casting instead of IP-based connections
- Enhanced UI for better user experience
- Updated Electron to version 10.0.0
- Migrated to secure WebSockets (WSS) for all connections

### Fixed
- Connection stability issues in network environments with DHCP
- Audio sync problems during long streaming sessions
- Memory leaks in websocket connections
- VNC server discovery on non-standard ports

## [2.0.8] - 13-08-2024

### Added
- Multi-monitor support for screen casting
- Port scanning for VNC server detection (5900-5905)
- Auto-reconnect functionality for dropped connections
- System tray notifications for connection status

### Changed
- Updated node-websockify implementation for better performance
- Improved error handling and logging
- Enhanced SSL/TLS certificate management

### Fixed
- Screen resolution detection issues
- High CPU usage during idle connections
- Tray icon not updating properly on status change

## [2.0.7] - 19-04-2024

### Added
- Auto-startup configuration option
- Customizable refresh intervals
- Extended logging for troubleshooting

### Changed
- Optimized connection handling for better performance
- Updated UI color scheme for better visibility
- Reduced memory footprint

### Fixed
- Connection timeout issues on slow networks
- Screen sharing artifacts in high-resolution displays
- Occasional application freeze when changing network interfaces

## [2.0.6] - 10-05-2023

### Added
- Support for multiple CLEVER server connections
- Configuration file for server addresses
- User preferences for connection settings

### Changed
- Improved connection stability
- Enhanced error messages for better user guidance
- Updated dependencies to latest versions

### Fixed
- Issues with VNC server detection
- Connection handling on network changes
- Memory leaks in long-running sessions

## [2.0.5] - 15-03-2022

### Added
- Hostname-based connection infrastructure
- Preliminary audio support (disabled by default)
- Advanced logging options

### Changed
- Complete rewrite of network connection handling
- Improved SSL certificate management
- Enhanced user interface

### Fixed
- Multiple connection stability issues
- Issues with Windows sleep/resume cycle
- Problems with multi-user environments

## [1.0.8] - 20-01-2022

### Added
- Comprehensive logging system
- Initial implementation of automatic restart feature

### Changed
- Updated application icon
- Improved error handling
- Enhanced UI responsiveness

### Fixed
- Various minor bugs and stability issues
- Connection reliability problems
- Issues with application startup
