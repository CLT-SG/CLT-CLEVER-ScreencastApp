# Application Updates and Release Deployment

This document describes the Electron Updater architecture, GitHub Release configuration, GitHub Actions workflow, and how to publish and test Windows, Linux, and macOS builds of CLEVER ScreencastApp.

## Application Update Architecture

ScreencastApp uses [electron-updater](https://www.electron.build/auto-update) with GitHub Releases as the only update source.

```text
Packaged app  -->  electron-updater
                      |
                      v
GitHub Releases for clt-sg/clt-clever-screencastapp
  latest.yml / latest-mac.yml / latest-linux.yml
  Windows NSIS, macOS zip/dmg, Linux AppImage/deb
```

The main process (`update/autoUpdate.js`) checks GitHub, reports status to the dashboard, and installs only when it is safe:

1. Detect the current application version from `package.json` / `app.getVersion()`.
2. Compare it with the latest GitHub Release for this platform.
3. Download the matching artifact and updater metadata.
4. Restart to install **only if no Screencast/VNC session is active**.

Dashboard states:

```text
Checking for updates...
You are using the latest version.
Update available: v1.2.0
Downloading update...
Update downloaded.
Restart to install.
```

If sharing is active when a download finishes, the UI shows that restart is deferred until the session ends. `autoInstallOnAppQuit` still applies when the user quits the app.

Development (`npm start`) builds cannot use GitHub auto-update. The dashboard reports that updates are available in packaged GitHub Release builds.

## Electron Updater Configuration

Configuration lives in `package.json` and is not duplicated as hardcoded release URLs:

- `version`: application version used by the installer and updater
- `repository`: GitHub repository used by electron-builder/electron-updater
- `build.publish`: GitHub provider, owner, and repo
- `build.win` / `build.mac` / `build.linux`: platform packages

Windows uses NSIS. macOS publishes `dmg` (manual install) and `zip` (required for auto-update). Linux publishes `AppImage` (auto-update) and `deb` (package manager install).

## GitHub Repository Configuration

Repository: `https://github.com/clt-sg/clt-clever-screencastapp`

The GitHub Actions workflow uses `GITHUB_TOKEN` with `contents: write` to create or update the GitHub Release for a version tag. Do not copy update files to a separate server.

Private repositories require a token with release-read access on machines that should auto-update. Public releases work without an extra client token.

## GitHub Actions Workflow

Workflow file: `.github/workflows/release.yml`

It runs on:

- `git push` of a tag matching `v*`
- Manual `workflow_dispatch`

Each run:

1. Checks out the repository.
2. Installs Node.js 18 and `npm ci`.
3. Validates updater helpers (`npm test`).
4. Builds the current runner's platform package.
5. Publishes artifacts and electron-updater metadata to GitHub Releases.

Supported runners only:

```text
Windows
Linux
macOS
```

Unnecessary extra architectures are not built. Windows and Linux publish x64. macOS publishes x64 and arm64 so Intel and Apple silicon machines receive the correct update.

## Release Versioning

A release must have all of the following:

```text
Application Version     package.json version, e.g. 2.2.0
Git Tag / Release       v2.2.0
GitHub Release          created by GitHub Actions
Platform Build Artifacts  NSIS, dmg/zip, AppImage/deb
Electron Updater Metadata latest.yml, latest-mac.yml, latest-linux.yml
```

Keep the git tag aligned with `package.json`. Electron Builder uses the package version, not the tag name, for artifact versioning.

## Publishing GitHub Releases

1. Update `package.json` `version`.
2. Update `CHANGELOG.md`.
3. Commit the version change on the release branch.
4. Create and push the tag:

```bash
git tag v2.2.0
git push origin v2.2.0
```

5. GitHub Actions builds Windows, Linux, and macOS and publishes the GitHub Release.
6. Open the GitHub Release and confirm artifacts plus `latest.yml` / `latest-mac.yml` / `latest-linux.yml`.

Manual publish without a tag: run the **Release** workflow and set **Publish artifacts to GitHub Releases** to `true`.

## Windows Build

- Runner: `windows-latest`
- Package: NSIS installer (`CLEVER_Screencast-<version>-win-x64.exe`)
- Updater metadata: `latest.yml`

Local build:

```bash
npm ci
npm run win64
```

## Linux Build

- Runner: `ubuntu-latest`
Linux AppImage packaging requires a 256x256 or larger icon. `src/assets/media/icon-512.png` is the tracked builder icon.
- Updater metadata: `latest-linux.yml`

Local build:

```bash
npm ci
npm run linux
```

## macOS Build

- Runner: `macos-latest`
- Packages: `dmg` and `zip` for x64 and arm64
- Updater metadata: `latest-mac.yml`
- Code signing is disabled (`identity: null`) so CI can publish unsigned builds. Gatekeeper may require a right-click Open on first launch.

Local build:

```bash
npm ci
npm run mac
```

## Testing Auto Updates

1. Install an older packaged build (for example 2.1.0).
2. Publish a newer GitHub Release (for example 2.2.0) with platform artifacts and updater metadata.
3. Launch the older app and use **Check for updates**.
4. Confirm the dashboard shows `Update available: v2.2.0`.
5. Download the update.
6. Start sharing and confirm the app does **not** restart while the session is active.
7. Stop sharing, then **Restart to install**.
8. Confirm the app relaunches at the new version.

## Troubleshooting Failed Updates

| Symptom | What to check |
| --- | --- |
| Development build says updates are only in packaged releases | Expected. Package the app or install a GitHub Release. |
| Update check fails with 404 | Confirm the GitHub Release exists, is published (not draft), and includes `latest.yml` for that OS. |
| Wrong platform artifact | Confirm the release has Windows NSIS, macOS zip, or Linux AppImage metadata. |
| App does not restart | Stop sharing first. Install is deferred during an active Screencast/VNC session. |
| Private repository 401/404 | Provide a GitHub token with access to releases. |
| macOS blocked at launch | Unsigned CI builds may need a manual Open from Finder. |
