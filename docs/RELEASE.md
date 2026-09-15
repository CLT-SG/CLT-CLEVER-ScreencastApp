# Release process

Releases are cut by pushing a git tag. GitHub Actions builds Windows, Linux, and macOS packages and publishes them as a GitHub Release, together with the `latest*.yml` metadata consumed by `electron-updater`.

## Versioning

Use semantic versioning `MAJOR.MINOR.PATCH` in [`package.json`](../package.json):

| Bump | When |
| --- | --- |
| `MAJOR` | Breaking Screencast / CLEVER-Service behaviour |
| `MINOR` | New features (dashboard, updater, extra platforms) |
| `PATCH` | Bug fixes |

The tag name **must** equal `package.json` `version`:

- `"version": "2.2.0"` → `git tag v2.2.0`

The release workflow fails fast if they disagree.

## Normal release

```bash
npm version patch --no-git-tag-version
# or: npm version minor --no-git-tag-version
git add package.json package-lock.json
git commit -m "Release 2.2.1"
git tag v2.2.1
git push origin main
git push origin v2.2.1
```

`npm version patch` without `--no-git-tag-version` also creates the commit and tag. Then:

```bash
git push
git push --tags
```

Watch the **Release** workflow. When it finishes, open the GitHub Release and confirm each OS uploaded:

- Windows: `CLEVER-Screencast-Setup-<version>.exe`, `latest.yml`, `.blockmap`
- Linux: `.AppImage`, `.deb`, `latest-linux.yml`
- macOS: `.dmg`, `.zip`, `latest-mac.yml`

## Update release (from an older install)

1. Install version **N** from a previous GitHub Release.
2. Publish version **N+1** with the checklist above.
3. Launch the older install (with network access to GitHub, or a configured `GH_TOKEN` for this private repo).
4. Use **Check for Updates** or wait for the automatic check.
5. Confirm: *Update available* → download → *Update ready* → **Restart and Install**.
6. After restart, the dashboard header shows version **N+1**.
7. Confirm CLEVER-Service discovery/registration and VNC sharing still work.

## Workflows

| Workflow | Trigger | What it does |
| --- | --- | --- |
| [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) | Push / pull request to `main` | `npm ci`, `npm test` |
| [`.github/workflows/release.yml`](../.github/workflows/release.yml) | Tag `v*` | Verifies the tag, tests, matrix-builds, publishes the GitHub Release |

Release matrix:

| Job | Runner | electron-builder args |
| --- | --- | --- |
| Windows | `windows-latest` | `--win --x64` |
| Linux | `ubuntu-latest` | `--linux --x64` |
| macOS | `macos-latest` | `--mac --x64` |

Installers are also uploaded as Actions artifacts for 14 days for debugging.

## Permissions and secrets

`permissions: contents: write` plus the default `GITHUB_TOKEN` is enough to create releases. The workflow maps it to `GH_TOKEN` because electron-builder reads that variable.

Do **not** hardcode tokens in source.

Optional code-signing secrets — unsigned installers are still produced when they are absent:

| Secret | Purpose |
| --- | --- |
| `CSC_LINK` | Base64-encoded code-signing certificate (`.pfx`), or a URL to the file |
| `CSC_KEY_PASSWORD` | Certificate password |

When `CSC_LINK` is empty the workflow sets `CSC_IDENTITY_AUTO_DISCOVERY=false` so macOS/Windows unsigned builds do not fail looking for a local identity.

### Windows code signing

Unsigned NSIS installers still auto-update (`verifyUpdateCodeSignature` is `false` until a certificate is configured), but SmartScreen may warn on first install.

## Re-tagging

If a workflow run fails and you need to re-tag the same version:

```bash
git tag -d v2.2.1
git push --delete origin v2.2.1
# fix, commit, then re-tag
```

Re-using a tag overwrites any partially published GitHub Release for that version. Prefer bumping to the next patch when possible.

## Local packaging (no publish)

```bash
npm run package:win
npm run package:linux
npm run package:mac
```

Output directory: `build/Release/`. GitHub publish is skipped (`--publish never`).
