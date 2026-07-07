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
by the compositor — the snap the math computes is the snap that rasterizes. The grid SHALL agree with
the RENDERED SCENE CONTENT, not only the rulers: an edge at an integer scene coordinate SHALL render
within ≤ ½ device px of its grid line at EVERY zoom ≥ the threshold and EVERY device-pixel ratio
(including fractional), at every position across the viewport (no position-dependent error growth),
and when `zoom·dpr` is an integer (e.g. 6400% at dpr 1 / 1.25 / 1.5 / 2) the residual SHALL be
CONSTANT across the view (uniform, never a repeating per-column beat). The grid SHALL be a
NON-interactive, display-only layer (it MUST NOT block selection or hit-testing) drawn lightly over
the content with faint low-contrast hairlines, viewport-culled (only the visible lines drawn), and
MAY emphasize every 10th line slightly (graph-paper) without affecting alignment.

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
- **THEN** the rendered edge lies within ≤ ½ device px of the grid line for that coordinate — the
  grid agrees with the rendered scene, not only with the rulers

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
