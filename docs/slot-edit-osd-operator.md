# Console OSD and Screencast status ownership

ScreencastApp remains the device agent for discovery, heartbeat, VNC/audio sessions, and local encoder state.

## Relationship to Console OSD

- CLEVER-Service Assign Source chooses which Screencast is bound to a slot.
- The Console OSD **Cast** / **Overview** tabs display status for that assigned source only.
- Do not add a second assignment list inside ScreencastApp for Console operators.

## Status surface

Prefer existing heartbeat / session fields already consumed by CLEVER-Service and CLEVER-node. New operator UI should reuse those fields rather than inventing parallel connection state machines in the renderer.

## Content interaction lock

Console/Video Wall layout editing shields pointer input in the CLEVER-Service preview UI. ScreencastApp sessions must not be paused, disconnected, or reconfigured merely to prevent accidental remote-desktop clicks during slot drag/resize.
