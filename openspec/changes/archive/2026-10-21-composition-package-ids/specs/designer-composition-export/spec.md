## ADDED Requirements

### Requirement: Each composition exports under its own package id

A composition's `.vcg` SHALL carry a package id of its own (`manifest.id` and the scene's `id`), derived from the
project's id and the composition's id (`compositionPackageId`, `@cg/vcg-format`), never the project's id: two
compositions of one project SHALL export under two ids, and the same composition exported again SHALL keep its id, so
CG Control updates its template rather than adding one. A duplicated composition SHALL export under an id of its own.

#### Scenario: Two compositions of one project

- **WHEN** two compositions of one project are exported
- **THEN** their packages carry two different ids, neither of them the project's

#### Scenario: The same composition exported again

- **WHEN** a composition is exported twice, under any file names
- **THEN** both packages carry the same id

#### Scenario: A duplicated composition

- **WHEN** a composition is duplicated and both are exported
- **THEN** the two packages carry different ids
