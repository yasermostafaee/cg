# designer-shared-font-library Specification

## ADDED Requirements

### Requirement: Shared Library imports and lists fonts

The Designer SHALL let the author import supported font files into the existing Shared Library and
SHALL persist those fonts independently of any project.

#### Scenario: Import once and use in another project

- **WHEN** the author imports a supported font through Shared Library
- **THEN** it appears as a font entry in that library and in the font-family picker of the current and
  subsequently opened projects without another import

#### Scenario: Wrong file type is selected

- **WHEN** the author selects a file that is not a supported font for Font import
- **THEN** it is rejected before storage and the existing skipped-file notice names it

### Requirement: Shared fonts render in authoring and preview

The Designer SHALL resolve shared-font references in the editor document, Canvas and Preview iframe
using the same `asset-<assetId>` family convention as project fonts.

#### Scenario: Preview a template using a shared font

- **WHEN** a text or ticker uses a shared font and Preview is opened
- **THEN** the shared bytes load into the preview document before playback and the final glyph metrics
  are used

### Requirement: Shared fonts export self-contained

Both `.vcg` and single-file HTML export SHALL resolve shared-font bytes and package/inline them so the
played template makes no request back to the Designer library.

#### Scenario: Export either supported format

- **WHEN** a scene using a shared font is exported as `.vcg` or single-file HTML
- **THEN** the font bytes are contained in the artifact and the artifact renders without the Shared
  Library or a network request

#### Scenario: Referenced font was removed

- **WHEN** a scene references a shared font that no longer resolves
- **THEN** export reports the missing font through the existing preflight path and the Designer does not
  crash

### Requirement: Removing a shared font does not mutate exports

Removing a shared-font index entry SHALL NOT mutate any previously exported artifact.

#### Scenario: Remove after export

- **WHEN** a shared font is removed after one or more templates were exported
- **THEN** the exported artifacts remain unchanged and playable because they already contain the bytes
