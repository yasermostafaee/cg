## MODIFIED Requirements

### Requirement: The author chooses how a live plate is fitted into its box

A Live Source plate SHALL offer a fit control and, for `cover`, normalized horizontal and vertical
crop-focus controls. Focus SHALL be stored on the plate, carried per look, and default to the centre
without writing a field into an older scene. Under `contain`, the focus controls SHALL be withheld
because the whole picture is visible and no edge is cropped.

#### Scenario: The author chooses the visible source region

- **GIVEN** a Live Source plate using `cover`
- **WHEN** the author enters 20% horizontal and 80% vertical focus
- **THEN** the plate stores `{x: 0.2, y: 0.8}`
- **AND** an authored poster previews the same focus

#### Scenario: Existing and contain plates remain centred

- **GIVEN** a plate with no stored focus
- **THEN** both controls read 50% without writing the field
- **AND** changing focus cannot alter a `contain` fit
