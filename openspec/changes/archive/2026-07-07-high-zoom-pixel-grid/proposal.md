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
- **Rendering approach — a device-pixel-snapped `<canvas>`.** The grid is NOT a CSS gradient: a
  `repeating`/sized gradient has a fixed period of `zoom` px, which at FRACTIONAL zoom (e.g. 48.08px
  at 4808%) drifts every line off the device-pixel raster, so the browser anti-aliases each 1px line
  across two physical pixels — doubled/blurry at fractional scales, crisp only at integer ones.
  Instead the grid is a viewport-sized `<canvas>` (`s.pixelGrid`, `pointer-events: none`) that is the
  BOTTOM layer of the non-scrolling ruler overlay (`s.overlay`), tracking the stage via `rulerOrigin`
  exactly as the rulers do. `drawPixelGrid` repaints it whenever `rulerOrigin` (scroll), zoom, or the
  viewport changes, via `pixelGridLines(origin, zoom, lengthCss, dpr)`: it **culls** to the visible
  region (only ~viewport/zoom lines — a few dozen at high zoom) and snaps each line to
  `Math.round(pos·dpr) + 0.5`, so a 1-device-px stroke lands on a single physical pixel — crisp at
  ANY zoom, HiDPI included. The canvas paints lightly over the scroll content (shapes + gizmos) and
  under the rulers/guides; hit-testing stays on the canvas below the overlay.
- **Pixel-accurate, ruler-aligned (no drift).** A line for scene X is drawn at `rulerOrigin + X·zoom`
  — the SAME mapping the rulers use — then snapped to the device pixel. Because each line is snapped
  INDEPENDENTLY, the correction never accumulates: every line stays within half a device pixel of its
  true scene coordinate (invisible as position at high zoom, decisive for crispness), so the grid
  never drifts from the rulers (unit tests pin both the snapping and the ≤ half-device-pixel
  alignment). Every 10th line (`scene % 10 === 0` → scene 0 / ±10 / ±20, the round ruler labels) is a
  hair stronger (graph-paper).
- **Appearance.** Faint, low-contrast 1px hairlines tuned to read over both the `#161927`
  pasteboard and the `#3d4253` frame backdrop without occluding shapes; the major lines are a hair
  stronger. Display-only (`aria-hidden`).

## Capabilities

- **`designer-canvas-viewport`** (MODIFIED + ADDED): the "Canvas zoom controls and Ctrl-wheel
  zoom" requirement's upper bound changes from 400% to 6400% (lower bound stays the dynamic
  cover-fit minimum from B-027). A new "Pixel grid at high zoom" requirement is ADDED (threshold,
  whole-pasteboard coverage, device-pixel-snapped crisp ruler-aligned lines, non-interactive).

## Impact

- `apps/designer/src/renderer/features/canvas/CanvasArea.tsx` — `ZOOM_MAX` 4 → 64; render the
  `s.pixelGrid` `<canvas>` (gated on `pixelGridVisible(zoom)`) as the bottom layer of the ruler
  overlay; `drawPixelGrid` redraw effect; stale "10..400%" comment corrected.
- `apps/designer/src/renderer/features/canvas/geometry.ts` — `PIXEL_GRID_MIN_ZOOM` (8),
  `PIXEL_GRID_MAJOR_EVERY` (10), `pixelGridVisible`, `pixelGridLines` (device-pixel-snapped,
  viewport-culled line positions).
- `apps/designer/src/renderer/features/canvas/CanvasArea.css.ts` — `s.pixelGrid` canvas style.
- Tests: `pasteboard.test.ts` (threshold + device-pixel snapping at fractional zoom + HiDPI +
  ≤ half-device-pixel ruler alignment + culling + major detection); E2E `pixel-grid.spec.ts`
  (grid present at 1600% / absent at 100%, max reaches 6400%, a 1px nudge moves exactly 1 scene px).
- Docs: canvas feature `README.md` (pixel-grid section); PRD `docs/prd/designer.md` D-120.
