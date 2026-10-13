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

**`B-181` — a RESIZE gesture SHALL decide its snap on the rect it is about to commit, never on the
pointer.** The candidate rect SHALL be solved from the raw pointer with any aspect lock already
applied; the coordinates tested against the snap targets SHALL be the MOVING EDGE(S) of that
candidate — the ones the grabbed handle actually drives; and a snap SHALL be realised by re-solving
through the same resize solver so the edge lands exactly on the target with the lock still
satisfied, never by displacing the pointer and accepting whatever rect follows.

This distinction is invisible for an unlocked resize, where the solver places the grabbed edge at
the pointer and the two are identically equal. It is the whole defect under an aspect lock, where
the solver returns a rect satisfying the ratio and a CORNER handle's extents are projected onto the
locked diagonal, separating pointer from edge by construction.

🔴 **The guide a resize draws SHALL be a function of the COMMITTED rect.** It SHALL be emitted only
for an axis whose committed edge is genuinely ON a target — within the floating-point noise floor,
not merely within the snap threshold — so the canvas can never announce a snap the geometry
refused. A snap that the `MIN_SIZE` clamp or the lock prevents SHALL therefore produce no guide.

**Where an aspect lock ties the two extents and a corner handle is in range of targets on both
axes, the NEARER target SHALL win**, with a deterministic tie to the horizontal axis. The axis the
lock then FORCES SHALL NOT be given a guide merely for landing near a target; it SHALL be given one
only if it lands on one. Snapping SHALL remain gated on an unrotated element, the threshold SHALL
remain a constant screen-space distance, and **Shift** SHALL remain this gesture's bypass for both
the snap and the whole-pixel quantise.

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

#### Scenario: An aspect-locked corner lands its edge exactly on the target

- **WHEN** snapping is on and the operator drags the corner handle of a plate whose
  aspect is locked, so that the resulting box's moving edge comes within the snap
  threshold of a neighbour's edge
- **THEN** the committed rect's moving edge is exactly on that target, the aspect is
  still satisfied, and the corner opposite the handle has not moved

#### Scenario: The guide is drawn where the box is, not where the pointer is

- **WHEN** an aspect-locked corner is dragged with the pointer sitting on a target
  but the locked solution placing the box's edge away from it
- **THEN** the guide is drawn at the committed edge's coordinate, and no guide is
  drawn at the pointer's

#### Scenario: A snap the geometry cannot take draws nothing

- **WHEN** a resize is within the snap threshold of a target but the committed edge
  does not reach it — because the lock forced the other axis, or the minimum-size
  clamp overrode the extent
- **THEN** no guide line is drawn for that axis

#### Scenario: A locked corner in range on both axes takes the nearer target

- **WHEN** an aspect-locked corner's committed edges are within the threshold of a
  target on both axes
- **THEN** the nearer target is the one satisfied, the other axis follows from the
  lock, and only the satisfied axis is given a guide unless the forced axis also
  lands exactly on a target

#### Scenario: An unlocked resize is unchanged

- **WHEN** the operator resizes an element that has no aspect lock
- **THEN** the grabbed edge lands on the target exactly as it did before, because the
  solver places that edge at the pointer and the two are identically equal

#### Scenario: Shift bypasses the resize snap entirely

- **WHEN** the operator holds Shift while dragging a resize handle
- **THEN** nothing snaps, no guide line is drawn, and the placement keeps its
  fractional part

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
route through the move path.

**`B-180` — BELOW the grid threshold, a DRAG or RESIZE SHALL ALSO commit whole scene pixels**, so the
committed coordinate is a number the author can see, read back and type. This supersedes the earlier
"below the grid threshold, drag and nudge behave exactly as before" scope, and only for the drag and
resize COMMIT: the arrow NUDGE below the threshold SHALL remain a relative ±step that preserves the
fractional part. Below the threshold the quantise SHALL run AFTER smart-guide snapping and SHALL apply
only to the axes NO guide claimed — a guide has landed the box on a real target, which inside a scaled
composition instance is very often legitimately fractional, and rounding after it would pull the box
back off that target. Holding **Alt** SHALL bypass the quantise on both axes at every zoom, making it
the only way to place sub-pixel by drag; the resize gesture's existing **Shift** modifier SHALL be its
bypass. The Snapping preference SHALL NOT gate the quantise — turning smart guides off is a request
about being pulled toward other things, not a request for a coordinate the author cannot read.

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

#### Scenario: A drag below the grid threshold also commits whole pixels

- **WHEN** the zoom is below the grid threshold (no pixel grid), Alt is not held,
  and the operator drags an element
- **THEN** the committed position is whole-integer scene X and Y — the same value
  the Inspector displays — rather than `startPos + clientDelta / zoom`

#### Scenario: Alt below the threshold still places sub-pixel

- **WHEN** the operator holds Alt while dragging below the grid threshold
- **THEN** the committed position keeps its fractional part, and this is the only
  drag gesture that produces one

#### Scenario: A guide-snapped axis is left exactly on its target

- **WHEN** a drag below the grid threshold snaps to a smart guide whose target is
  fractional (for example an edge inside a scaled composition instance)
- **THEN** that axis is committed exactly on the guide's target, un-rounded, and
  only the other axis is quantised

#### Scenario: A resize below the grid threshold commits whole pixels

- **WHEN** the operator drags a resize handle of an UNROTATED element below the
  grid threshold without holding Shift
- **THEN** the committed position and size are whole scene pixels, and holding
  Shift bypasses it

#### Scenario: A resize never moves the fixed corner to achieve the quantise

- **WHEN** the resized element is rotated, non-uniformly scaled, or centre-anchored,
  so its `position` and `size` are not independent of where the pinned corner lands
- **THEN** the corner opposite the grabbed handle stays EXACTLY where it was — the
  quantise SHALL be applied to the pointer that drives the resize solver, never to
  the rect the solver returns, because the pin is the stronger invariant and
  rounding `position` and `size` separately breaks it

#### Scenario: Below the grid threshold a NUDGE is unchanged

- **WHEN** the zoom is below the grid threshold (no pixel grid) and the operator
  nudges the selection with an arrow key
- **THEN** the nudge is a relative ±step that preserves any fractional part,
  exactly as before

#### Scenario: An Inspector-typed fractional value is not quantised

- **WHEN** the operator types a fractional coordinate into the Inspector at any zoom
- **THEN** it is stored exactly as typed — the quantise gates the drag/resize
  commit, never the model
