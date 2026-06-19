# designer-project-assets

## ADDED Requirements

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
