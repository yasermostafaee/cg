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

- **WHEN** the operator closes the Inspector to the right of a maximized monitor **THEN** the layout becomes
  selected-layer and the selection remains intact

#### Scenario: No layer is selected

- **WHEN** a monitor is maximized without a selected layer **THEN** the companion controls and
  companion surfaces are absent

#### Scenario: Companions are visible at wide and narrow widths

- **WHEN** the operator shows the selected layer or Inspector with a maximized monitor
- **THEN** a single intrinsic-height layer row sits below the monitor with no panel header, column
  header or separate scroll area
- **AND** the optional Inspector fills a separate full-height column to the right without covering
  the picture or the layer row

#### Scenario: Maximized panels use the space from the main chrome

- **WHEN** the operator maximizes PROGRAM, PREVIEW, Layers or Inspector
- **THEN** the app header and status footer are hidden, while the panel's own controls and
  applicable alerts remain available
- **AND** exiting the maximized panel restores both bars
