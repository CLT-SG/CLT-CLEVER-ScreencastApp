# View-only VNC sessions

CLEVER ScreencastApp does not run its own policy engine for Video Wall vs Console.
When a viewer connects with `?view_only=1` (or `session_mode=view-only`) on the
WebSocket path, websockify drops RFB client messages:

- `4` KeyEvent
- `5` PointerEvent
- `6` ClientCutText

Framebuffer requests and encoding negotiation still pass.

CLEVER-node `/screencast` (Video Wall) always requests view-only. Console
`/remote?session_mode=interactive` does not set the flag, so input is forwarded.

## Electron

This app must remain on **Electron 22.3.25**. Do not upgrade Electron as part of
device-management features. A unit test asserts the pinned version.

## CLEVER-Player role changes

ScreencastApp does not store Video Wall / Console roles. When CLEVER-Player switches
from Console to Video Wall, it reloads its preview and opens `/screencast` (with
`view_only=1` on the WebSocket). Existing interactive Console sessions are dropped
with that reload; this bridge continues to filter input whenever `view_only=1` is set.

## Session approval prompts

CLEVER no longer shows noVNC’s RSA “Approve” dialog for managed Console/Video Wall
sessions. If a prompt still appears **on the remote PC**, it is typically UltraVNC
**QueryConnect** / “Accept incoming connections” — disable that in the VNC server
settings so authorized Console operators connect without a host-side click.
