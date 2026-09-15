# Changelog

All notable changes to the CLEVER Screencast KVM will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.2.0] - 2026-09-15

### Added
- Electron Updater with GitHub Releases as the update source
- GitHub Actions release workflow for Windows, Linux, and macOS
- Dashboard UI with application status, CLEVER-Service connection, device, monitor, VNC, update, and management controls
- Session-safe update install that waits until Screencast/VNC sharing has stopped

### Changed
- Main window is a landscape management dashboard instead of a stacked portrait panel
- Linux packages now include AppImage (auto-update) in addition to deb
- macOS publishes zip artifacts required by electron-updater

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
