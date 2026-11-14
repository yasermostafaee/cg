# Show Windows installer copy progress

## Why

CG Setup can remain visually static while the silent NSIS engine expands a large payload.
The operator needs to see that Setup is active and see measured progress during file writes.

## What changes

- Show activity while the engine prepares files or runs an unmeasured step.
- Stream NSIS payload files into their destinations and display the bytes actually written.
- Preserve the three engines' silent command arguments and result codes.

## Capabilities

- `desktop-delivery`: measured copy progress in CG Bridge, CG Control and CG Designer Setup.
