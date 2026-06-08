## ADDED Requirements

### Requirement: Optional idle loop during the hold

A composition SHALL optionally define a `holdLoopStart` frame inside its entrance,
satisfying `activeRange.in ≤ holdLoopStart ≤ outPoint`. When `holdLoopStart` is
set, the HOLD phase SHALL loop `[holdLoopStart → outPoint]` continuously instead
of freezing at `outPoint`; that segment is part of the entrance and SHALL be
played in full the first time through before it begins looping, so no frame is
skipped. When `holdLoopStart` is absent, the hold SHALL freeze at `outPoint`
exactly as without this feature. The idle loop SHALL compose with the timing
modes: under `manual` it loops until `stop()`; under `auto-out` it loops for
`holdMs` and then the exit plays; under `loop-cycle` it loops during each cycle's
hold. `stop()` during the idle loop SHALL play the exit `[outPoint →
activeRange.out]` and settle hidden. The exported template metadata SHALL carry
`holdLoopStart`, and the preview SHALL behave identically to the exported file.

#### Scenario: Hold loops the idle segment when set

- **WHEN** `holdLoopStart` is set and `play()` reaches the hold
- **THEN** the playhead loops `[holdLoopStart → outPoint]` continuously instead of
  freezing, after playing the entrance (including that segment) once in full

#### Scenario: Absent holdLoopStart freezes the hold

- **WHEN** `holdLoopStart` is not set
- **THEN** the hold freezes at `outPoint`, unchanged from the single-marker
  behavior

#### Scenario: Idle loop composes with auto-out

- **WHEN** the mode is `auto-out` with `holdMs = T` and an idle loop is set
- **THEN** the idle loops for T and then the exit plays from `outPoint` to the
  active-region end

#### Scenario: Stop during the idle loop plays the exit

- **WHEN** `stop()` is called while the idle loop is running
- **THEN** the exit plays from `outPoint` to the active-region end and the
  composition settles hidden
