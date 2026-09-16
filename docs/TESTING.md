# Testing

Existing tests in [`test/screencast-app.test.js`](../test/screencast-app.test.js) cover device id, monitors, capabilities, server config, discovery, registration payload, hostname, and connection candidates. They must keep passing.

New coverage:

| File | What it verifies |
| --- | --- |
| [`test/updater.test.js`](../test/updater.test.js) | Check / no-update / download / ready / failure / unpackaged / delayed auto-check |
| [`test/dashboard-state.test.js`](../test/dashboard-state.test.js) | Dashboard mapping of connection, updater, monitors, VNC, timestamps, multi-server discovery |
| [`test/version.test.js`](../test/version.test.js) | GitHub publish config and release workflow matrix |

```bash
npm test
```

## Manual regression (preserve existing integration)

Run `npm start` with a local VNC server. Do **not** expect GitHub auto-update in this mode.

- [ ] Application starts and shows the dashboard
- [ ] Local CLEVER-Service discovery still works (`127.0.0.1` / same machine)
- [ ] Remote LAN discovery works (`192.168.1.44` and other hosts)
- [ ] Multiple CLEVER-Service instances appear in the server list
- [ ] Duplicate announcements (IP / hostname / extra NIC) collapse to one row
- [ ] “No CLEVER-Service servers discovered” is shown when the round is empty; discovery retries in the background
- [ ] Refresh / Start / Stop Discovery controls work
- [ ] Per-server Register / Unregister / Reconnect work without stopping other servers
- [ ] Registration still works (Device ID + Registered)
- [ ] Reconnection still works (stop one service, that row becomes Reconnecting/Unavailable, others stay Connected)
- [ ] Heartbeat still works (Last heartbeat / Last communication advances)
- [ ] Monitor detection still works (table lists displays)
- [ ] Monitor information still works (name, id, primary, resolution, X/Y, W/H, online)
- [ ] VNC / websockify still works (port, path, scanned connections, Start/Stop sharing)
- [ ] CLEVER-node can still open the registered hostname/FQDN/IP and websockify path
- [ ] CLEVER-Player integration is unchanged
- [ ] Dashboard values come from the existing connection manager / port scan (no second protocol)
- [ ] Check for Updates shows the development status locally, and real states on a packaged build
- [ ] No-update, update-available, downloading, ready, and failure states are handled without crashing
- [ ] Application works without Internet (discovery on LAN, update error is non-fatal)
- [ ] Windows / Linux / macOS packages build via the Release workflow or `npm run package:*`

## Packaged update test

See [Release](./RELEASE.md) “Update release”. Use two consecutive GitHub Release versions. Confirm VNC sharing and CLEVER-Service registration survive the restart.
