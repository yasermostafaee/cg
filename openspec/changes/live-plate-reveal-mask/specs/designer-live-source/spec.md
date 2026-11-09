## ADDED Requirements

### Requirement: An author can mask the picture inside one live plate

The Designer SHALL let the author draw, edit and remove up to eight rectangles on a single live
plate. In Mask mode the visible region SHALL be the union of the windows. In Revert it SHALL be
the complement of that union inside the plate. The same rule SHALL clip the plate's fallback.

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
MAY name one lower symbolic source and up to eight normalized reveal rectangles. Only that linked pair
SHALL be exempt, and only while every reveal rectangle intersects the lower plate in the same document/look.
Missing targets, self-links, cycles and unrelated third-party overlap SHALL remain blocking errors.

#### Scenario: Author draws an intentional reveal

- **GIVEN** two overlapping Live Source plates with distinct symbolic ids
- **WHEN** the author selects the lower plate for the upper and draws a valid reveal window
- **THEN** that pair no longer raises the ordinary overlap error
- **AND** every other overlap remains independently blocking

#### Scenario: Each mask can be edited or removed

- **GIVEN** an upper plate with two masks for the same lower plate
- **WHEN** the author redraws, edits the percentages of or removes one mask
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
