## ADDED Requirements

### Requirement: CG Setup shows measured file copying and unmeasured installer activity

During an interactive Windows installation, CG Setup SHALL display an activity indicator in an
unmeasured phase. While the engine copies the measured payload, it SHALL show the cumulative
destination bytes for the current install and the planned byte total. Existing bytes from an
older install SHALL not advance the initial copy count. Successful engine exit SHALL complete
the progress display. Reduced-motion settings SHALL stop the activity animation.

#### Scenario: A large file is still being copied

- **WHEN** Windows reports a partial write to the current installation's destination
- **THEN** CG Setup displays the measured byte count and advances the copy bar
- **AND** the displayed count excludes files held over from a previous installation

#### Scenario: The engine is preparing or registering files

- **WHEN** the engine is still operating and there is no reliable byte measure for the current step
- **THEN** CG Setup displays its activity and the current step without a numeric progress value
