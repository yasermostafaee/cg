# High zoom + pixel grid for pixel-perfect editing (D-120)

## Why

The canvas tops out at 400% — too low to see or place individual pixels. Pixel-perfect
alignment (e.g. nudging a shape from x=5 to x=6 and SEEING it land) needs both a much deeper
zoom and a visible **pixel grid**, the affordance pro tools (Loopic) provide. This builds on the
B-027 fixed pasteboard + dynamic-zoom work: the cover-fit MINIMUM zoom is unchanged — only the
MAXIMUM rises, and a grid is layered over the existing pasteboard stage.

## What Changes

- **Max zoom 400% → 6400%.** `ZOOM_MAX` in `CanvasArea.tsx` goes from `4` to `64` (each scene
  pixel = 64 screen px at the top). Every zoom path already routes through `clampZoom`
  (`clampZoomPure(z, dynamicZoomMin, ZOOM_MAX, …)`), so the +/−/1× buttons, `Ctrl+wheel`, and Fit
  all respect the new ceiling with no other change. B-027's dynamic cover-fit MIN still governs
  the bottom of the range; only the upper bound moves.
- **Pixel grid at high zoom.** A non-interactive grid layer (1 cell = 1 scene pixel) is rendered
  over the WHOLE pasteboard extent (not just the frame), visible ONLY when one scene pixel maps to
  at least `PIXEL_GRID_MIN_ZOOM = 8` screen px (zoom ≥ 8 → **800%**). Below that it is hidden (a
  1px grid at low zoom is an illegible smear); 800% leaves a wide useful pixel-editing band up to
  6400%. Pure helpers in `geometry.ts` — `pixelGridVisible(zoom)` and `pixelGridMetrics(zoom,
frameOffset)` (cell = `zoom` px, major line every 10, scene-aligned offset) — keep the threshold
  and the line math unit-testable.
- **Rendering approach — CSS `linear-gradient` layer.** The grid is a single absolutely-positioned
  `div` (`s.pixelGrid`) inside the stage, between the iframe and the `CanvasOverlay`, with
  `pointer-events: none` (so it never blocks selection/hit-testing — the overlay sits above it).
  Its `background-image` is two `linear-gradient`s (a vertical + a horizontal 1px hairline) at
  `background-size: zoom × zoom` for the minor grid, plus two more at `10·zoom` for slightly
  stronger **major** lines (graph-paper, every 10th). This is GPU-friendly and **viewport-culled
  by the compositor** — only the visible tile is rasterized, so there is no per-line draw even
  though the pasteboard is ~760k px wide at 6400%; the lines stay crisp (hard gradient stops, no
  blur) at any zoom. Because the stage is a child of the scroll container and the gradient origin
  is the stage top-left, the grid scrolls/zooms WITH the content and the cell tracks the zoom.
- **Pixel-accurate, ruler-aligned.** The frame offset (`frameOffset`) is an integer, so a scene
  integer boundary lands at stage-local `k·zoom` for every integer `k` — exactly where the minor
  gradient draws a line. The grid therefore sits on each integer scene coordinate using the SAME
  `scene→stage = (x + frameOffset)·zoom` mapping the rulers use, so it never drifts from the
  rulers (a unit test pins this). Major lines are offset by `(frameOffset % 10)·zoom` so an
  emphasized line lands on scene multiples of 10 (matching round ruler labels).
- **Appearance.** Faint, low-contrast 1px hairlines tuned to read over both the `#161927`
  pasteboard and the `#3d4253` frame backdrop without occluding shapes; the major lines are a hair
  stronger. Display-only (`aria-hidden`).

## Capabilities

- **`designer-canvas-viewport`** (MODIFIED + ADDED): the "Canvas zoom controls and Ctrl-wheel
  zoom" requirement's upper bound changes from 400% to 6400% (lower bound stays the dynamic
  cover-fit minimum from B-027). A new "Pixel grid at high zoom" requirement is ADDED (threshold,
  whole-pasteboard coverage, pixel-accurate ruler-aligned lines, non-interactive).

## Impact

- `apps/designer/src/renderer/features/canvas/CanvasArea.tsx` — `ZOOM_MAX` 4 → 64; render the
  `s.pixelGrid` layer (gated on `pixelGridVisible(zoom)`) inside the stage; stale "10..400%"
  comment corrected.
- `apps/designer/src/renderer/features/canvas/geometry.ts` — `PIXEL_GRID_MIN_ZOOM` (8),
  `PIXEL_GRID_MAJOR_EVERY` (10), `pixelGridVisible`, `pixelGridMetrics`.
- `apps/designer/src/renderer/features/canvas/CanvasArea.css.ts` — `s.pixelGrid` layer style.
- Tests: `pasteboard.test.ts` (threshold + metrics + ruler-alignment); E2E `pixel-grid.spec.ts`
  (grid present at 1600% / absent at 100%, max reaches 6400%, a 1px nudge moves exactly 1 scene px).
- Docs: canvas feature `README.md` (pixel-grid section); PRD `docs/prd/designer.md` D-120.
