# designer-canvas-view (D-122 delta)

## MODIFIED Requirements

### Requirement: Snap-while-dragging with smart guides

When the Snapping preference is on, dragging an element on the canvas SHALL snap
the element's left/center/right and top/middle/bottom to the canvas edges and
center and to other elements' edges and centers, within a small screen-space
threshold that is constant across zoom levels, and SHALL draw guide lines for
the active snaps. When the preference is off, dragging SHALL move the element
freely with no snapping of any kind (neither smart guides nor the pixel grid)
and no guide lines. The Snapping preference is the MASTER snap switch: it also
governs the pixel-grid snapping at high zoom (see "Pixel-snap moves to the grid
at high zoom"), and holding **Alt** during a drag momentarily bypasses ALL
snapping (free placement) regardless of the preference or the zoom.

#### Scenario: Element snaps to canvas center with a guide

- **WHEN** snapping is on and the operator drags an element so its center nears
  the canvas center
- **THEN** the element's center aligns to the canvas center and a guide line is
  shown there

#### Scenario: Element snaps to another element's edge

- **WHEN** snapping is on and the operator drags an element so an edge nears
  another element's edge
- **THEN** the edges align and a guide line is shown

#### Scenario: Snapping off drags freely

- **WHEN** snapping is off and the operator drags an element (at any zoom,
  including pixel-grid zoom)
- **THEN** the element follows the cursor with no snapping of any kind (neither
  smart guides nor the pixel grid) and no guide lines

## ADDED Requirements

### Requirement: Pixel-snap moves to the grid at high zoom

The editor SHALL land an element MOVE on WHOLE scene pixels when the pixel grid
is visible (zoom at or above the grid threshold, 800%), the Snapping preference
is on, and **Alt** is not held, so a moved element's edges sit on the grid lines.
Specifically:

- **Dragging** SHALL snap the dragged position to the nearest whole scene pixel
  LIVE on every pointer-move (the element and its selection gizmo step
  pixel-by-pixel under the cursor and every drop lands on a line). For a
  multi-selection the grabbed ANCHOR SHALL snap and its snapped delta SHALL move
  every member, so the anchor lands on the grid and the selection's relative
  offsets are preserved. At grid zoom the pixel grid IS the snap target — it
  supersedes the smart-guide element snapping (whose screen-space threshold is a
  sub-tenth of a scene pixel at that zoom) and draws no smart-guide lines (the
  always-visible grid is the guide).
- **Arrow-key nudging** SHALL land the selection on whole pixels: the FIRST nudge
  of a fractional coordinate SHALL move it to the NEXT integer in the nudge
  direction (e.g. x = 6.69 → Right → 7, → Left → 6) regardless of the step
  magnitude, and subsequent nudges SHALL step by whole pixels (Shift keeps the
  10px stride once on the grid). See the `designer-multi-select` nudge requirement.

Holding **Alt** during the drag or nudge SHALL bypass the snap (free sub-pixel
drag / relative ±step nudge that preserves the fractional part). Values typed in
the Inspector SHALL always be stored as typed (fractional allowed) — they never
route through the move path. Below the grid threshold, drag and nudge SHALL
behave exactly as before (no pixel snapping).

#### Scenario: A drag lands on whole pixels at grid zoom

- **WHEN** the pixel grid is visible, Snapping is on, Alt is not held, and the
  operator drags an element
- **THEN** the committed position is whole-integer scene X and Y (the element's
  edges sit on the grid lines), updated live as the drag moves

#### Scenario: Alt bypasses the snap for a free drag

- **WHEN** the operator holds Alt while dragging at pixel-grid zoom
- **THEN** the element follows the cursor with sub-pixel (fractional) placement —
  no pixel snapping — and its border shows it honestly between the grid lines

#### Scenario: A multi-selection drag snaps the anchor and preserves offsets

- **WHEN** a multi-selection is dragged at pixel-grid zoom (Snapping on, no Alt)
- **THEN** the grabbed anchor lands on whole pixels and every other member moves
  by the same (snapped) delta, so the selection's relative offsets are preserved

#### Scenario: Below the grid threshold a drag is unchanged

- **WHEN** the zoom is below the grid threshold (no pixel grid) and the operator
  drags an element
- **THEN** the move is not pixel-snapped — smart-guide snapping applies exactly as
  before (subject to the Snapping preference)
