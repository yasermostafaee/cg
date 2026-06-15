# Design — View menu: ruler + snapping

## Decisions

### 1. View prefs in the store, not the scene

Ruler visibility and snapping are editor preferences, not document data, so they
live in the Designer store (`rulerVisible`, `snappingEnabled`) — no schema
change, nothing serialized into the scene or `.vcg`. `snapGuides` is transient
UI state (the active guide lines during a drag), cleared on pointer-up and when
snapping is turned off.

### 2. Snapping computed at drag time, targets frozen at drag start

`beginDrag` precomputes the snap targets once (canvas edges/center + every other
element's edges/center in scene coords) — the other elements don't move during
the drag. Each move snaps the dragged box's near/center/far anchor on each axis
to the closest target within ~6 screen px (`6 / zoom` in scene units), and
publishes the chosen guide line(s). This keeps the threshold constant on screen
regardless of zoom. The dragged element is excluded from its own targets.

### 3. Pinned rulers via a measured origin

The rulers are pinned to the scroll-viewport edges (not scrolling with content),
which means they need the screen position of scene `(0,0)`. A `ResizeObserver` +
scroll/resize listeners measure the stage rect relative to the `outer` viewport
and store `rulerOrigin`; a tick at scene `x` draws at `originX + x * zoom`. The
tick step is the smallest of a fixed ladder whose on-screen spacing ≥ 64px, so
labels never crowd as you zoom out.

## Risks

- **Measurement churn:** the ruler effect only runs while the ruler is visible
  and re-measures on zoom/scroll/resize; `setSnapGuides` early-returns when
  nothing changes, so snapping doesn't spam re-renders when no guide is active.
- **Resize/rotate not snapped (yet):** snapping applies to element _move_ only.
  Gizmo resize/rotate are out of scope for this pass.
