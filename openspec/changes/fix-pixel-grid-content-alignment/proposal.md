# Pixel grid ↔ rendered content alignment at high zoom (B-042)

## Why

D-120's pixel grid snaps each line to the device-pixel raster (crisp 1-physical-px strokes at any
zoom) using the same `rulerOrigin + X·zoom` mapping the rulers use — but the owner reports (with
screenshots, at 6400%) that a rendered shape edge at an integer scene coordinate does NOT sit on its
grid line: it is slightly before or after it, and the offset varies along the canvas in a repeating
pattern. Recon (measured, not eyeballed — see `design.md`) confirms it and pins the cause: the grid's
painted strokes do not land where its own math says. The grid `<canvas>`'s backing store is
`round(viewport·dpr)` device px but its CSS box is `viewport` CSS px, so the bitmap is stretched by
`round(w·dpr)/(w·dpr)` (1.00031 measured at dpr 1.25) and the error GROWS across the viewport past
the ≤½-device-px promise; and the canvas element sits at a fractional device position (the studio
layout puts the canvas viewport at CSS x = 298.390625 — fractional at EVERY dpr), so the compositor
either snaps the whole layer (dpr 1: −0.39 px measured) or displaces/resamples it (dpr 1.25: −0.5 px
measured). The scaled preview iframe, by contrast, composites at its ideal (fractional,
anti-aliased) position — measured layer displacement ≈ 0 (±0.2) at dpr 1 / 1.25 / 1.5. The content
is right; the grid is what must move.

## What Changes

- **Device-raster-align the grid `<canvas>` layer.** `drawPixelGrid` sizes the canvas FROM the
  device: backing store `round(viewport·dpr)` device px displayed at exactly `backing/dpr` CSS px
  (raster scale exactly 1 — kills the stretch), and nudges the canvas element by a sub-CSS-pixel
  `left`/`top` offset so its screen position lands ON an integer device pixel (nothing for the
  compositor to snap or resample — kills the layer displacement). Both come from a new pure helper
  `gridCanvasAlignment(screenCssPos, dpr)` in `geometry.ts`.
- **Snap grid lines on the SCREEN raster, not the canvas-internal raster.** `pixelGridLines` gains a
  `rasterPhase` parameter — the overlay's fractional device offset (`screenCss·dpr −
round(screenCss·dpr)`) — so each line's stroke lands on the PHYSICAL pixel nearest its true screen
  position: `round(cssPos·dpr + phase) + 0.5` canvas-internal ≙ `round(trueScreenDevice) + 0.5` on
  screen. Default `phase = 0` keeps the existing call shape/tests valid.
- **Grid↔content alignment becomes a spec'd guarantee.** With the content measured to composite at
  its ideal position, the only remaining disagreement is the unavoidable per-line snap residual —
  ≤ ½ device px at every zoom ≥ the threshold and every dpr, and CONSTANT (uniform across the view)
  when `zoom·dpr` is integer (e.g. 6400% at dpr 1 / 1.25 / 1.5 / 2). D-120's guarantees are kept:
  crisp single-physical-pixel strokes at any zoom (now genuinely crisp at fractional dpr too — the
  pre-fix resample smeared them), grid↔ruler ≤ ½ device px (same mapping, only the snap target
  changed by < 1 device px), 1-px nudge still moves one cell. The stage / scroll pipeline (B-027
  pasteboard, B-035 fit+center) is UNTOUCHED — no stage-side snapping, no scroll behavior change.

## Capabilities

- **`designer-canvas-viewport`** (MODIFIED): the "Pixel grid at high zoom" requirement gains
  CONTENT alignment — an edge at an integer scene coordinate renders within ≤ ½ device px of its
  grid line at every zoom ≥ the threshold and every dpr (including fractional 1.25 / 1.5), with no
  position-dependent growth across the viewport — plus the device-raster-aligned canvas layer
  (backing = CSS·dpr exactly; integer-device-px layer origin) that makes the snap physical.

## Impact

- `apps/designer/src/renderer/features/canvas/geometry.ts` — `gridCanvasAlignment` (new pure
  helper: integer device origin + sub-CSS-px nudge + raster phase); `pixelGridLines` gains the
  optional `rasterPhase` argument.
- `apps/designer/src/renderer/features/canvas/CanvasArea.tsx` — `drawPixelGrid` takes the overlay's
  screen position, applies the nudge (`style.left/top`), sizes the canvas backing-exact
  (`style.width/height = backing/dpr`), and draws with the phase; the redraw effect passes the
  outer viewport's live `getBoundingClientRect()` position.
- Tests: `pasteboard.test.ts` (alignment helper; grid-line ↔ content agreement ≤ ½ device px for
  representative (zoom, dpr, origin, phase) tuples incl. fractional dpr + fractional scroll); E2E
  `pixel-grid.spec.ts` (at 6400% AND a fractional zoom, for `deviceScaleFactor` 1 / 1.25 / 2:
  rectangle edges at integer scene coords lie within ≤ ½ device px of their grid lines — asserted
  numerically from bounding rects + the drawn-line math; canvas layer device-aligned; ruler↔grid
  unchanged; 1-px nudge still moves one cell).
- Docs: canvas feature `README.md` (grid contract: screen-raster snapping + device-aligned layer);
  PRD `docs/prd/bugs-designer.md` B-042.
