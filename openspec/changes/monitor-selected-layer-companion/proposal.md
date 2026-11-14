## Why

Maximizing PGM or PVW currently removes the layer list and Inspector from view. The selection survives
internally, but the operator cannot see the row or edit it until leaving fullscreen.

## What Changes

- Offer monitor-only, selected-layer and selected-layer-plus-Inspector layouts in a maximized monitor.
- Show only the selected row in the layer companion.
- Preserve selection while changing layouts and when the compact selected row is clicked again.
- Keep the companion choices visible while a monitor is maximized. Disable the layer and
  Inspector choices with no selected layer and leave the picture full-size.
- Keep Pan's icon and label together and wrap the monitor actions when space is limited.
- Place the compact selected row below the picture and the optional Inspector in its own right column.
- Give any maximized panel the space from the app header and footer.
- Keep the current PVW rehearsal when PGM is maximized and restored.

## Capabilities

### Modified Capabilities

- `runtime-ui`

## Impact

CG Control shell layout and monitor headers only. This is session presentation state and emits no new
Bridge command.
