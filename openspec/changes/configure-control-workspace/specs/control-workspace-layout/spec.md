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

#### Scenario: Reset the layout from General

- **WHEN** the operator customizes the workspace
- **THEN** the reset action is available in Settings → General → Workspace
- **AND** it does not occupy the Layers toolbar
- **AND** it is disabled when the workspace is already using the shipped layout.

### Requirement: The Layers panel can display regular and live layers side by side

The console SHALL offer the operator a choice between a stacked list and two side-by-side layer
groups. Each group SHALL preserve descending layer order and the same row controls. Both views
SHALL apply the same search, Hide empty filter and selected row.

#### Scenario: Show the two layer groups in a wide panel

- **WHEN** the operator enables side-by-side groups and the Layers panel has room
- **THEN** regular and live layers appear in distinct columns with their own headers
- **AND** the first column follows the interface reading direction
- **AND** switching between the arrangements preserves row identity, selection, and controls

#### Scenario: Retain the arrangement at narrow widths and after restore

- **WHEN** the panel is too narrow for the two groups
- **THEN** the panel stacks them with the row controls accessible
- **AND** the selected arrangement returns when adequate space is available again
- **WHEN** the operator reloads or restores a UI profile
- **THEN** the saved arrangement returns, with stacked as the default for older profiles
