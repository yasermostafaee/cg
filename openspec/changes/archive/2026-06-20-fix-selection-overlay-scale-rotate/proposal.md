# Fix the selection overlay under scale + rotation (B-022)

## Why

The canvas selection gizmo composes its transform differently from the renderer, so a
selected element with a non-uniform scale (and/or rotation) shows a selection border and
handles that DRIFT off the shape, and rotating afterwards pivots about the wrong point.

The authoring shapes are drawn by the real `@cg/template-runtime` (`scene-builder.ts` →
`composeTransform`) in the preview iframe, with
`transform: scale(sx,sy) rotate(deg)` about `transform-origin: anchor%`. The hit-test
(`hit-test.ts` `inverseToLocal`) inverts that exact `Scale·Rotate`-about-anchor map. The
gizmo, however:

- **`Gizmo.tsx`** bakes scale into the box width/height (`w = size.w * t.scale.x`) with
  the top-left pinned at `position`, then rotates a RECTANGLE about `anchor%` of the
  SCALED box. Scale-before-rotate ≠ the renderer's scale-after-rotate: a rotated rectangle
  cannot trace the renderer's PARALLELOGRAM when `scaleX ≠ scaleY`.
- **`geometry.ts`** `localToScene` (the resize/rotate math) OMITS scale entirely, so the
  resize grab points and the rotate pivot (`pivotClientFromGrab`) are computed as if
  scale = 1.

This is the sibling of the already-fixed B-004 (rotate handle position) — the same
selection-overlay transform module.

## What Changes

- **`geometry.ts` becomes scale-aware** and matches the renderer/hit-test forward map
  `Scale·Rotate about anchor`:
  - `BoxTransform` gains `scale: { x, y }`; `localToScene` applies scale AFTER rotation
    (scene axes), exactly inverting `hit-test.inverseToLocal`.
  - `computeResize` divides the pointer→fixed-corner vector by scale before projecting
    onto the local axes (so size deltas are in the element's own units) and scales the
    fixed-corner re-anchoring offset, keeping the opposite corner glued.
  - `pivotClientFromGrab` applies the element's scale to the corner offset so the rotate
    pivot lands on the anchor.
  - new pure helper `gizmoCorners` returns the four corner + centre points in screen
    space (the projected parallelogram) for the overlay to draw.
- **`Gizmo.tsx` draws the glued parallelogram**: the frame is an SVG polygon through the
  four projected corners; the corner handles / hit areas, edge strips, rotate zones, and
  centre pivot are positioned at the projected screen points as fixed (screen-sized)
  elements; cursor angles derive from the actual screen directions. Resize/rotate gestures
  pass the element scale into the now scale-aware geometry.
- No schema, runtime, or `.vcg`/export change — this is a renderer-overlay correctness fix.

## Impact

- Affected capability: `designer-shapes` (the shared selection gizmo — MODIFIED).
- Affected code: `apps/designer/src/renderer/features/canvas/geometry.ts`,
  `apps/designer/src/renderer/features/canvas/Gizmo.tsx` (+ `Gizmo.css.ts`).
- B-004's rotate-handle behavior is preserved.
