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

## Take 3 — PAINT truth (2026-07-07; supersedes the layout-based analysis above)

The owner still saw the misalignment after the grid-side fix while every DOM-level probe read
clean. Verification authority moved to SCREENSHOT PIXELS (the owner's screen recording +
lossless Playwright captures on the owner's own machine — this dev machine runs Windows 125%
scaling natively, so headed system Chrome here IS the affected compositor). Probe = layout
diagnostics only, from here on.

### Retractions (falsified by paint measurement)

1. **"The content composites un-snapped at its ideal position"** (take-2 recon) — FALSE at the
   paint level. Forcing the stage's device phase from .9453→.9844 (real) and .9922→.0313
   (emulated) produced BYTE-IDENTICAL painted output: sub-CSS-pixel layout offsets of the stage
   NEVER reach paint. The take-2 "≈0 displacement" readings measured the smear's centroid near
   those phases, not honest compositing.
2. **"Horizontal is clean at integer coords"** (2c finding) — layout-based; the owner's eyes see
   paint. The painted edge can sit ~1 device px off the crisp stroke while every rect/bitmap
   probe reads ≤0.05.
3. **2c Directive 1 (grid follows the stage's LAYOUT phase) is unsound** — layout phase ≠ painted
   phase. Discarded; the shipped ideal-raster grid stays as-is.

### Paint-truth evidence (lossless captures, pre-fix build `8ed5a52+probe2`, dpr 1.25)

- **Grid strokes are paint-perfect**: a pure-stroke luminance profile shows a single-device-pixel
  bump exactly at the layout-predicted pixel (real compositor: stroke center phase 34.5 ≡
  `round(E)+0.5` predicted 34.5). The D-120/B-042 canvas pin holds on real GPU.
- **Content edges are NOT**: the shape's edges paint as 1.6–3.5-device-px SMEARS whose width and
  sub-pixel placement vary with the stage's device phase but do not track sub-pixel layout moves
  (real, phase .9453/.6758 — X edge spread over cols 993–994 `[175, 155.3]`, Y rows 267–268
  `[139.4, 186.3]`; emulated, phase .719 — X spread `[178.6, 148, 122.1, 101.4]` ≈ 3.5 px). A
  soft, quantized edge against a crisp exact stroke is the visible defect — "slightly before or
  after, in a repeating pattern," identical for drags and arrow moves, invisible to every DOM
  API. The owner's video (1920×976 device px) confirms the setup and the in-frame probe numbers,
  but H.264 mosquito noise (~12-px ringing next to edges) makes faint-hairline sub-pixel
  measurement from video impossible — owner-side paint numbers need lossless Win+Shift+S PNGs.
- **Gizmo at fractional coords** (layout-level, still real and in scope): the selection overlay
  projects the RAW model coordinate while the preview lays out floor-quantized to the 1/64-CSS-px
  LayoutUnit lattice (measured: `style.left = 2.2749px` → rect 2.265625) → gizmo sits up to
  `zoom·dpr/64` = 1.25 device px OUTSIDE the rendered edge (owner-measured +1.0156), exactly 0 at
  integer coords. The earlier SVG-bbox-artifact theory is refuted (bbox−points = 0.0002).

### Mechanism isolation — inconclusive, fix premise refuted

Minimal mocks of the app's structure (11920-css-px stage × `scale(64)` as a div, as a scaled
iframe, and as an unscaled iframe with the scale inside) all paint CRISP and offset-honest under
emulation — the app's smear does not reproduce in isolation. In-app bisects ruled out the
element's own transform (`computed: none`; clearing it changes nothing). The specific Chromium
raster-scale/quantization trigger in the app's compositing stack (suspects: the scaled layer's
enormous internal offsets at deep scroll, raster-scale caps for the 762,880-css-px scaled
subject) remains UNPROVEN — an offset-magnitude mock produced its own artifacts.

Consequence: the "pin every layer with sub-CSS-px nudges" direction CANNOT work — the compositor
provably discards sub-pixel placement of this layer, so no layout-side nudge can make layout ==
paint for the stage. Stop-loss invoked: no further fix rounds until the direction is reassessed
with the owner.

### Candidate directions for reassessment

- **A. Sliding-window re-anchor (preferred spike):** keep the scroll/layout model; re-anchor the
  preview iframe near the viewport in integer scene steps on coarse scroll boundaries (iframe
  `left/top` + matched `--cg-frame-x/-y` adjustments through the existing CSS-var seam) so the
  SCALED layer's internal offsets stay small. Hypothesis (unproven): restores full-scale crisp
  rasterization. Requires a paint-profile spike BEFORE design; bends the "frame var updates only
  on resolution change" note in B-027/D-071.
- **B. Zoom-dependent pasteboard extent** at pixel-grid zooms (shrink the scaled subject):
  simpler compositing story, but touches B-027's fixed-extent contract — owner decision.
- **C. Chromium upstream**: if A's spike still smears at small offsets, build a reduced repro and
  file it; document the limitation honestly in the meantime.
- **Orthogonal, ready to implement after reassessment:** the gizmo LayoutUnit quantization fix
  (fractional-coords ≤0.25 dev px acceptance), ruler-mark/grid lockstep, probe Y instrumentation
  (already in the served preview build).

### Verification protocol for any future fix

Acceptance = screenshot pixels: Playwright `page.screenshot({scale:'device'})` luminance profiles
at content edges vs strokes (emulated dpr 1/1.25/2 AND headed native Chrome on the affected
machine), plus owner-taken lossless PNGs (right edge + top edge, deselected, integer coords,
6400%) measured the same way. Video captures are diagnostics only (compression noise).

## Take 4 — Spike A verdict: PASS via the WINDOWED STAGE (2026-07-07) — SUPERSEDED by Take 5

> RETRACTED. Take 4's "content smear" evidence was measurement pollution (see Take 5): the
> profiles were taken with the shape silently SELECTED, and the gizmo's 1-css-px accent border
> (luminance ≈ 148 — the exact mid-values in every "smear" profile) straddles the very edge being
> measured. Verified-deselected dual-build profiles show the content was ALWAYS crisp and the
> windowed stage changes nothing (and breaks real-compositor rendering). Kept for the honest
> record of how the wrong conclusion was reached.

### Mechanism, finally isolated (elimination + reproduction)

Exonerated by direct paint measurement: offset magnitude (byte-identical smear after relocating
the view from −339,826 to −242 css inside the layer), the authoring document itself (the app's
live `srcdoc`, scripts stripped, paints CRISP in isolation at app magnitudes — 0 mixed px),
scale-on-iframe vs scale-on-wrapper (both crisp in isolation), authoring styles (shadow /
checkerboard / clip-lift / outline / body toggles), the element's own transform (`computed:
none`), perpetual animation (0 rAF/s, 0 animations; freezing changes nothing), and raster-scale
history (50 stepped scale changes stay crisp in isolation; recreating the app's layer keeps the
smear).

What remains — and fits every observation: **the promoted composited layer's BOUNDS**. In the app
the scaled stage subtree is always promoted (composited scrolling contents; `position:fixed`
also promotes; overlap with the grid canvas/chrome layers too — CDP LayerTree shows one layer of
**762,880 × 453,120 css** carrying the stage). For a layer that size Chromium clamps the raster
scale, and the content is upscaled — the 1.6–3.5-device-px edge smear, immune to phase, anchor,
and structural surgery, because every variant kept the promoted unit enormous. The isolation
mocks were crisp because nothing promoted them (root tiling). Shrinking only the IFRAME did not
help (the huge stage div stayed the promoted unit).

**Proof:** shrinking the ENTIRE scaled unit (stage div + iframe) to a ~560×460-scene-px window
positioned at an integer-scene anchor over a full-extent solid spacer flips the paint crisp:
REAL native compositor @6400%: X edge mixed 1 px, paint−layout Δ +0.066 dev px, the edge ON the
grid stroke's pixel (was: 2-px smear, Δ +0.70). Emulated @6400% and @4977%: mixed 1–2 px (was 3),
byte-identical paint across different anchors at integer `zoom·dpr` (no seams), and sub-pixel
layout offsets now reach paint (honest AA). Real-mode matrix beyond the first read was garbled by
the app's frameOffset repost stream racing the spike's DOM surgery — a harness artifact; the
implementation owns the window coherently and its screenshot tests re-verify on the real
compositor.

### The fix — windowed stage over a spacer (design)

- `centerWrap` renders a full-extent **spacer** (extent·zoom, `#161927` + the B-027 edge ring)
  that keeps `stageRef` + `data-testid="canvas-stage"` — every existing measurement/scroll/fit
  path (rulers, grid, overlay, fit-center, cover-fit, E2E, probe) reads the SAME geometry as
  today, unchanged. `CanvasOverlay` stays full-extent (hit-testing/gizmo untouched).
- Inside it, a **stage window**: `windowScene = ceil(viewport/zoom) + 2·64` scene px per axis
  (clamped to the extent), positioned at an **integer-scene anchor** (clamped), holding the
  iframe sized to `windowScene` scene units with the same `scale(zoom)`. At fit/normal zooms the
  clamp makes the window the whole extent — one code path, today's behavior.
- Re-anchor on scroll with hysteresis (when the viewport edge comes within 32 scene px of the
  window edge), computed in the existing `measure()` (per-event, React-batched — no observers,
  no loops). The window's css position is quantized to the device raster at fractional
  `zoom·dpr` (at 6400%/common dprs the integer-scene anchor is already device-integer — the
  spike measured byte-identical paint across anchor steps there).
- The iframe's frame inset rides the EXISTING seam: every message that carries `frameOffset` now
  sends `{x: frame.x − anchor.x, y: frame.y − anchor.y}`; the iframe's `--cg-frame-x/-y` update
  live (no reload). **Explicit D-071/B-027 bend (owner-approved):** the frame var now changes on
  RE-ANCHOR (a coarse scroll event), not only on resolution change. The MODEL pasteboard extent,
  scroll range, cover-fit and fit-center math are untouched.
- Ships together with the parked **gizmo LayoutUnit-quantization fix** (`layoutQuantize`;
  fractional-coords ≤ 0.25 dev px acceptance, no-op at integer coords).
- Acceptance tests move to SCREENSHOT-PIXEL assertions (`pixel-paint.spec.ts`): dpr 1 / 1.25 / 2
  × {6400%, a fractional zoom}, forced fractional stage phases, deep scroll, BOTH axes,
  deselected + selected, plus anchor-step paint invariance. Red baselines = the spike's BEFORE
  profiles (recorded above); the suite must show the windowed build green.

## Take 5 — the VERIFIED truth: the content never smeared; the final fix set (2026-07-07)

### The confound that produced Takes 3–4

The spike's implementation screenshot exposed it: the shape was SELECTED in the profiled runs —
the "deselect" click had silently failed (at 6400% the shape fills most of the viewport left of
x=320; a click there re-selects; one variant even landed on the ruler). The selection gizmo's
1-css-px accent border (luminance ≈ 148) is CENTERED on the very edge every profile measured — the
"1.6–3.5-device-px content smear" profiles (`178.6, 148, 122.1, 101.4`) are exactly
fill → accent-blend → accent → backdrop-blend. Every downstream conclusion (compositor raster
clamp, offsets-never-reach-paint, the windowed stage) chased that artifact.

### Verified-deselected, dual-build paint profiles (the decisive measurement)

With deselection PROVEN (gizmo absent, element inspector closed) on both the committed baseline
(8ed5a52) and the windowed build, emulated dpr 1.25 AND the real native compositor, stage phases
forced to the owner's (≈ .97, .68):

- **Baseline DESELECTED is CRISP on both compositors** — X: `190×6, 149.1, 106.5, 96.5…` (one
  mixed px); Y: `95.4×6, 175.7, 192.1, 190.1…` (one mixed px); real native: X one mixed px, Y
  zero. The content paints at its layout position with one honest AA pixel. THERE NEVER WAS a
  content smear.
- **The windowed build is byte-identical under emulation and BREAKS real-native rendering** (fill
  missing below the top edge in its window) — dropped entirely.

### What remains true and owner-visible — the final fix set

1. **Grid strokes: containing-pixel snap** (`floor` instead of `round` in `pixelGridLines`). The
   content paints at layout; the stage's device phase is arbitrary (owner-measured Y ≈ 0.68 in
   every reading, X a scroll lottery). `round` puts the whole stroke one pixel PAST an edge at
   phases > ½ — the +0.81-device-px Y offset both the probe measured and the owner sees. With
   `floor` the stroke is the pixel the lattice line passes through: center ≤ ½ device px from the
   line at ANY phase, constant residual at integer `zoom·dpr`. Ruler tick marks snap to the SAME
   pixel (`snapMarkToGridPixel`, 1 device px) so grid↔ruler cannot split.
2. **Gizmo LayoutUnit quantization** (`quantizeBoxToLayout`, visual projection only): the engine
   lays the box out on the 1/64-css lattice (truncated — measured `2.2749px → 2.265625`); the
   gizmo now traces that box, eliminating the up-to-1.25-device-px outward error at fractional
   coords (owner-measured +1.0156; no-op at integer coords).
3. **Gizmo frame stroke = 1 DEVICE px** (was 1 css px = a fuzzy 1.25-device band at dpr 1.25,
   straddling the judged edge — the thing the owner actually stares at when working selected).
   Centered on the rendered edge; stays honest for fractional placement (D-122's decision governs
   placement snapping, not the border).

Acceptance: `pixel-paint.spec.ts` (VERIFIED selection states, screenshot pixels, dpr 1/1.25/2 ×
{fractional zoom, 6400%}, forced owner phases, both axes) + the retargeted bitmap/unit suites
(containing-pixel convention). The stage, scroll, extent, iframe structure: all untouched — the
B-027/B-035/D-071 invariants hold by construction.

## Take 6 — the residual defect is STALE RASTER, not alignment: B-045 + the position pin (2026-07-08)

### The owner's grid.jpg, reconciled pixel-by-pixel

The owner's post-fix screenshot (SELECTED, right edge, X=6.69 — JPEG 4:2:0, luma noise
σ ≈ 1–2.3, usable) anchored to layout by two independent features (crop offset −4.45 agrees on
both): grid strokes measured at device 1201.52 / spacing exactly 80 — EXACT vs layout; gizmo
accent at 1176.95 vs 1176.9995 — EXACT. The painted content edge: device ≈ 1154.45 = scene
**326.40625**, i.e. **22.5 device px (exactly 18/64 scene px) LEFT of layout (326.6875) — the
element's PREVIOUS rendered position**. The fix set (Take 5) is correct as measured; what the
owner still sees is a different defect: **paint that does not follow small position edits**.

### The defect, isolated (filed as B-045)

Deterministic on BOTH compositors (X 6.4125 → 6.69 via the app, no scroll/zoom after): real
native paint frozen at the previous position (Δ −23.008 device px) through +3 s idle AND a
scroll jog; DOM truth clean the whole time (ONE node; style/computed/rect all at the new value).
The scene-replace path REBUILDS the runtime DOM (`remove()` + `createRuntime`) — node
replacement does not invalidate the stale tiles either. Standalone testbed (no app): a
`transform: scale(64)` div + absolutely-positioned child reproduces raw `left` staleness on
native AND emulated, iframe present or not — a pure Chromium raster-invalidation defect
(upstream package: `b045-chromium-repro/` in the session scratchpad; owner submits).

### What measurement killed, and what it proved

- **Every "forced invalidation" poke fails on both compositors**: parent-doc overlay, in-iframe
  overlay over old∪new rects, element outline/opacity/visibility toggles, and a
  `will-change: transform` promote/demote round-trip — the stale pixels survive all of them.
  "Scoped repaint poke" is not an available mitigation in this Chromium.
- **Move-size mapping (direct style writes, native)**: Δ2.0 css repaints exactly (Δ −0.008);
  Δ1.0 css (the ARROW-STEP class) and sub-css deltas stay stale. The original B-042 "repeating
  pattern" arrow-key reports were this defect all along.
- **`transform: translate()` never misses**: with the raster stale, adding a translate moved the
  painted content by EXACTLY the translate amount (+55.0 device px for 0.6875 css) — compositor-
  tracked, applied even on top of a stale base.
- **Decomposition validated end-to-end** (testbed, 2 envs × 2 variants × full gauntlet incl.
  sub-css and exact-1-css steps): box pinned at `left/top: 0` + position in
  `translate(trunc(v·64)/64 px)` paints at layout within ≤ 0.001 device px at EVERY step.

### The mitigation — authoring-only position pin (preview.ts)

On the CANVAS document only (`REVEAL_ON_LOAD` gate; broadcast modal and exported `.vcg`/HTML
untouched — playout output byte-identical): a realm-local patch of
`HTMLElement.prototype.style` returns, for `[data-cg-element-id]` hosts, a per-element Proxy
that reroutes every `left`/`top` write — scene-builder, bindings, animation-applier ticks —
synchronously (before any paint) into `left/top: 0` + a `translate(x, y)` PREFIX on the inline
transform. The box never moves ⇒ nothing to mis-invalidate; the translate carries the position
and is compositor-exact. Key properties:

- **Lattice parity**: the translate is quantized to `trunc(v·64)/64` (Blink LayoutUnit), so the
  rendered geometry is IDENTICAL to the `left/top` layout it replaces — pixel parity with
  playout, and the gizmo's `quantizeBoxToLayout` projection stays exact.
- **Origin-safe for any anchor**: a translate composed FIRST commutes out of the
  transform-origin conjugation — rotation/scale about any anchor are unchanged.
- **Unambiguous interception**: a MutationObserver cannot distinguish an engine-written `'0px'`
  from the pin's own; the Proxy sees the raw intended value at write time. A childList observer
  remains as a safety net (pins any node styled before its `data-cg-element-id` stamp, still
  pre-paint). Reads of `left`/`top`/`transform` through the proxy return the LOGICAL values.
- **RTL hug-text opt-out**: `left:'auto'` + `right` re-anchoring restores raw state and opts the
  element out (documented scope limit; D-096 removes the whole shim).

### Post-fix numbers

- Real native: painted edge follows the fractional edit to **−0.008 device px**, stable through
  idle + scroll jog (was −23.008). Emulated: −0.719 (and the emulated integer-css paint snap is
  gone too — fractional placement now paints fractional there as well, slightly filtered, which
  the E2E measures with a coverage-integral estimator).
- Red→green on the exact shipped test (`B-045 stale paint`, pixel-paint.spec.ts): pre-pin tree
  fails "painted edge must FOLLOW the layout edge (moved 80.0 of 22.5 device px)"; pinned build
  passes. Full pixel-paint suite (B-045 + all six B-042 paint-truth tests, dpr 1/1.25/2): 7/7.
- Drag frame-times at 6400% (headed native, 120 Hz display, 150-move drag): mean 8.33 → 8.35 ms,
  p95 8.5 → 8.7 ms, frames >25 ms: 0 → 0. The pin's cost is noise.
