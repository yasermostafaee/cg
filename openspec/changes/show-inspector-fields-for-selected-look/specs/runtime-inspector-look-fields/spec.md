## ADDED Requirements

### Requirement: Inspector shows dynamic fields for the selected Look

Inspector SHALL show the current Look's managed instance group and the shared fields. It SHALL use the same Look selection as the source bindings. Field drafts SHALL remain in the row when the selection changes. When the catalogue cannot identify all Look owners, Inspector SHALL keep all fields accessible.

#### Scenario: Switch between two presets with their own fields

- **GIVEN** both presets and a shared group instantiate the same composition
- **WHEN** the operator selects one preset in Inspector
- **THEN** Inspector shows its instance fields and the shared fields
- **AND** the other preset's instance fields are hidden

#### Scenario: Keep a draft when switching tabs

- **WHEN** the operator edits a field in one preset, selects a different preset, and returns
- **THEN** the draft remains available to Update or Discard

#### Scenario: Open a catalogue without instance ownership

- **WHEN** a template catalogue lacks the instance IDs that identify the Look groups
- **THEN** Inspector keeps all dynamic fields available
