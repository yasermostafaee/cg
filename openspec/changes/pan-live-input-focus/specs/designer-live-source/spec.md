## MODIFIED Requirements

### Requirement: The author chooses how a live plate is fitted into its box

A Live Source plate SHALL offer a fit control and retain any stored crop focus per plate/look.
Designer SHALL leave direct input panning to CG Control. An absent focus SHALL default to the centre
without writing a field into an older scene, and `contain` SHALL ignore a stored focus.
The Canvas SHALL show Crop edges below the Plate name when the author selects `cover`.

#### Scenario: Existing projects retain saved focus

- **GIVEN** a Live Source plate using `cover` with saved focus `{x: 0.2, y: 0.8}`
- **WHEN** the author opens the plate in Designer
- **THEN** the existing value survives save and export
- **AND** an authored poster uses that focus while `cover` is selected

#### Scenario: Existing and contain plates remain centred

- **GIVEN** a plate with no stored focus
- **THEN** cover cropping remains centred without writing the field
- **AND** a saved focus cannot alter a `contain` fit
