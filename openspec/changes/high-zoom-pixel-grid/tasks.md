# Tasks — high zoom + pixel grid (D-120)

## 1. Max zoom 400% → 6400%

- [ ] `CanvasArea.tsx`: `ZOOM_MAX` `4` → `64`; confirm every zoom path (+/−/1× buttons,
      `Ctrl+wheel`, Fit) routes through `clampZoom` so they all honour the new ceiling.
- [ ] Confirm B-027's dynamic cover-fit MIN still governs the bottom of the range (unchanged).
- [ ] Correct the stale "clamped 10..400%" comment.

## 2. Pixel-grid geometry helpers (pure, testable)

- [ ] `geometry.ts`: `PIXEL_GRID_MIN_ZOOM` (8), `PIXEL_GRID_MAJOR_EVERY` (10),
      `pixelGridVisible(zoom)` (shown iff `zoom ≥ PIXEL_GRID_MIN_ZOOM`), and
      `pixelGridMetrics(zoom, frameOffset)` → `{ cell, major, offsetX, offsetY }` (cell = `zoom`px,
      major = `10·zoom`, offset = `(frameOffset % 10)·zoom` so an emphasized line lands on scene
      multiples of 10).

## 3. Render the grid layer

- [ ] `CanvasArea.css.ts`: `s.pixelGrid` — absolute, inset 0, `pointer-events: none`, the
      minor + major `linear-gradient` hairlines.
- [ ] `CanvasArea.tsx`: render `<div class={s.pixelGrid}>` inside the stage, between the iframe and
      the `CanvasOverlay`, gated on `pixelGridVisible(zoom)`, with `background-size` / position from
      `pixelGridMetrics`. `aria-hidden`; the overlay stays above it so hit-testing is unaffected.

## 4. Tests

- [ ] Unit `pasteboard.test.ts`: `pixelGridVisible` threshold (false below 8, true at/above);
      `pixelGridMetrics` cell/major/offset; a grid line at integer scene X maps to the SAME stage-x
      the rulers use (`(X + frameOffset)·zoom`) — no drift.
- [ ] E2E `pixel-grid.spec.ts`: max zoom reaches 6400%; the grid is PRESENT at a high zoom (e.g.
      1600%) and ABSENT at 100%; at high zoom a 1px arrow nudge moves the shape exactly 1 scene px.
- [ ] Confirm no regression: B-027 cover-fit min / clamp / fit-on-open (B-035) still pass.

## 5. Docs

- [ ] Canvas feature `README.md` — pixel-grid + high-zoom section.
- [ ] PRD `docs/prd/designer.md` D-120 → `[~]` with evidence.

## 6. Gate

- [ ] `@cg/designer` typecheck + lint + test + build (uncached `turbo --force`), then E2E.
- [ ] `pnpm openspec validate high-zoom-pixel-grid --strict`.
