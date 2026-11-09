## ADDED Requirements

### Requirement: A successful template bind selects the destination layer

CG Control SHALL select the item created by a successful bind from the layer's Templates dialog.
The existing Inspector selection SHALL follow that item after the dialog closes.

#### Scenario: Load a template from the layer's picker

- **WHEN** the operator commits a template in an empty layer's picker and the bind is accepted
- **THEN** the picker closes and the destination layer is selected with its Inspector data
- **AND** the same rule applies to a newly imported template and an existing catalogue entry

#### Scenario: Close the picker without a bind or receive a refusal

- **WHEN** the operator dismisses the picker without loading or the bridge refuses the bind
- **THEN** the prior layer selection is preserved
