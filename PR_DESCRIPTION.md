# Changelog

All notable changes to the CLEVER Screencast KVM will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.1.1-2026] - 2026-09-15

### Added
- Reworked the client around a tray-resident Electron application with single-instance handling, minimize-to-tray behavior, graceful shutdown, and cache clearing.
- Added VNC availability monitoring with retries, recovery detection, and connection-failure notifications.
- Added a hostname-aware WebSocket-to-TCP proxy for VNC viewers, including IPv4, IPv6, wildcard listeners, DNS resolution, and DHCP address changes.
- Added CLEVER server device registration with hostname, IP address, connected viewer state, and physical monitor geometry for multi-monitor viewing.
- Added persistent JSON-backed settings for automatic casting, start on boot, VNC and WebSocket ports, server addresses, and registration intervals.
- Added daily rotating file logging and system-tray controls for application state, cache clearing, update checks, and quitting.
- Added a secure preload bridge and a status dashboard for VNC state, casting state, viewer count, device details, connection controls, and update notifications.
- Added packaged-app auto-update and start-on-boot integration.

### Changed
- Modernized the Electron main, preload, renderer, IPC, service, and packaging architecture.
- Updated the dependency and build configuration for Windows, macOS, and Linux packaging.
- Replaced the legacy port-scanning and websockify/WebRTC frontend flow with the new service-based VNC screencasting flow.

### Removed
- Removed the legacy HTTPS server, audio streaming implementation, old preload path, bundled adapter/fullpage/jQuery assets, and obsolete certificate and media assets.

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
