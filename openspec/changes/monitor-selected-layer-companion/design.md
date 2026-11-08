## Context

The shell already keeps `selectedId` in `App`, independently of panel focus. Monitor fullscreen hides
the list and Inspector by presentation conditions; it does not need a second selection store.

## Decisions

- Keep a session-only companion mode separate from persisted shell focus.
- Default to monitor-only on each Runtime mount, preserving the existing fullscreen behaviour.
- Render the existing Layers panel filtered to the selected row, so its state and verbs remain the
  same controls as the normal list rather than a second imitation.
- In companion mode, translate the selected row's normal toggle-off result back to the current id.
- Treat closing the companion Inspector as a layout change to selected-layer, not as deselection.

## Non-goals

- Persisting the companion layout across Runtime restarts.
- Choosing or switching to another layer from the compact companion.
- Changing which rows are in PVW or on air.
