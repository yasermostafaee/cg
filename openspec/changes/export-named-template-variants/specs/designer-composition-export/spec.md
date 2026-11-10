## MODIFIED Requirements

### Requirement: Each composition exports under its own package id

A composition's .vcg SHALL carry a package id of its own in both the manifest and scene. Export under the suggested filename SHALL preserve the composition id derived from the project and composition. A deliberate filename change in Designer SHALL create a distinct, deterministic package id for that composition and filename. The project and composition identity SHALL NOT change.

#### Scenario: Two compositions of one project

- **WHEN** two compositions of one project are exported
- **THEN** their packages carry two different ids, neither of them the project's

#### Scenario: The same composition exported again

- **WHEN** a composition is exported twice under its suggested name
- **THEN** both packages carry the existing composition id and CG Control offers replacement on re-import

#### Scenario: Save a named VCG variant

- **WHEN** the author replaces the proposed VCG filename with a different name in the save dialog
- **THEN** the package carries a distinct id and the chosen name, and imports beside the original
- **AND** re-exporting under the same alternate name keeps the same variant id

#### Scenario: A duplicated composition

- **WHEN** a composition is duplicated and both are exported
- **THEN** the two packages carry different ids
