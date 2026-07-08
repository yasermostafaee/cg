# designer-multi-select (D-122 delta)

## MODIFIED Requirements

### Requirement: Arrow-key nudge for the selection

The editor SHALL move the current selection with the arrow keys when one or more elements are
selected and no editable field is focused: each press moves the selection by 1px in scene
coordinates, and holding **Shift** moves it by 10px. The directions SHALL be SPATIAL and
independent of reading order — Left = −x, Right = +x, Up = −y, Down = +y (unchanged under RTL).
Every MOVABLE member (visible and unlocked) SHALL move by the same delta; locked or hidden members
SHALL NOT move. The nudge SHALL be keyframe-aware via the SAME commit path as a drag: a moved
element/axis that is animated SHALL write a keyframe at the playhead (start value + delta), and an
un-animated one SHALL write its static value. A run of presses from a held key (auto-repeat) SHALL
collapse to ONE undo step, while separate discrete presses are separate undo steps. WHEN nothing is
selected, OR the focus is in an `input` / `textarea` / `select` / contentEditable, the arrow keys
SHALL do nothing and SHALL preserve their default behaviour (no nudge, not consumed).

D-122 — WHEN the pixel grid is visible (zoom ≥ the grid threshold), the Snapping preference is on,
and **Alt** is not held, the nudge SHALL land the selection on WHOLE scene pixels: the FIRST nudge
of a fractional coordinate SHALL move it to the NEXT integer in the nudge direction (e.g. x = 6.69
→ Right → 7, → Left → 6) regardless of the step magnitude, and subsequent nudges SHALL step by
whole pixels (Shift keeps the 10px stride once on the grid). The snap SHALL apply to the ANCHOR
(the primary selected element) and the resulting shared delta SHALL move every member, so the
anchor lands on the grid and the selection's relative offsets are preserved. Holding **Alt** SHALL
bypass the snap for a relative ±step nudge that preserves the fractional part. Below the grid
threshold, or with the Snapping preference off, the nudge SHALL remain the raw relative ±step
(fractions preserved) as before.

#### Scenario: Arrow key moves the selected element by 1px in the spatial direction

- **WHEN** an element is selected and an arrow key is pressed
- **THEN** it moves 1px in that screen direction (Left = −x, Right = +x, Up = −y, Down = +y),
  independent of RTL

#### Scenario: Shift makes the step 10px

- **WHEN** Shift is held with an arrow key
- **THEN** the selection moves by 10px instead of 1px

#### Scenario: Every movable member of a multi-selection moves; locked/hidden do not

- **WHEN** multiple elements are selected and an arrow key is pressed
- **THEN** every visible, unlocked member moves by the same delta; locked or hidden members do not
  move

#### Scenario: Nudging an animated element keyframes at the playhead

- **WHEN** the moved element/axis is animated and an arrow key is pressed
- **THEN** the nudge writes a keyframe at the playhead (start value + delta), matching drag
  behaviour; an un-animated element writes its static value

#### Scenario: A held key collapses to one undo step

- **WHEN** an arrow key is held so it auto-repeats
- **THEN** the whole repeat run is a single undo step (one `markHistoryBoundary` on the first,
  non-repeat event)

#### Scenario: No selection or an editable focus does nothing

- **WHEN** nothing is selected, OR the focus is in an input/textarea/select/contentEditable
- **THEN** the arrow keys do nothing — no nudge, and their default behaviour is preserved

#### Scenario: First nudge of a fractional coordinate snaps to the next integer at grid zoom

- **WHEN** an element sits at a fractional coordinate (e.g. x = 6.69) at pixel-grid zoom (Snapping
  on, Alt not held) and an arrow nudge fires
- **THEN** the coordinate moves to the NEXT integer in the nudge direction (Right → 7, Left → 6),
  and subsequent nudges step by whole pixels; an accelerated (Shift) nudge off a fractional value
  obeys the same first-snap (lands on the next integer, then strides by 10)

#### Scenario: Alt bypasses the nudge snap

- **WHEN** Alt is held with an arrow key at pixel-grid zoom
- **THEN** the nudge is the raw relative ±step and preserves the fractional part (e.g. 6.69 →
  Right → 7.69), as below the grid threshold

#### Scenario: Below the grid threshold the nudge is relative

- **WHEN** the zoom is below the grid threshold and an arrow nudge fires from a fractional
  coordinate
- **THEN** the nudge is the raw relative ±step and preserves the fractional part (today's behaviour)

#### Scenario: A single-axis nudge does not keyframe the other axis

- **WHEN** an element animated on ONE axis (e.g. a `position.y` track, playhead parked between
  keyframes) is nudged along the OTHER axis (a horizontal arrow)
- **THEN** only the moved axis is committed — the animated axis gains NO keyframe at the playhead
  (the unchanged value must not upsert a phantom keyframe that distorts the motion)
