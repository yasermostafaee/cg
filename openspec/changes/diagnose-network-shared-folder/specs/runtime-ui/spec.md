## ADDED Requirements

### Requirement: Shared files registration SHALL show its refusal outside the control row

Station setup SHALL show a rejected Shared files save as one section message and keep the entered
path available for correction. The input and Save path action SHALL keep their aligned control row.

#### Scenario: A long UNC refusal does not collapse the path field

- **WHEN** a station admin saves an unavailable UNC folder
- **THEN** the entered path remains editable at its usual width
- **AND** the Bridge refusal appears once below the controls

#### Scenario: Recheck a saved folder

- **WHEN** a station admin opens Shared files with an unchanged local or network path
- **THEN** Check access reads the path from the Bridge server without saving it again
- **AND** Shared template folder displays the access diagnosis if the folder cannot be opened
