## ADDED Requirements

### Requirement: The workstation operator can place workspace panels

The console SHALL expose independent monitor order, Layers vertical position, and Inspector side settings for the local workstation.

#### Scenario: Rearrange the workspace

- **WHEN** the operator changes any position setting in General
- **THEN** CG Control moves the matching panels to the chosen physical positions immediately
- **AND** resize controls follow the new sides and Preview and Programme keep their existing state
- **AND** an RTL interface preserves the selected physical positions, with RTL controls and panel contents

#### Scenario: Restore local settings

- **WHEN** CG Control reloads, loads a named UI profile, or resets the layout
- **THEN** it restores the corresponding positions and sizes
- **AND** a legacy saved layout without positions uses the shipped placement

#### Scenario: Find creation in Templates

- **WHEN** the operator looks for New live layout
- **THEN** the creation action is available through Templates and omitted from the Layers toolbar
