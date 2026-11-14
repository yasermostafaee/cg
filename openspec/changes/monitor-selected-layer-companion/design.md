## Context

The shell already keeps `selectedId` in `App`, independently of panel focus. Monitor fullscreen hides
the list and Inspector by presentation conditions; it does not need a second selection store.

## Decisions

- Keep a session-only companion mode separate from persisted shell focus.
- Default to monitor-only on each Runtime mount, preserving the existing fullscreen behaviour.
- When a maximized monitor opens without a selected layer, keep both companion modes discoverable
  as disabled controls. The operator can restore the workspace to select a row. Browser reloads
  retain the shell focus preference while layer selection remains session-only.
- Let the compact monitor header wrap its actions at narrow widths. Pan is a labelled button with
  intrinsic width alongside the existing square icon buttons.
- Render the existing Layers panel filtered to the selected row, so its state and verbs remain the
  same controls as the normal list rather than a second imitation.
- In companion mode, ignore the selected row's normal request to toggle itself off.
- Treat closing the companion Inspector as a layout change to selected-layer, not as deselection.
- Give the monitor the available height, with one intrinsic-height selected layer below it.
  The optional Inspector gets a separate full-height column at the right. Its width adapts to
  the window. Both the picture and the Inspector remain in their allocated space.
- Hide the main header and status footer while any panel is maximized. Keep its controls and
  active alerts in view.
- Keep the Preview panel mounted in its existing strip slot while Program is maximized. Hide
  its root for the focused layout so the existing rehearsal iframe and playback state survive
  the round trip. Release the live source preview subscription while hidden, and request fresh
  frames on restore without replacing the rehearsal document.

## Non-goals

- Persisting the companion layout across Runtime restarts.
- Choosing or switching to another layer from the compact companion.
- Changing which rows are in PVW or on air.
