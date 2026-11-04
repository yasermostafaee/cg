## ADDED Requirements

### Requirement: Preview is a command-first rehearsal workspace

The Designer SHALL implement the following accepted authoring behavior without modifying stored scene timing or broadcast commands.

#### Scenario: Layout

- **WHEN** Preview opens
- **THEN** frame/time and composition identity sit above the picture, transport precedes timing and Variables, and the dialog stays in the viewport

#### Scenario: Clock controls

- **WHEN** Play, Pause, Resume, Stop or natural completion occurs
- **THEN** elapsed time starts, freezes, resumes, resets or settles with that run

#### Scenario: Data controls

- **WHEN** the author edits values
- **THEN** automatic text direction preserves Persian/Latin entry and one Update all applies pending values without per-row update actions
