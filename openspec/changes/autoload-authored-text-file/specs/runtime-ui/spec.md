## MODIFIED Requirements

### Requirement: A text-carrying field can take its value from a text file (manual reload)

An authored file source SHALL be read and staged automatically when it is first reconciled for a loaded row or when its authored path/delimiter changes. Later Reload remains manual. Automatic loading SHALL not repeatedly overwrite operator edits, and a failed read SHALL keep the previous value while reporting the existing error.

#### Scenario: Fixed file initial value

- **WHEN** a template with a readable authored fixed file is loaded **THEN** the field's staged value is populated from the current file without pressing Reload

#### Scenario: No repeated overwrite

- **WHEN** the automatic load has completed and the operator edits the staged value **THEN** an unrelated Inspector render does not re-read or replace that edit
