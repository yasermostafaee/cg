## ADDED Requirements

### Requirement: Auto layout arranges selected visual layers

Designer SHALL show **Auto layout** when at least two eligible visual layers are selected.
Audio and locked layers SHALL remain outside the layout. The existing direction, row, gap
and swap controls SHALL work for both homogeneous and mixed visual selections. Auto layout
SHALL preserve layer order and the proportions and rotation of ordinary visuals. Direct
live plates SHALL keep the existing aspect-aware, axis-aligned layout.

An instance containing one live plate SHALL use the projected plate rectangle for layout
and transform the instance as a whole. Other composition instances SHALL use their own
bounds. Layout SHALL preserve the authored contents and data bindings of the child
composition and SHALL be undoable as one edit per action.

#### Scenario: Arrange and undo a mixed selection

- **GIVEN** a selection containing a direct live plate, a composition instance, a rotated rectangle
  and a Repeater
- **WHEN** the author arranges the selection and swaps its order
- **THEN** the eligible visuals form the requested layout with their proportions, the rectangle
  retains its rotation, the Repeater keeps its rows together, and the timeline layer order is unchanged
- **AND** one Undo reverts the Swap, and one more Undo reverts the Arrange

#### Scenario: Arrange and swap two titled frames inside a preset

- **GIVEN** the author is editing a preset containing two selected child composition instances
  that each contain one live plate and a styled title
- **WHEN** the author arranges the instances and swaps their order
- **THEN** the layout uses the actual plate rectangles and the configured gap
- **AND** each title travels with its frame, retaining its styling and relative placement
- **AND** the underlying child composition and its instances in other presets keep their transforms

#### Scenario: Audio and locked layers are excluded

- **GIVEN** at least two eligible visual layers are selected alongside audio or locked layers
- **WHEN** the author applies Auto layout
- **THEN** only the eligible visuals are arranged
- **AND** Auto layout is unavailable once fewer than two eligible visuals are selected

### Requirement: A titled live-frame instance can keep its composition ratio

Designer SHALL provide a ratio lock for a composition instance containing one live plate.
It SHALL start enabled. Opening an existing instance SHALL preserve its authored transform.
Legacy Arrangement cells SHALL continue to use their Arrangement sizing controls.

#### Scenario: Resize a titled frame instance

- **WHEN** the author resizes a locked instance with Width, Height or a corner handle
- **THEN** the instance follows the referenced composition's ratio and transforms the title and frame together
- **WHEN** the author unlocks the ratio **THEN** the instance can be sized on both axes independently

#### Scenario: Restore an already stretched instance

- **GIVEN** a saved instance is stretched relative to its referenced composition
- **WHEN** the author restores its composition ratio
- **THEN** the instance and its title return to the referenced proportions in one undoable edit
