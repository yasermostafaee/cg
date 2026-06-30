# designer-canvas-viewport (D-120 delta)

## MODIFIED Requirements

### Requirement: Canvas zoom controls and Ctrl-wheel zoom

The canvas SHALL expose zoom-in, zoom-out, fit, and reset controls in its header. The zoom level
MUST be clamped to an inclusive range whose UPPER bound is 6400% (each scene pixel = 64 screen px at
the top); the LOWER bound is the canvas's dynamic minimum zoom (the cover-fit of the pasteboard over
the viewport — unchanged by this requirement). `Ctrl + wheel` over the canvas SHALL also zoom in /
out, stepping within the same range; the canvas MUST `preventDefault` on that gesture so it does not
bubble up to the browser's page-zoom. Every zoom path (the buttons, `Ctrl + wheel`, and Fit) SHALL go
through the single clamp so they all honour the same bounds.

#### Scenario: Operator clicks zoom in

- **WHEN** the canvas is at 100% and the operator clicks the zoom-in button
- **THEN** the canvas zoom increases by one step (clamped at 6400%) and the displayed canvas grows
  accordingly

#### Scenario: Ctrl-wheel up zooms in

- **WHEN** the operator holds Ctrl and wheels up over the canvas
- **THEN** the canvas zoom increases by one wheel-step (clamped at 6400%) and the page does NOT
  scroll or invoke the browser's page zoom

#### Scenario: Zoom clamps at the upper bound

- **WHEN** the canvas is already at 6400% and the operator zooms in again
- **THEN** the zoom stays at 6400%

#### Scenario: Reset returns to 100%

- **WHEN** the operator clicks the zoom reset button at any zoom
- **THEN** the zoom returns to 100%

## ADDED Requirements

### Requirement: Pixel grid at high zoom

The canvas SHALL render a pixel grid — hairline lines at every integer scene-pixel boundary, one
cell = one scene pixel — over the WHOLE pasteboard extent (not just the frame), shown ONLY when one
scene pixel maps to at least 8 screen px (zoom ≥ 800%) and hidden below that threshold so a normal
zoom is not cluttered by an illegible smear. Each grid line SHALL sit exactly on an integer scene
coordinate using the SAME scene→screen mapping the rest of the canvas uses (`(x + frameOffset)·zoom`),
so the grid is pixel-accurate and never drifts from the rulers; the cell SHALL track the zoom and the
grid SHALL scroll and zoom WITH the pasteboard content. The grid SHALL be a NON-interactive,
display-only layer (it MUST NOT block selection or hit-testing) drawn lightly over the content with
faint low-contrast hairlines, and MAY emphasize every 10th line slightly (graph-paper) without
affecting alignment.

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
- **THEN** a grid line lands exactly on each integer scene coordinate (the cell between line N and
  N+1 is scene-pixel N), aligned to the rulers' tick mapping so the two never drift apart

#### Scenario: A 1px nudge is visible against the grid

- **WHEN** a shape is selected at high zoom and nudged by one pixel with an arrow key
- **THEN** the shape moves exactly one scene pixel — one full grid cell — so the single-pixel move is
  clearly visible

#### Scenario: The grid does not block interaction

- **WHEN** the grid is visible and the operator clicks or drags a shape
- **THEN** selection and dragging work exactly as without the grid (the grid is non-interactive)
