## MODIFIED Requirements

### Requirement: Overlapping live plates are refused unless one explicitly reveals the other

The Designer SHALL keep overlapping Live Source plates export-blocking by default. An upper plate
MAY name one lower symbolic source and a normalized reveal rectangle. Only that linked pair SHALL be
exempt, and only while the reveal rectangle intersects the lower plate in the same document/look.
Missing targets, self-links, cycles and unrelated third-party overlap SHALL remain blocking errors.

#### Scenario: Author draws an intentional reveal

- **GIVEN** two overlapping Live Source plates with distinct symbolic ids
- **WHEN** the author selects the lower plate for the upper and draws a valid reveal window
- **THEN** that pair no longer raises the ordinary overlap error
- **AND** every other overlap remains independently blocking

#### Scenario: Invalid relation never becomes a silent no-op

- **WHEN** a reveal targets itself, a missing source or a source that reveals it back
- **THEN** export is refused with a targeted relation error
