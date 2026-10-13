# designer-canvas-view

## MODIFIED Requirements

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
