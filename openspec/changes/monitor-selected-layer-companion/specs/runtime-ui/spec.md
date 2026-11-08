## ADDED Requirements

### Requirement: A maximized monitor SHALL optionally retain the selected layer context

When PROGRAM or PREVIEW is maximized with a selected layer, CG Control SHALL offer monitor-only,
selected-layer and selected-layer-plus-Inspector layouts. Layout changes SHALL preserve the selection.
No companion choice or empty companion surface SHALL appear without a selected layer.
The selected layer and Inspector SHALL occupy allocated layout space and SHALL NOT overlay or obscure
the maximized monitor picture.

#### Scenario: A selected layer is temporarily hidden by monitor-only

- **WHEN** the operator changes from a companion layout to monitor-only and back **THEN** the same
  selected layer reappears without requiring another row selection

#### Scenario: The compact selected row is clicked again

- **WHEN** the operator clicks the already-selected row in the monitor companion **THEN** that row
  remains selected

#### Scenario: The companion Inspector is closed

- **WHEN** the operator closes the Inspector beside a maximized monitor **THEN** the layout becomes
  selected-layer and the selection remains intact

#### Scenario: No layer is selected

- **WHEN** a monitor is maximized without a selected layer **THEN** the companion controls and
  companion surfaces are absent

#### Scenario: Companions are visible at wide and narrow widths

- **WHEN** the operator shows the selected layer or Inspector beside a maximized monitor **THEN** the
  PGM/PVW picture remains unobscured; wide layouts allocate adjacent columns and narrow layouts keep
  the monitor in a separate upper row
