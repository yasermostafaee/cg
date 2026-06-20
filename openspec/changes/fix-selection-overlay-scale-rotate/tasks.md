# Tasks — Fix selection overlay under scale + rotation (B-022)

## 1. Scale-aware geometry (`geometry.ts`)

- [ ] Add `scale: { x: number; y: number }` to `BoxTransform`.
- [ ] Make `localToScene` apply `Scale` AFTER `Rotate` about the anchor (scene axes), so it
      exactly inverts `hit-test.inverseToLocal`.
- [ ] Update `computeResize`: divide the pointer→fixed-corner vector by scale before the
      local-axis projection, and scale the fixed-corner re-anchoring offset.
- [ ] Make `pivotClientFromGrab` apply the element scale (`scaleX`, `scaleY`, default 1) to
      the corner offset.
- [ ] Add a pure `gizmoCorners(t, zoom)` helper returning the four corner + centre points in
      screen space (scene × zoom).

## 2. Glued overlay (`Gizmo.tsx` + `Gizmo.css.ts`)

- [ ] Draw the frame as an SVG polygon through the four projected corners (parallelogram).
- [ ] Position corner handles / hit areas, edge strips, rotate zones, and the centre pivot at
      the projected screen points as fixed screen-sized elements; derive cursor angles from the
      actual screen directions.
- [ ] Pass element scale through `beginResize` / `beginRotate` into the scale-aware geometry.
- [ ] Keep B-004's rotate-handle behavior intact.

## 3. Tests

- [ ] Unit (`canvas-geometry.test.ts`): the scale-aware `localToScene` round-trips against
      `hit-test.inverseToLocal` under non-uniform scale + rotation; `computeResize` keeps the
      fixed corner glued under scale; `gizmoCorners` projects the renderer's parallelogram.
- [ ] Unit (`gizmo.test.ts`): `pivotClientFromGrab` applies element scale to the offset.
- [ ] E2E (`apps/designer/tests/e2e/`): scale (non-uniform) then rotate → the selection box
      tracks the shape; re-confirm B-004 (rotate updates handle position) still passes.

## 4. Gate

- [ ] `@cg/designer` green gate (uncached) + `pnpm test:e2e` +
      `openspec validate fix-selection-overlay-scale-rotate --strict`.
