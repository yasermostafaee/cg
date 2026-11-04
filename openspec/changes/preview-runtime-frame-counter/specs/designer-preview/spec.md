# Designer Preview — runtime frame status

## ADDED Requirements

### Requirement: Preview shows the root runtime frame

The Preview workspace SHALL display the root composition's currently applied runtime frame beside
elapsed rehearsal time, using the Designer timeline's total-frame convention.

#### Scenario: A normal run advances

- **WHEN** the root runtime applies successive frames
- **THEN** Preview shows those frames against the composition's total frame count

#### Scenario: A hold freezes and an outro resumes

- **WHEN** the composition reaches a parked lifecycle hold
- **THEN** the displayed current frame remains fixed
- **AND WHEN** the outro begins
- **THEN** the displayed frame advances through the outro

#### Scenario: A parked content hold repaints internally

- **WHEN** content repaints independently while the root lifecycle is in a parked hold
- **THEN** the displayed lifecycle frame remains fixed at the hold frame

#### Scenario: An authored Middle loop advances during hold

- **WHEN** the root lifecycle has a non-empty Middle-loop range while waiting for content
- **THEN** the displayed root frame advances and wraps through that authored range
- **AND** independently moving nested content cannot overwrite the root frame

#### Scenario: A non-empty lifecycle leg is collapsed as visually static

- **WHEN** a non-empty intro or outro contains no root pixels that require per-frame repainting
- **THEN** Preview reports the runtime's real start/end jump
- **AND** observation does not add duration or delay content start

#### Scenario: A static composition is rehearsed

- **WHEN** a composition is empty or contains only elements with no root frame-dependent paint
- **THEN** Preview derives its displayed frame from elapsed authored time at the scene frame rate
- **AND** a loop wraps that display clock after reaching the authored end frame
- **AND** a fresh Play visibly resets both frame and elapsed status before the next run
- **AND** Runtime lifecycle timing and output remain unchanged

#### Scenario: A loop wraps

- **WHEN** the root runtime wraps a loop to its start frame
- **THEN** Preview immediately shows the wrapped frame and continues from there

#### Scenario: A nested timeline runs

- **WHEN** a nested composition applies frames independently
- **THEN** those nested frames do not replace the root composition's displayed frame

### Requirement: Elapsed time follows open-ended Preview runs

Preview elapsed time SHALL continue while any composition scope has loop-cycle or content-driven
timing, and SHALL stop only when that run completes or the author issues Stop.

#### Scenario: A loop or content-driven hold exceeds the active range

- **WHEN** the Preview remains active beyond the root composition's nominal frame duration
- **THEN** elapsed time continues increasing instead of freezing at that nominal duration
