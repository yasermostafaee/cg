# designer-project-assets — delta (assets travel inside the project, B-104 / D-150)

## ADDED Requirements

### Requirement: A project's assets travel with the project

Project assets SHALL be part of the project document rather than a separate store the document
merely points at. Saving a project SHALL write its asset bytes into the project package; opening
a project SHALL restore them from that package.

The asset index restored from a package SHALL preserve every fact the importing session
recorded — the asset's identity, kind, original filename, content hash, byte size, and any
source lineage — so that reopening a project is indistinguishable from never having closed it.

Restoring a project's assets SHALL be idempotent: opening the same package twice SHALL NOT
duplicate assets, because identical bytes already dedupe by content hash.

There SHALL be exactly one asset-metadata shape across the codebase. The package's asset entry
SHALL be derived from it rather than declared separately, so the two cannot drift.

#### Scenario: Assets are listed after reopening from a package

- **WHEN** a project with imported assets is saved and reopened from its package
- **THEN** the assets panel lists every asset it listed before, with the same filenames
- **AND** each asset's bytes resolve, so elements referencing them render rather than showing a
  broken placeholder

#### Scenario: Reopening does not duplicate assets

- **WHEN** the same project package is opened twice in a session
- **THEN** the assets panel lists each asset once

#### Scenario: An asset's recorded lineage survives the round trip

- **WHEN** a project containing an asset with recorded source lineage is saved and reopened
- **THEN** the reopened asset carries the same lineage, not a reconstructed approximation
