# designer-multi-select (delta)

## ADDED Requirements

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
