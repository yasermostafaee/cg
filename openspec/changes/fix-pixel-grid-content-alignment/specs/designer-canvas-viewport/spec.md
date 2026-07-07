# designer-canvas-viewport (B-042 delta)

## MODIFIED Requirements

### Requirement: Pixel grid at high zoom

The canvas SHALL render a pixel grid — hairline lines at every integer scene-pixel boundary, one
cell = one scene pixel — over the WHOLE pasteboard extent (not just the frame), shown ONLY when one
scene pixel maps to at least 8 screen px (zoom ≥ 800%) and hidden below that threshold so a normal
zoom is not cluttered by an illegible smear. Each grid line SHALL sit on its integer scene coordinate
using the SAME scene→screen mapping the rest of the canvas uses (`(x + frameOffset)·zoom`) so the grid
is ruler-aligned and never drifts; the cell SHALL track the zoom and the grid SHALL scroll and zoom
WITH the pasteboard content. Every grid line SHALL be CRISP — a single 1-physical-pixel line — at ANY
zoom, including FRACTIONAL scales (e.g. 4808%) and HiDPI or FRACTIONAL `devicePixelRatio` (1.25 /
1.5 / 2): each line's screen position SHALL be snapped to the PHYSICAL device-pixel raster (so a 1px
stroke never anti-aliases across two pixels), snapped INDEPENDENTLY so the correction never
accumulates and each line stays within half a device pixel of its true scene coordinate (invisible as
position, decisive for crispness). The grid layer itself SHALL be a faithful window onto the physical
raster: its backing store SHALL cover its CSS box at raster scale EXACTLY 1 (backing device px ==
CSS px · dpr), and its screen origin SHALL land on an integer device pixel (a sub-CSS-pixel offset
correction), so the painted strokes are neither stretched across the viewport nor displaced/resampled
by the compositor — the snap the math computes is the snap that rasterizes. Each stroke SHALL be the
device pixel CONTAINING its line's true screen position (floor, not nearest-rounding): the stage
composites at an arbitrary per-axis device phase, and nearest-rounding put whole strokes one pixel
PAST every content edge at phases above ½ (owner-visible on the Y axis at phase ≈ 0.69). Under the
containing-pixel rule the stroke CENTER stays within ≤ ½ device px of the line and an edge at an
integer scene coordinate shares its stroke's pixel at EVERY zoom ≥ the threshold and EVERY
device-pixel ratio (including fractional), at every position across the viewport (no
position-dependent error growth); when `zoom·dpr` is an integer (e.g. 6400% at dpr 1 / 1.25 / 1.5 / 2) the residual SHALL be CONSTANT across the view (uniform, never a repeating per-column beat). The
ruler tick MARKS shall occupy the SAME device pixel as the grid stroke for their coordinate (the
grid↔ruler contract under one convention). The grid SHALL be a NON-interactive, display-only layer
(it MUST NOT block selection or hit-testing) drawn lightly over the content with faint low-contrast
hairlines, viewport-culled (only the visible lines drawn), and MAY emphasize every 10th line
slightly (graph-paper) without affecting alignment.

#### Scenario: The grid appears at high zoom

- **WHEN** the operator zooms in until one scene pixel is at least 8 screen px (≥ 800%)
- **THEN** a pixel grid (1 cell = 1 scene pixel) is visible across the whole pasteboard

#### Scenario: The grid is hidden at normal zoom

- **WHEN** the zoom is below the threshold (a scene pixel is fewer than 8 screen px, e.g. 100%)
- **THEN** no pixel grid is shown

#### Scenario: The grid spans the whole pasteboard, not just the frame

- **WHEN** the grid is visible and the operator pans into the off-frame pasteboard margin
- **THEN** the grid still covers that area (it spans the entire fixed extent), scrolling and zooming
  in lockstep with the content

#### Scenario: Grid lines are pixel-accurate and ruler-aligned

- **WHEN** the grid is visible
- **THEN** a grid line lands on each integer scene coordinate (the cell between line N and N+1 is
  scene-pixel N), aligned to the rulers' tick mapping (within half a device pixel) so the two never
  visibly drift apart

#### Scenario: Grid lines are crisp at fractional zoom

- **WHEN** the zoom is a FRACTIONAL scale (e.g. 4808%, where one scene pixel is 48.08 screen px) at
  any device-pixel ratio
- **THEN** every grid line is a single crisp 1-physical-pixel line — its position snapped to the
  device-pixel raster — never doubled or blurred across two pixels (as it would be just at 6400%)

#### Scenario: A rendered edge at an integer scene coordinate sits on its grid line

- **WHEN** the grid is visible and a shape edge lies at an integer scene coordinate (e.g. a
  rectangle at X=0 W=320 — its right edge at scene x=320), at any zoom ≥ the threshold and any
  device-pixel ratio including fractional (1.25 / 1.5)
- **THEN** the rendered edge lies within ≤ ½ device px of the grid line for that coordinate and the
  stroke's device pixel CONTAINS the edge (never a whole pixel past it, at any stage phase) — the
  grid agrees with the rendered scene, not only with the rulers

#### Scenario: The ruler marks share the grid strokes' pixels

- **WHEN** the grid is visible at any device-pixel ratio
- **THEN** each ruler tick mark occupies the same physical device pixel as the grid stroke for its
  coordinate (one containing-pixel convention for both — grid↔ruler never visibly split)

#### Scenario: Grid↔content alignment does not degrade across the viewport

- **WHEN** the grid is visible and the operator compares edges against grid lines at several
  integer scene columns across the whole visible canvas (after any scroll, including fractional
  scroll offsets)
- **THEN** every column agrees within the same ≤ ½ device px bound — the offset does NOT grow with
  distance across the viewport and does NOT alternate in a repeating per-column pattern when
  `zoom·dpr` is an integer (e.g. 6400% at dpr 1 / 1.25 / 1.5 / 2, where the residual is constant)

#### Scenario: The grid layer is device-raster-aligned

- **WHEN** the grid canvas is rendered at any device-pixel ratio (integer or fractional) in any
  layout position (including fractional CSS positions)
- **THEN** its backing store covers its CSS box at raster scale exactly 1 (backing == CSS·dpr) and
  its screen origin lands on an integer device pixel (via a sub-CSS-pixel offset), so painted
  strokes rasterize exactly where the snap computed them — no stretch, no compositor resample

#### Scenario: A 1px nudge is visible against the grid

- **WHEN** a shape is selected at high zoom and nudged by one pixel with an arrow key
- **THEN** the shape moves exactly one scene pixel — one full grid cell — so the single-pixel move is
  clearly visible

#### Scenario: The grid does not block interaction

- **WHEN** the grid is visible and the operator clicks or drags a shape
- **THEN** selection and dragging work exactly as without the grid (the grid is non-interactive)

## ADDED Requirements

### Requirement: The selection overlay traces the RENDERED content box

The selection gizmo (frame + handles) SHALL trace the box the preview engine ACTUALLY laid out,
not the raw model values: the visual projection SHALL quantize the element's position and size
through the engine's layout lattice (1/64 CSS px, truncated toward zero — Blink LayoutUnit), so at
FRACTIONAL model coordinates the frame coincides with the rendered edges (raw-model projection sat
up to `zoom·dpr/64` device px — 1.25 at 6400%/dpr 1.25 — OUTSIDE the rendered edge; at integer
coordinates the quantization is a no-op). Each frame edge SHALL lie within ≤ 0.25 device px of the
corresponding rendered content edge, on all four sides, at any device-pixel ratio. The frame
stroke SHALL be ONE DEVICE PIXEL wide (not one CSS px, which is a fuzzy 1.25-device band at dpr
1.25), centered on the rendered edge — and it remains HONEST for fractional placement: a shape
parked between grid lines shows its border between the lines (the D-122 drag-snap decision governs
when placement itself snaps). Interaction math (resize/rotate/hit-testing) SHALL keep using the
raw model values — the quantization is visual-projection-only.

#### Scenario: The gizmo coincides with the rendered edges at fractional coords

- **WHEN** an element sits at a fractional scene coordinate (e.g. x = 2.2749, the drag scenario)
  and is selected at pixel-grid zoom
- **THEN** every gizmo frame edge lies within ≤ 0.25 device px of the RENDERED content edge (the
  engine lays the box out at 2.265625 — the gizmo traces that, not the raw 2.2749)

#### Scenario: Integer coordinates stay exact

- **WHEN** an element sits at integer scene coordinates and is selected
- **THEN** the gizmo edges coincide with the rendered edges as before (the quantization is a
  no-op at integer coordinates) — within the same ≤ 0.25 device px bound

#### Scenario: The frame stroke is one device pixel and honest

- **WHEN** an element is selected at any device-pixel ratio (integer or fractional)
- **THEN** the frame stroke is one physical device pixel wide, centered on the rendered edge, and
  a fractionally-placed shape visibly shows its border BETWEEN grid lines (no false snapping)

### Requirement: Position edits repaint the canvas preview (B-045)

Every position change of an element on the authoring canvas SHALL be reflected in the PAINTED
pixels — regardless of the edit's magnitude (sub-pixel fractional inspector edits, single-pixel
arrow steps, drag ticks) — at any zoom including pixel-grid zooms and any device-pixel ratio:
the painted content edge follows the element's laid-out position and never stays at a previous
position (Chromium loses raster invalidation for `left`/`top` deltas ≲ 2 CSS px inside the
scaled canvas subtree — surviving idle, scrolling, and full runtime rebuilds — so the canvas
document must position elements in a way that cannot miss invalidation). The rendered geometry
SHALL stay on the engine's 1/64-CSS-px layout lattice (pixel parity with playout; the selection
overlay's lattice projection stays exact). The playout outputs — broadcast Preview modal,
exported `.vcg` and single-file HTML — SHALL be byte-identical to the engine's own rendering
(no authoring-only positioning aid active there). Right-anchored RTL auto-hug text keeps the
engine's native anchoring (documented scope limit until the engine itself positions via
transform — D-096).

#### Scenario: A sub-pixel position edit repaints

- **WHEN** a shape at 6400% is moved by a sub-pixel amount via the inspector (e.g. X 6.4125 →
  6.69, +0.2775 scene px = +22.5 device px at dpr 1.25) with no scroll or zoom afterwards
- **THEN** the painted edge follows the layout edge within the paint tolerance — it does NOT
  stay at the previous position (through idle time and scrolling)

#### Scenario: Arrow-step nudges repaint every step

- **WHEN** a selected shape is nudged with arrow keys repeatedly at pixel-grid zoom
- **THEN** the painted shape tracks every one-scene-pixel step (one full grid cell each) with no
  accumulating trail behind the gizmo/grid

#### Scenario: Playout output is untouched

- **WHEN** the same template renders in the broadcast Preview modal or an exported package
- **THEN** element positioning is the engine's own (`left`/`top` writes untouched) — the
  authoring canvas repaint aid does not exist outside the canvas document
