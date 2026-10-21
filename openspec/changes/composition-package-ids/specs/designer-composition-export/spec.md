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

### Requirement: Save As writes a copy that is a project of its own

The author's **Save As** SHALL write a copy with a NEW project id, carrying the project's assets; the open project
SHALL become that copy — its scene and every scene in its undo history take the new id, its assets are written under
it, and it gets its own Recent entry and file handle — so the copy's compositions export under ids of their own. The
original file SHALL NOT be changed. A Save that falls back to the save dialog (no file yet, or the old file could not
be written) SHALL keep the project's id.

#### Scenario: Save As then export

- **WHEN** a project is saved, its composition exported, then the project is saved with Save As and the composition
  exported again
- **THEN** the copy's project id differs from the original's, the second package's id differs from the first, the
  copy's pictures still resolve, and a later Save of the copy keeps the copy's id

#### Scenario: No undo brings the original's id back

- **WHEN** the author undoes or redoes after Save As
- **THEN** the open project's id is still the copy's
