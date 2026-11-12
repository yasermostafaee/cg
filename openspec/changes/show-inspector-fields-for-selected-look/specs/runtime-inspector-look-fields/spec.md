## ADDED Requirements

### Requirement: Inspector shows dynamic fields for the selected Look

Inspector SHALL show the current Look's managed instance group and the shared fields. It SHALL use the same Look selection as the source bindings. Field drafts SHALL remain in the row when the selection changes. When the catalogue cannot identify all Look owners, Inspector SHALL recover them from the same channel's coherent retained page when available. If ownership remains unverified, Inspector SHALL keep all fields accessible.

Inspector SHALL share an edit to the same authored bound title on a reused live frame across
the presets containing that frame. Preset-local fields and titles on other frames SHALL remain
independent. An edit SHALL use the existing row draft, Update and Discard controls.

#### Scenario: Switch between two presets with their own fields

- **GIVEN** both presets and a shared group instantiate the same composition
- **WHEN** the operator selects one preset in Inspector
- **THEN** Inspector shows its instance fields and the shared fields
- **AND** the other preset's instance fields are hidden

#### Scenario: Keep a draft when switching tabs

- **WHEN** the operator edits a field in one preset, selects a different preset, and returns
- **THEN** the draft remains available to Update or Discard

#### Scenario: Edit a title on a frame reused by several presets

- **GIVEN** several presets reuse a composition holding one live plate and its bound title
- **WHEN** the operator edits the title in any preset and switches to another that includes the frame
- **THEN** the title shows the same draft value
- **AND** Update applies the title to all occurrences, including on the running template when on air
- **AND** Discard restores the last applied values
- **AND** titles for different frames and fields owned by a single preset remain independent

#### Scenario: Open an imported template on an older Bridge

- **GIVEN** the catalogue lacks instance IDs and the retained page for this template and channel contains a coherent Look map
- **WHEN** the operator selects a preset
- **THEN** Inspector shows its dynamic fields and the shared fields

#### Scenario: Ownership cannot be verified

- **WHEN** the catalogue is incomplete and the retained page cannot verify its Look owners
- **THEN** Inspector keeps all dynamic fields available
