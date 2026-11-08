## Why

Maximizing PGM or PVW currently removes the layer list and Inspector from view. The selection survives
internally, but the operator cannot see the row or edit it until leaving fullscreen.

## What Changes

- Offer monitor-only, selected-layer and selected-layer-plus-Inspector layouts in a maximized monitor.
- Show only the selected row in the layer companion.
- Preserve selection while changing layouts and when the compact selected row is clicked again.
- Hide every companion control and surface when there is no selected layer.

## Capabilities

### Modified Capabilities

- `runtime-ui`

## Impact

CG Control shell layout and monitor headers only. This is session presentation state and emits no new
Bridge command.
