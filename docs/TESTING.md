# Testing

Existing tests in [`test/screencast-app.test.js`](../test/screencast-app.test.js) cover device id, monitors, capabilities, server config, discovery, registration payload, hostname, and connection candidates. They must keep passing.

New coverage:

| File | What it verifies |
| --- | --- |
| [`test/updater.test.js`](../test/updater.test.js) | Check / no-update / download / ready / failure / unpackaged / delayed auto-check |
| [`test/dashboard-state.test.js`](../test/dashboard-state.test.js) | Dashboard mapping of connection, updater, monitors, VNC, timestamps |
| [`test/version.test.js`](../test/version.test.js) | GitHub publish config and release workflow matrix |

```bash
npm test
```

## Manual regression (preserve existing integration)

Run `npm start` with a local VNC server. Do **not** expect GitHub auto-update in this mode.

- [ ] Application starts and shows the dashboard
- [ ] CLEVER-Service discovery still works (Automatic discovery / Search again)
- [ ] Registration still works (Device ID + Registered)
- [ ] Reconnection still works (stop the service, status becomes Reconnecting, then Connected)
- [ ] Heartbeat still works (Last heartbeat advances)
- [ ] Monitor detection still works (table lists displays)
- [ ] Monitor information still works (name, id, primary, resolution, X/Y, W/H, online)
- [ ] VNC / websockify still works (port, path, scanned connections, Start/Stop sharing)
- [ ] CLEVER-node can still open the registered hostname/FQDN/IP and websockify path
- [ ] Dashboard values come from the existing connection manager / port scan (no second protocol)
- [ ] Check for Updates shows the development status locally, and real states on a packaged build
- [ ] No-update, update-available, downloading, ready, and failure states are handled without crashing
- [ ] Application works without Internet (discovery on LAN, update error is non-fatal)
- [ ] Windows / Linux / macOS packages build via the Release workflow or `npm run package:*`

## Packaged update test

See [Release](./RELEASE.md) “Update release”. Use two consecutive GitHub Release versions. Confirm VNC sharing and CLEVER-Service registration survive the restart.
