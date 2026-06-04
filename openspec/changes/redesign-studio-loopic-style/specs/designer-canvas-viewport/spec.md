## ADDED Requirements

### Requirement: Canvas zoom controls and Ctrl-wheel zoom

The canvas SHALL expose zoom-in, zoom-out, fit, and reset controls in
its header. The zoom level MUST be clamped to the inclusive range
[10%, 400%]. `Ctrl + wheel` over the canvas SHALL also zoom in /
out, stepping in the same range; the canvas MUST `preventDefault` on
that gesture so it does not bubble up to the browser's page-zoom.

#### Scenario: Operator clicks zoom in

- **WHEN** the canvas is at 100% and the operator clicks the
  zoom-in button
- **THEN** the canvas zoom increases by one step (clamped at 400%)
  and the displayed canvas grows accordingly

#### Scenario: Ctrl-wheel up zooms in

- **WHEN** the operator holds Ctrl and wheels up over the canvas
- **THEN** the canvas zoom increases by one wheel-step (clamped at
  400%) and the page does NOT scroll or invoke the browser's page
  zoom

#### Scenario: Zoom clamps at the upper bound

- **WHEN** the canvas is already at 400% and the operator zooms in
  again
- **THEN** the zoom stays at 400%

#### Scenario: Reset returns to 100%

- **WHEN** the operator clicks the zoom reset button at any zoom
- **THEN** the zoom returns to 100%

### Requirement: Plain wheel scrolls the canvas viewport

The canvas SHALL scroll its inner viewport on plain `wheel` events
(no `ctrlKey`) — the same behaviour as a standard `overflow: auto`
container — and MUST NOT change the zoom level on those events.

#### Scenario: Wheel scrolls the canvas

- **WHEN** the operator wheels down over the canvas without holding
  Ctrl
- **THEN** the canvas viewport scrolls down and the zoom level is
  unchanged

### Requirement: Hand tool pans the canvas viewport

When `tool === 'hand'`, a pointer drag on the canvas SHALL pan the
inner canvas viewport (`offset.x`, `offset.y`) instead of selecting
or creating elements.

#### Scenario: Hand tool drag pans

- **WHEN** the hand tool is active and the operator click-drags
  100px right and 50px down over the canvas
- **THEN** the canvas inner viewport offset moves by (+100, +50)
  pixels, no element is selected, no element is created
