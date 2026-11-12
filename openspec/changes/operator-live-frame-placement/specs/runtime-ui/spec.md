## ADDED Requirements

### Requirement: Operators can place authored live frames from Preview

CG Control SHALL allow each frame's author to grant movement and resize independently.
Designer SHALL group **Fit**, **Allow move** and **Resize** under **CG Control** in its Inspector.
**Resize** SHALL offer **Locked**, **Preserve aspect ratio** and **Operator chooses aspect ratio**.
The same controls SHALL be available when multiple live plates are selected. They SHALL show
different values as mixed and apply each choice as one undoable edit, preserving the other
settings on every plate. CG Control SHALL expose only the gestures the author allows in PVW.
The PVW control SHALL display a frame icon beside its **Edit frames** label.
CG Control's Inspector SHALL provide a **Preserve aspect ratio** option for **Edit frames**,
checked by default, when the active Look has a frame with **Operator chooses aspect ratio**.
An opted-in frame in a one-plate composition SHALL travel with the artwork in that composition.

#### Scenario: Author frame placement

- **WHEN** a Designer author enables placement on a frame and exports the template
- **THEN** CG Control can identify the frame independently in each Look
- **AND** an older placement opt-in keeps movement and its saved resize policy
- **AND** a frame without either permission has no placement gestures

#### Scenario: Choose how a frame resizes

- **WHEN** the author fixes the frame ratio or the operator's permitted ratio option is checked
- **THEN** the resize keeps the ratio at the start of the gesture
- **WHEN** the author allows operator choice and the operator unchecks **Preserve aspect ratio**
- **THEN** a resize can change the frame width and height independently

#### Scenario: Movement and resize can be granted separately

- **WHEN** the author enables movement and locks resize
- **THEN** the operator can move the frame and has no resize handles
- **WHEN** the author grants resize and disables movement
- **THEN** the operator sees a neutral cursor on the frame body and resize cursors on its corners
- **AND** dragging the frame body does not move it

#### Scenario: The Bridge cannot enforce independent frame permissions

- **WHEN** an import or rebuild has a move-only or resize-only target
- **THEN** CG Control requires a Bridge that advertises `previewResizeMode`

#### Scenario: Move a frame with its picture and artwork

- **WHEN** an operator applies a valid placement to the selected Look and frame
- **THEN** the picture, mask, title and fallback share the frame geometry
- **AND** an on-air update retains the existing input producer

#### Scenario: Edit without putting a draft on air

- **WHEN** an operator moves or resizes a frame in PVW
- **THEN** the edit remains a draft until Update
- **AND** Discard restores the last applied placement
- **AND** an off-air Update saves the placement for the next Take

#### Scenario: Reset frames to their authored positions and sizes

- **GIVEN** an eligible live row is selected
- **WHEN** the operator clicks **Reset frames** in Inspector → Position
- **THEN** PVW shows the authored positions and sizes and stages a reset across that row's presets
- **AND** the running programme keeps its applied geometry until Update on air
- **WHEN** the operator applies the reset **THEN** the row's saved frame overrides are cleared
- **WHEN** the operator discards the reset **THEN** PVW restores the last applied placements
- **AND** the reset preserves whole-template Position and input crop
- **AND** the restoration remains available when a frame's resize is locked

### Requirement: Designers can authorize operator Auto layout

Designer SHALL offer **Allow Auto layout in CG Control** for the open composition, off by
default. Designer SHALL use the standard Inspector checkbox for this option and
**Allow live plate overlap**. In Position, CG Control SHALL offer **Auto layout** only for an
authorized template with at least two plates in its active preset, all with move and resize permission.
The layout SHALL share Designer's aspect-aware geometry, horizontal and vertical gaps,
two-plate arrangements, fuller row choices and spatial Swap. It SHALL preserve the template's
layer order and the authored ratio of proportional frames.

#### Scenario: Preview an authorized arrangement

- **WHEN** the operator arranges or swaps the frames in an authorized preset
- **THEN** CG Control stages the complete arrangement together in PVW and marks the layer draft
- **AND** Update applies the draft through the existing frame placement path and Discard restores it
- **AND** the arrangement affects only the active preset's frames

#### Scenario: Switch between presets with different frame counts

- **WHEN** the operator switches the active preset on the selected layer
- **THEN** Auto layout shows the applicable controls for that preset's visible frames
- **AND** a preset with fewer than two eligible frames has no Auto layout controls
- **AND** returning to a preset in the Inspector restores its arrangement settings and Swap order
- **AND** drafted and applied frame positions stay associated with their own presets

#### Scenario: Keep a title attached to its frame

- **GIVEN** each child composition holds one live plate and its title with authored text styling
- **WHEN** the operator moves the frame or swaps its spatial position
- **THEN** that frame's title moves with the plate and retains its text, background and padding
