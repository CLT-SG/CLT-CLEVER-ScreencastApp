# Electron Updater

CLEVER Screencast uses [`electron-updater`](https://www.electron.build/auto-update) with **GitHub Releases** as the update provider. Update logic lives in [`lib/updater.js`](../lib/updater.js) and is isolated from CLEVER-Service communication, VNC/screencast, and monitor detection.

## How it works

1. A packaged install checks GitHub Releases for `latest.yml` / `latest-linux.yml` / `latest-mac.yml`.
2. If an update exists, electron-updater downloads the matching artifact and blockmap.
3. The dashboard shows progress and a **Restart and Install** action.
4. The application does **not** restart by itself. The user (or the “Update ready” dialog) must confirm installation.

Unpackaged `npm start` builds skip GitHub entirely and show *Updates are checked in packaged releases*.

## GitHub Releases configuration

[`package.json`](../package.json) `build.publish`:

```json
{
  "provider": "github",
  "owner": "CLT-SG",
  "repo": "CLT-CLEVER-ScreencastApp",
  "releaseType": "release",
  "private": true
}
```

Supported artifacts:

| Platform | Installer | Updater metadata |
| --- | --- | --- |
| Windows | NSIS `.exe` | `latest.yml` + `.blockmap` |
| Linux | AppImage (auto-update) and `.deb` (install) | `latest-linux.yml` |
| macOS | `.zip` (auto-update) and `.dmg` (install) | `latest-mac.yml` |

Linux auto-update requires the **AppImage**. The `.deb` is for first-time install only.

## Check for Updates

Dashboard **Management → Check for Updates**, the application menu, and the tray menu all call the same `updater-check` IPC handler.

Expected statuses:

| State | Message |
| --- | --- |
| `checking` | Checking for updates... |
| `unavailable` | You are using the latest version. |
| `available` | Update available |
| `downloading` | Downloading update... |
| `ready` | Update ready |
| `error` | Update failed |
| `dev` | Updates are checked in packaged releases |

An update check never blocks discovery, registration, heartbeat, VNC, or monitor detection. The first automatic check waits 12 seconds after startup and then repeats every 6 hours.

## Automatic update behaviour

- Automatic **check**: yes (packaged builds only)
- Automatic **download**: yes (`autoDownload`)
- Automatic **restart**: no. The user is notified when the update is ready and can install immediately or later. `autoInstallOnAppQuit` still applies the downloaded update if the user quits the app.

## Linux install behaviour

| Installed as | Update artifact | Install path |
| --- | --- | --- |
| AppImage (`APPIMAGE` set) | `.AppImage` from `latest-linux.yml` | Validate package → ensure `+x` → `quitAndInstall` (electron-updater AppImageUpdater) |
| `.deb` (`resources/package-type` = `deb`) | `.deb` from `latest-linux.yml` | Validate package → `pkexec /bin/bash -c 'dpkg -i …'` (no `--disable-internal-agent`) → `app.relaunch()` |

Ubuntu Desktop installs from the `.deb` previously failed with **Update request failed 127**. That exit code came from electron-updater’s DebUpdater invoking `pkexec --disable-internal-agent`, which returns `127` when no Polkit session agent answers. ScreencastApp now installs `.deb` updates through a platform-specific path that keeps the graphical auth dialog available, validates the downloaded package first, and leaves CLEVER-Service / VNC running if install does not start.

AppImage remains the preferred zero-elevation auto-update format.

## Failure handling

The application keeps running when:

- the machine is offline
- GitHub or the API is unreachable
- no release (or no `latest.yml`) exists
- update metadata is invalid
- the download fails
- Linux package validation fails (missing, empty, wrong format, or not executable)
- Linux `.deb` elevation / `dpkg` install fails

Errors are logged and shown on the dashboard. Failed checks retry with exponential backoff (30s → 1h max). Linux install failures surface a clear Ubuntu message instead of a raw exit code.

## Private repository note

This repository is private. Unauthenticated `releases.atom` / `latest.yml` requests return 404, so installed apps need either:

1. A public repository (or a public releases-only repo) in `build.publish`, **or**
2. A read-only GitHub token available to the installed app as `GH_TOKEN` / `GITHUB_TOKEN` (`contents: read`)

**Do not bake a token into the installer.** Until a release tag is published, `Update failed` in a packaged build is expected and is handled without crashing.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| Status stays on *packaged releases* | You are running `npm start`, not an installed build |
| `No published GitHub release was found` | Push a `vX.Y.Z` tag and confirm Release assets include `latest*.yml` |
| `GitHub is unreachable` | Network / proxy / firewall; the app continues to work locally |
| Download starts then fails | Confirm the installer artifact and `.blockmap` were uploaded for that OS |
| macOS does not update | The release must include the `.zip` artifact, not only the `.dmg` |
| Linux does not update | Prefer the AppImage; `.deb` updates need a Polkit password prompt via `pkexec` |
| `Update request failed 127` / Ubuntu install failed | Fixed in the Linux install path: check `~/clevervnc-log/` for `[Updater]` diagnostics (package path, permissions, installer exit code) |
| AppImage downloads but will not restart | Confirm the downloaded `.AppImage` exists under the updater cache and is executable (`-rwxr-xr-x`) |

Update events are written to `~/clevervnc-log/YYYY-MM-DD.log`.
