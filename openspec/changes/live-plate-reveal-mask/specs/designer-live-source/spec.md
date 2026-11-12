## ADDED Requirements

### Requirement: An author can mask the picture inside one live plate

The Designer SHALL let the author draw, edit and remove up to eight rectangles on a single live
plate. In Mask mode the visible region SHALL be the union of the windows. In Revert it SHALL be
the complement of that union inside the plate. The same rule SHALL clip the plate's fallback.

#### Scenario: Move and resize an existing mask on the Canvas

- **GIVEN** the author selects a mask or finishes drawing one
- **WHEN** the author drags its body or a corner and releases
- **THEN** the window moves or resizes within the plate as one undoable edit
- **AND** the other windows keep their geometry
- **AND** cancellation before release preserves the previous window

#### Scenario: Mask editing is visibly active by default

- **WHEN** the author selects a plate with masks or picks another mask in the Inspector
- **THEN** the active mask shows its drag and resize handles and the edit icon is pressed
- **AND** Add switches to drawing until the new window is complete or the gesture is cancelled
- **AND** clicking outside the editor leaves it and follows ordinary Canvas selection

#### Scenario: Mask a burned-in caption

- **GIVEN** one live plate
- **WHEN** the author draws a rectangle around a caption
- **THEN** the region inside that rectangle remains visible
- **AND** the plate is transparent outside it

#### Scenario: Revert and remove a mask

- **GIVEN** a plate with two windows
- **WHEN** the author checks Revert
- **THEN** the windows are transparent and the rest of the plate remains visible
- **AND** deleting the final window restores the whole plate

## MODIFIED Requirements

### Requirement: Overlapping live plates are refused unless one explicitly reveals the other

The Designer SHALL keep overlapping Live Source plates export-blocking by default. An upper plate
MAY name one lower symbolic source and up to eight normalized reveal rectangles. With the
composition's **Allow live plate overlap** option off, only that linked pair SHALL be exempt,
and only while every reveal rectangle intersects the lower plate in the same document/look.
Missing targets, self-links and cycles SHALL remain blocking errors in either mode.

#### Scenario: Author draws an intentional reveal

- **GIVEN** two overlapping Live Source plates with distinct symbolic ids
- **WHEN** the author selects the lower plate for the upper and draws a valid reveal window
- **THEN** that pair no longer raises the ordinary overlap error
- **AND** other overlaps remain independently blocking while **Allow live plate overlap** is off

#### Scenario: Each mask can be edited or removed

- **GIVEN** an upper plate with two masks for the same lower plate
- **WHEN** the author moves, resizes, edits the percentages of or removes one mask
- **THEN** the other mask keeps its geometry
- **AND** removing the final mask restores ordinary overlap validation

#### Scenario: Deleting a Plate clears masks that point to it

- **WHEN** the last Plate declaring a mask's lower source is deleted **THEN** its dependent masks are
  removed in the same undoable edit
- **WHEN** a project opens with a mask whose target source has no Plate **THEN** the Designer clears
  that mask in memory, preserves valid masks and marks the repair unsaved

#### Scenario: Invalid relation never becomes a silent no-op

- **WHEN** a reveal targets itself, a missing source or a source that reveals it back
- **THEN** export is refused with a targeted relation error
