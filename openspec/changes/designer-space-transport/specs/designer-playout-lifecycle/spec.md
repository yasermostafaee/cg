## ADDED Requirements

### Requirement: Space controls the active Designer canvas transport

Designer SHALL let the author control the editing timeline or the canvas rehearsal by pressing unmodified Space from the workspace.

#### Scenario: The author starts playback in either mode

- **WHEN** the author presses Space on the idle Designer workspace
- **THEN** the active transport runs the same Play command as its visible button
- **AND** selecting Rehearse with the pointer and then pressing Space starts the rehearsal

#### Scenario: The author pauses or resumes the editing timeline

- **WHEN** the author presses Space while the editing timeline plays
- **THEN** playback pauses at the current frame
- **AND** pressing Space again resumes playback from that frame

#### Scenario: The author stops rehearsal

- **WHEN** the author presses Space while Rehearse offers Stop
- **THEN** the active transport runs the same Stop command as its visible button
- **AND** the authored Outro runs before the graphic clears
- **AND** pressing Space during the Outro leaves it running
- **AND** pressing Space after the rehearsal stops starts playback again

#### Scenario: The author types a space

- **WHEN** a text input or editor has focus and the author presses Space
- **THEN** the editor receives the space and playback stays idle
