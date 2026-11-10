## ADDED Requirements

### Requirement: Space starts the active Designer canvas transport

Designer SHALL let the author start the editing timeline or the canvas rehearsal by pressing unmodified Space from the workspace.

#### Scenario: The author starts playback in either mode

- **WHEN** the author presses Space on the idle Designer workspace
- **THEN** the active transport runs the same Play command as its visible button
- **AND** selecting Rehearse with the pointer and then pressing Space starts the rehearsal

#### Scenario: The author types a space

- **WHEN** a text input or editor has focus and the author presses Space
- **THEN** the editor receives the space and playback stays idle
