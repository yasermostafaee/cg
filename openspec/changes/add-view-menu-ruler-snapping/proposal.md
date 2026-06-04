## Why

The top **View** menu was a disabled placeholder, and the canvas had no ruler
and no snapping. Operators need rulers to read element positions at a glance and
snapping to align elements precisely against the canvas and each other.

## What Changes

- The **View** menu becomes a real dropdown with two checkable toggles:
  - **Ruler** — show/hide pinned pixel rulers along the top and left of the
    canvas. They show scene coordinates, place scene `(0,0)` correctly, and stay
    aligned as the canvas zooms, scrolls, and resizes; the tick step adapts to
    zoom so labels stay legible.
  - **Snapping** — enable/disable snap-while-dragging. When on, a dragged
    element's left/center/right and top/middle/bottom snap (within ~6 screen px)
    to the canvas edges + center and to other elements' edges + centers, with
    thin magenta guide lines drawn for the active snaps. When off, dragging is
    free.
- View preferences live in the Designer store (`rulerVisible`,
  `snappingEnabled`, plus transient `snapGuides`); snapping defaults on, ruler
  off. No schema or scene-data change.

## Capabilities

### New Capabilities

- `designer-canvas-view`: View-menu canvas preferences — pixel rulers and
  drag snapping with smart guides.

### Modified Capabilities

<!-- None. -->

## Impact

- **Store:** `apps/designer/src/renderer/state/store.ts` — `rulerVisible`,
  `snappingEnabled`, `snapGuides` state; `toggleRuler`, `toggleSnapping`,
  `setSnapGuides`.
- **Top menu:** `features/shell/TopToolbar.tsx` — real View dropdown with two
  `ToggleMenuItem`s (checkmark reflects state); Help stays a placeholder.
- **Canvas snapping:** `features/canvas/CanvasOverlay.tsx` — `beginDrag` snaps
  the moved element to canvas + other-element edges/centers and publishes guide
  lines; the overlay renders the guides.
- **Ruler:** `features/canvas/CanvasArea.tsx` — a measured `rulerOrigin`
  (stage-vs-viewport, recomputed on zoom/scroll/resize) feeds a `CanvasRuler`
  overlay drawn when the toggle is on.
- **Unchanged:** schema, runtime, vcg, storage.
- **Tests:** `apps/designer/tests/store-view-prefs.test.ts` — defaults, toggles,
  guide set/clear.
- **Dependencies:** none.
