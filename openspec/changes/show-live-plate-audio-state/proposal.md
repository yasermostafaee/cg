## Why

PVW already writes audio intent on each Live Source placeholder, but its small text is easy to miss.
The layer-row audio button always draws the same volume icon, so it does not answer whether any shown
plate is currently asking for sound.

## What Changes

- Draw distinct Volume On/Muted icons on each PVW Live Source placeholder.
- Make the row audio-button icon reflect the canonical row audio summary.
- Carry the same state in tooltips and accessible names.

## Capabilities

### Modified Capabilities

- `runtime-ui`

## Impact

CG Control Live Source overlays and layer rows only. This is intent state, not metering, and emits no
new bridge command.
