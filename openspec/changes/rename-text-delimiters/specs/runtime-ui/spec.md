## ADDED Requirements

### Requirement: A station admin can rename a text file delimiter

CG Control SHALL allow station admins to rename each shipped or custom delimiter through Station setup. The accepted name SHALL be persisted with the same id, separator value and list position. Field pickers SHALL show the accepted name and fields SHALL continue to split on their selected separator value.

#### Scenario: Rename a shipped or custom delimiter

- **GIVEN** a station admin views Text file delimiters in Station setup
- **WHEN** the admin saves a new nonblank name on either a shipped or a custom delimiter
- **THEN** the station list and field pickers show the new name
- **AND** the delimiter's id, separator value and list position are preserved

#### Scenario: Cancel or leave the name blank

- **WHEN** an admin cancels a rename or attempts to save a blank name
- **THEN** the accepted name stays in use

#### Scenario: The list is read-only for this sign-in

- **WHEN** a viewer without station-admin rights opens Text file delimiters
- **THEN** the delimiter names are visible and no Rename action is offered
