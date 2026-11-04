# designer-shell Delta

## ADDED Requirements

### Requirement: New Project duration is editable in frames or seconds

The New Project dialog SHALL expose both integer Total frames and Duration in seconds. Editing
either value SHALL update the other through the selected frame rate. Seconds SHALL quantize to the
nearest valid whole frame, never below one frame, and the seconds field SHALL then display the
exact nearest-frame duration. Confirming SHALL keep using the existing integer `durationFrames`
project-creation contract.

#### Scenario: Seconds calculate frames

- **WHEN** frame rate is 50 fps and the author enters 10 seconds
- **THEN** Total frames becomes 500 and creating the project stores `durationFrames: 500`

#### Scenario: Frames calculate seconds

- **WHEN** the author edits Total frames
- **THEN** Duration shows `frames / frameRate` without a separate manual calculation

#### Scenario: Fractional rate snaps to a real frame boundary

- **WHEN** the requested seconds cannot be represented exactly at the selected fractional rate
- **THEN** Total frames is rounded to the nearest whole frame and Duration shows that frame count's
  actual duration
