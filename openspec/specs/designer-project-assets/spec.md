# designer-project-assets Specification

## Purpose

TBD - created by archiving change add-image-import-loading. Update Purpose after archive.

## Requirements

### Requirement: Project Assets import shows a loading indicator

Once a file is actually selected (not while the file picker is open), the Project Assets panel SHALL show a loading indicator (a spinner tile) during the import — for both the image and font add paths — cleared when the import resolves (the real thumbnail replaces it via the asset-list refresh) or errors. Cancelling the picker — or selecting nothing — shows no indicator at all. This gives feedback during the decode/store gap and never leaves a stuck spinner. The import logic itself is unchanged.

#### Scenario: Indicator shown after a file is selected

- **WHEN** the operator picks a file to add (image or font) and the import (decode/store) is in progress
- **THEN** the panel shows a loading indicator for the pending import

#### Scenario: Indicator replaced by the thumbnail on success

- **WHEN** a pending project-asset import resolves
- **THEN** the loading indicator is cleared and the imported asset appears as a thumbnail

#### Scenario: No indicator when the picker is cancelled

- **WHEN** the operator opens the file picker but cancels it or selects nothing
- **THEN** no loading indicator is shown

#### Scenario: Indicator cleared on error

- **WHEN** a selected file's import errors
- **THEN** the loading indicator is cleared — no stuck spinner

### Requirement: Multi-file project-asset import with per-file indicators

The Project Assets panel SHALL support importing multiple files at once, for both the image and font add paths. Picking N files shows N loading tiles; each file is imported independently — one failing clears only its own tile while the rest still import — and the batch is added at the top of the list in selection order (newest batch on top). Cancelling the picker (selecting nothing) shows no indicator at all.

#### Scenario: Multiple files show per-file tiles, then appear in selection order

- **WHEN** the operator picks N files via the image or font add path
- **THEN** N loading tiles appear, and as the imports complete the assets appear at the top of the list in selection order

#### Scenario: One failing import does not block the others

- **WHEN** one of the picked files fails to import
- **THEN** its loading tile is cleared and the remaining files still import

#### Scenario: Cancelling the picker shows nothing

- **WHEN** the operator opens the picker but selects no file
- **THEN** no loading tile is shown

### Requirement: Freshly imported asset appears at the top

A freshly imported project asset SHALL appear at the TOP of the asset list (newest first), and the Project Assets search SHALL still filter correctly.

#### Scenario: A new import is prepended

- **WHEN** the operator imports a file into a non-empty asset list
- **THEN** the new asset appears at the top, above the existing assets

#### Scenario: Search still filters after prepend

- **WHEN** a search query is active
- **THEN** the panel shows only assets whose filename matches the query, in newest-first order

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
