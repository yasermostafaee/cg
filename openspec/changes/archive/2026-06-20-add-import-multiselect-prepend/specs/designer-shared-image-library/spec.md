# designer-shared-image-library

## ADDED Requirements

### Requirement: Multi-file shared-library import with per-file indicators

The Shared Library SHALL support importing multiple images at once. Picking N files shows N loading tiles; each image is imported independently — one failing clears only its own tile while the rest still import — and the batch is added at the top of the library in selection order (newest batch on top). Cancelling the picker (selecting nothing) shows no indicator at all.

#### Scenario: Multiple files show per-file tiles, then appear in selection order

- **WHEN** the operator picks N image files for the shared library
- **THEN** N loading tiles appear, and as the imports complete the images appear at the top of the library in selection order

#### Scenario: One failing import does not block the others

- **WHEN** one of the picked files fails to import
- **THEN** its loading tile is cleared and the remaining files still import

#### Scenario: Cancelling the picker shows nothing

- **WHEN** the operator opens the picker but selects no file
- **THEN** no loading tile is shown

### Requirement: Freshly imported library image appears at the top

A freshly imported shared image SHALL appear at the TOP of the library list (newest first), and the Shared Library search SHALL still filter correctly.

#### Scenario: A new import is prepended

- **WHEN** the operator imports an image into a non-empty library
- **THEN** the new image appears at the top, above the existing images

#### Scenario: Search still filters after prepend

- **WHEN** a search query is active
- **THEN** the library shows only images whose filename matches the query, in newest-first order
