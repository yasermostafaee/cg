# Pixel-snap drag and nudge at grid zoom (D-122)

## Why

B-042 fixed the alignment TRUTH — at pixel-grid zoom a shape edge at an integer scene
coordinate now sits exactly on its grid line, and the selection gizmo honestly traces the
rendered box. But a drag still writes CONTINUOUS FRACTIONAL scene coordinates, and an arrow
nudge is a RELATIVE ±1 that PRESERVES any fractional part — so at 6400% a dragged (or once-
nudged) element legitimately parks BETWEEN two grid lines, and its border shows it there.
To the owner this reads like "the old bug came back", even though the placement is honest.
D-122 closes that last user-visible gap: at pixel-grid zoom, placement itself lands on whole
pixels.

The owner's decision is recorded in `docs/prd/designer.md` (D-122) and is NOT re-litigated
here: **full snap at pixel-grid zoom**, with Alt as a momentary free-placement bypass and
Inspector-typed values always free.

## What Changes

- **Drag lands on whole pixels at grid zoom.** In the canvas move path (single + group), when
  the pixel grid is visible and the Snapping preference is on and Alt is not held, the dragged
  position (single) or the group ANCHOR (group) snaps to the nearest whole scene pixel LIVE on
  every pointer-move — the element and its gizmo step pixel-by-pixel under the cursor and every
  drop lands on a line. The group's snapped anchor delta moves every member, so relative
  offsets are preserved (only the anchor lands exactly integer — matching the group-move
  "shared delta" rule). At grid zoom the pixel grid IS the snap target, superseding the
  smart-guide element snapping whose ~6-screen-px threshold is sub-0.1 scene px there.
- **First nudge of a fractional coordinate lands on the next integer.** At grid zoom the arrow
  nudge snaps the anchor: a fractional coordinate moves to the NEXT integer in the nudge
  direction (6.69 → right → 7, → left → 6) regardless of step magnitude, then steps by whole
  pixels; Shift keeps the 10px stride once on the grid. The snapped anchor delta moves the
  group.
- **Alt bypasses the snap** on both drag and nudge (free sub-pixel placement / relative
  ±step preserving the fraction). Alt was previously an inert bail-out modifier in both paths;
  it now means "free move" at any zoom.
- **The Snapping preference is the master switch** for pixel-grid snapping too — with Snapping
  off, drags and nudges are free at any zoom (today's behavior), so `designer-canvas-view`'s
  "Snapping off drags freely" stays coherent.
- **Below the grid threshold, nothing changes**; **Inspector-typed values are always free**
  (they never route through the move path).

## Capabilities

- **`designer-canvas-view`** (MODIFIED + ADDED): the "Snap-while-dragging with smart guides"
  requirement is clarified so the Snapping preference governs pixel-grid snapping too; a new
  "Pixel-snap moves to the grid at high zoom (D-122)" requirement states the drag + nudge snap,
  the Alt bypass, and the below-threshold passthrough.
- **`designer-multi-select`** (MODIFIED): the "Arrow-key nudge for the selection" requirement
  gains the grid-zoom first-snap-to-integer + Alt bypass (the shared anchor delta is unchanged).
- **`designer-canvas-viewport`** (MODIFIED): the B-042 gizmo honesty scenario's stale "the drag
  scenario" example (a plain drag no longer produces fractional coords) is reworded to Inspector
  / Alt-drag; the honesty requirement itself is unchanged (fractional placement stays reachable
  and honestly rendered).

## Impact

- `apps/designer/src/renderer/features/canvas/geometry.ts` — new pure helpers
  `pixelSnapActive`, `snapDragToPixel`, `snapNudgeToPixel`.
- `apps/designer/src/renderer/features/canvas/CanvasOverlay.tsx` — `beginDrag` / `beginGroupDrag`
  onMove: Alt bypass + pixel snap superseding smart-guide snap at grid zoom.
- `apps/designer/src/renderer/state/store-core.ts` + `state/slices/view.ts` — a `canvasZoom`
  mirror + `setCanvasZoom`, published by `CanvasArea` so the store-side nudge can read the zoom.
- `apps/designer/src/renderer/state/slices/elements.ts` — `nudgeSelection(dx, dy, { alt })`:
  anchor first-snap at grid zoom.
- `apps/designer/src/renderer/App.tsx` — the arrow-nudge handler lets Alt through and forwards
  it; `ShortcutsModal.tsx` documents the snap + Alt bypass.
- Tests: `apps/designer/tests/canvas-geometry.test.ts` (snap math) + a new
  `apps/designer/tests/e2e/pixel-snap.spec.ts` (drag lands integer, fractional first-nudge, Alt
  free, below-threshold passthrough).
- Docs: canvas feature `README.md` (drag/snap interaction section); PRD `docs/prd/designer.md`
  D-122 → `[~]`.

## Out of scope

- **Resize-handle snapping** (snapping a resize to whole pixels / whole-pixel dimensions) is a
  natural follow-up but NOT included — D-122 is element MOVE only. Filed as a note in `design.md`.
