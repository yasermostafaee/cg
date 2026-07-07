# Design — B-042 pixel-grid ↔ content sub-pixel alignment

## Recon (measured on the built dist, Playwright-driven Chromium)

Setup per the B-042 repro: new project (1920×1080 → pasteboard 11920×7080, frame offset
(5000, 3000)), Rectangle X=0 Y=0 W=320 H=120, zoomed to the target, scrolled so the right edge
(scene x=320) is mid-viewport. Two probes:

1. **Arithmetic probe** — reads `getBoundingClientRect()` of the outer viewport / stage / iframe /
   grid canvas plus the canvas backing size, recomputes `rulerOrigin` exactly as
   `CanvasArea.measure()` does, and diffs — per integer scene column across the viewport — the
   grid's painted-stroke device position (drawPixelGrid's `round(cssPos·dpr)+0.5`, mapped through
   the canvas's CSS placement + backing stretch) against the content's composited device position
   (`(iframeRect.left + (frameOffset + X)·zoom)·dpr`).
2. **Ground-truth probe** — full-page device-scale screenshots; scanline analysis detects the
   rectangle's right edge (fill `#BEBEBE` → backdrop, sub-pixel via the luminance crossing) and the
   grid strokes (centroid of the faint hairline bumps), plus a reference stroke injected into the
   grid canvas at a known internal x to measure the canvas LAYER's real composited offset.

### Findings

- **Environment fractions are everywhere.** In the standard studio layout the canvas viewport's
  border box sits at CSS x = **298.390625** — a fractional device position at every dpr (even
  dpr 1). The stage rect carries additional 1/64-CSS-px fractions beyond `scrollLeft` (LayoutNG
  subpixel units). So both the grid canvas layer and the content layer live at fractional device
  positions in completely default conditions — no fractional display scale needed.
- **The content (scaled iframe) composites UN-snapped, at its ideal position.** Measured layer
  displacement of the rendered edge vs the ideal `(iframeRect.left + 5320·zoom)·dpr`: **+0.22 /
  +0.09 / −0.01 device px at dpr 1 / 1.25 / 1.5** (within measurement noise; edge luminance
  profiles show the ~2-px anti-aliased spread of an unsnapped edge). The prompt's hypothesis that
  the content is composited with no device-pixel snapping is CONFIRMED.
- **The grid's painted strokes do NOT land where its math says.**
  - _Backing stretch:_ the canvas backing store is `Math.round(viewport.w·dpr)` device px but the
    CSS box is `viewport.w` CSS px → the bitmap is scaled by `round(w·dpr)/(w·dpr)` — measured
    **1.00031017** at dpr 1.25 (645 CSS px viewport → 806 backing px shown at 806.25 device px).
  - _Layer displacement:_ with the canvas at a fractional device position the compositor snapped
    the whole layer at dpr 1 (strokes shifted **−0.39** device px = the fractional part) and
    displaced strokes **−0.5** device px at dpr 1.25 (injected-stroke measurement; per-dpr raster
    heuristics — not a rule we can predict from JS).
- **Drift signatures (arithmetic probe, stroke-center vs content-boundary − the ideal ½):**
  - dpr 1 / dpr 2 at 6400% (`zoom·dpr` integer): CONSTANT +0.02 / +0.03 device px — masked, as the
    bug report predicted (signature a).
  - dpr 1.25 at 6400%: **ramp 0.18 → 0.66 device px across 20 columns** (+0.025/column = the
    stretch × the 80-device-px cell) — misalignment GROWS across the viewport and exceeds the ½
    promise (signature c); the constant part changes with scroll (fractional effective origin).
  - 4977% (`zoom·dpr` fractional, any dpr): repeating beat, deltas cycling 0.01 → 0.94 device px
    with period ≈ `1/frac(zoom·dpr)` columns (signature b) — the owner's "repeating pattern".
  - 800% (threshold) at dpr 1.25: same class, up to ~0.9 device px.

### Root cause (confirmed)

The pixel grid and the stage content share the same ideal CSS-space math, but the grid's strokes
are painted through a chain that displaces them from the physical raster its snap assumed: (1) the
canvas bitmap is stretched by `round(w·dpr)/(w·dpr)` because the backing store is device-rounded
while the CSS box is not — the error grows linearly across the viewport; (2) the canvas element
itself sits at a fractional device position, so the compositor snaps or resamples the whole layer
by up to ±0.5 device px in a dpr-dependent way; and (3) even with (1)+(2) fixed, snapping each line
to the raster while the content composites un-snapped (measured: the scaled iframe rasterizes at
its ideal fractional position) leaves the per-line snap residual — constant when `zoom·dpr` is
integer, a repeating ~1-device-px-amplitude beat when fractional. (1) and (2) are defects — they
break D-120's own ≤½-device-px promise and its crispness at fractional dpr (the resampled strokes
smear). (3) is the mathematical floor of any crisp-line design and is exactly the ≤½ tolerance the
new requirement pins.

## Decision

**Fix the grid side; leave the stage/scroll pipeline untouched.** Make the canvas layer a faithful
window onto the physical raster, then snap each line to the PHYSICAL pixel nearest its true screen
position:

1. `gridCanvasAlignment(screenCssPos, dpr)` (pure, per axis) → the canvas's integer device origin
   `floor(screenCssPos·dpr)` (FLOOR, so the nudge is always ≤ 0 and never uncovers the viewport's
   leading edge), the sub-CSS-px `nudgeCss = (origin − screenCssPos·dpr)/dpr` applied to the
   canvas's `left`/`top` so the layer starts ON the raster (nothing to snap/resample), and the
   `phase = screenCssPos·dpr − origin ∈ [0, 1)` used by the line snap.
2. Backing-exact sizing (`gridBackingSize`): `canvas.width = round(viewport·dpr) + 2` (the
   overspan re-covers the ≤1-device-px floor nudge on each edge; the overlay clips the overhang);
   `canvas.style.width = canvas.width/dpr` CSS px → raster scale exactly 1 (stretch gone).
3. `pixelGridLines(origin, zoom, length, dpr, phase)`: stroke center `round(cssPos·dpr + phase) +
0.5` canvas-internal ≡ `round(trueScreenDevice) + 0.5` on screen — within ≤½ device px of the
   content's composited edge, by construction, at every zoom/dpr.

Residual error sources after the fix: LayoutNG quantizes the nudge/size to 1/64 CSS px → ≤ ~0.02
device px; the snap residual ≤ 0.5 device px (constant across the view at integer `zoom·dpr`,
e.g. 6400% at dpr 1/1.25/1.5/2 → cell steps 64/80/96/128). Verified post-fix by re-running the
ground-truth probe.

### Alternatives considered

- **Snap the stage's effective translation (scroll/origin) to the device raster** (candidate 1 in
  the bug): rejected. It touches the B-027/B-035 scroll+center invariants and smooth-scroll paths
  for no sufficient gain — it can zero the CONSTANT part of the residual at integer `zoom·dpr`, but
  cannot remove the fractional-`zoom·dpr` beat (the per-cell step itself is fractional on the
  raster), and it does nothing about the grid-side stretch/layer displacement, which recon shows
  are the parts that actually break the ≤½ promise. The content also cannot be per-element snapped
  — it is one scaled layer.
- **Derive the grid from the stage's measured composited transform** (candidate 2): partially
  adopted — the fix derives the grid from measured SCREEN geometry (the overlay's real device
  position). Fully deriving from "where the content actually rasterized" is not possible from JS:
  `getBoundingClientRect` reports ideal geometry and cannot see compositor raster placement (recon
  measured ~1-device-px arithmetic-vs-ground-truth gaps pre-fix). Instead the fix makes the grid
  layer placement EXACT (integer device origin, scale 1) so measured-ideal == rasterized for the
  grid, and relies on the measured fact that the content composites at ideal position.
- **Per-line un-snapping** (draw lines at fractional positions to follow content exactly):
  disallowed by the bug filing and by D-120 — it reintroduces the blurred/doubled hairlines the
  canvas approach exists to fix.

### Non-goals / guarded invariants

- No change to `pasteboardLayout`, cover-fit min zoom, fit/center math, scroll behavior, or the
  preview iframe markup/transform (B-027 / B-035 / D-071 untouched).
- Grid↔ruler stays ≤ ½ device px: the mapping (`rulerOrigin + X·zoom`) is unchanged; only the snap
  target moved by the overlay's sub-device-pixel phase (< 1 device px, and the rulers rasterize
  through the same overlay geometry).
- The ResizeObserver/scroll → `measure()` → redraw loop is unchanged; the nudge is derived from the
  OUTER viewport's rect (never from the canvas's own rect), so there is no feedback loop.
