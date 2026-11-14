## ADDED Requirements

### Requirement: Authors can hide a title on one composition instance

The Designer SHALL let an author hide a direct text layer on the selected composition instance.
Other instances SHALL continue to use their own visibility settings and the shared title data.

#### Scenario: Solo preset without a title

- **GIVEN** a one-frame and two-frame preset reuse the same titled frame composition
- **WHEN** the author hides the title on the instance in the one-frame preset
- **THEN** the one-frame preset still renders its live frame
- **AND** the two-frame preset shows the shared title with its original data key

#### Scenario: Save and export instance visibility

- **WHEN** the author saves, reloads or exports the project
- **THEN** the authored visibility is preserved in the saved project, Preview and output
- **AND** older projects with no instance setting render their authored text as before
