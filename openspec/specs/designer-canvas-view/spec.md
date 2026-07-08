# designer-canvas-view Specification

## Purpose

TBD - created by archiving change add-view-menu-ruler-snapping. Update Purpose after archive.

## Requirements

### Requirement: View menu exposes Ruler and Snapping toggles

The top View menu SHALL open a dropdown containing a **Ruler** item and a
**Snapping** item, each rendered as a checkable toggle whose checkmark reflects
its current on/off state. Selecting an item SHALL flip the corresponding
preference. Snapping SHALL default on and the ruler SHALL default off.

#### Scenario: View menu shows the two toggles with state

- **WHEN** the operator opens the View menu
- **THEN** it shows a Ruler item and a Snapping item, each with a checkmark when
  its preference is on

#### Scenario: Toggling updates the preference

- **WHEN** the operator clicks the Ruler item (or the Snapping item)
- **THEN** that preference flips and the menu's checkmark reflects the new state

### Requirement: Canvas pixel rulers

When the Ruler preference is on, the Designer SHALL overlay pixel rulers along
the top and left edges of the canvas viewport, showing scene coordinates with
scene `(0,0)` correctly placed, staying aligned as the canvas zooms, scrolls,
and resizes, and with a tick step that adapts to zoom so labels stay legible.
When off, no rulers are shown.

#### Scenario: Rulers appear and track the canvas

- **WHEN** the Ruler preference is on
- **THEN** top and left rulers overlay the canvas, their ticks aligned to scene
  coordinates and rescaling as the operator zooms or scrolls

#### Scenario: Rulers hidden when off

- **WHEN** the Ruler preference is off
- **THEN** no rulers are drawn over the canvas

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

### Requirement: Ruler guides

The operator SHALL be able to pull guide lines from the rulers: dragging from
the top ruler SHALL create a horizontal guide and dragging from the left ruler
SHALL create a vertical guide, positioned under the cursor in scene coordinates.
A placed guide SHALL be draggable to reposition it and SHALL be removable by
dragging it off the canvas or double-clicking it. Guides SHALL render aligned to
the canvas across zoom/scroll, and when snapping is on, dragged elements SHALL
snap to them. Guides are editor aids and need not persist into the saved scene.
While the operator HOVERS a guide OR is DRAGGING one, the canvas SHALL show a small
non-interactive coordinate badge with that guide's scene coordinate in px (a
vertical guide → `x: <n>`, a horizontal guide → `y: <n>`); the value SHALL update
live while dragging and the badge SHALL persist for the whole drag even if the
pointer leaves the thin guide strip, SHALL disappear when neither hovering nor
dragging a guide, and SHALL track the guide's screen position across zoom/scroll
(clamped to stay within the visible viewport). Dragging takes precedence over
hover, and the badge applies only to the operator's persistent ruler guides, NOT
the transient snap/alignment guides.

#### Scenario: Pull a horizontal guide from the top ruler

- **WHEN** the operator presses on the top ruler and drags down onto the canvas
- **THEN** a horizontal guide is created and follows the cursor, remaining where
  it is released

#### Scenario: Pull a vertical guide from the left ruler

- **WHEN** the operator presses on the left ruler and drags right onto the canvas
- **THEN** a vertical guide is created at the cursor's scene-x

#### Scenario: Reposition and remove a guide

- **WHEN** the operator drags an existing guide
- **THEN** it moves with the cursor; releasing it off the canvas (or
  double-clicking it) removes it

#### Scenario: Elements snap to guides

- **WHEN** snapping is on and an element is dragged near a guide
- **THEN** the element's matching edge/center aligns to the guide

#### Scenario: Hovering a guide shows its coordinate

- **WHEN** the pointer is over a persistent ruler guide
- **THEN** a badge shows that guide's scene coordinate in px (a vertical guide →
  `x: <n>`, a horizontal guide → `y: <n>`)

#### Scenario: The badge updates live while a guide is dragged

- **WHEN** a guide is being dragged
- **THEN** the badge stays shown and its value updates live as the guide moves —
  persisting for the whole drag even if the pointer leaves the strip

#### Scenario: No badge when neither hovering nor dragging a guide

- **WHEN** the pointer is neither over a guide nor dragging one
- **THEN** no coordinate badge is shown

#### Scenario: The badge tracks the guide across zoom and scroll

- **WHEN** the canvas is zoomed or scrolled while a guide is active
- **THEN** the badge tracks the guide's screen position and stays within the
  visible viewport

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
