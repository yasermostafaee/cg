# designer-dynamic-fields Specification

## ADDED Requirements

### Requirement: An authored empty image allowlist SHALL remain empty

An image field with an explicit `inputMode` that permits choices and no checked `assetOptions` SHALL
offer no packaged choices in Designer Preview, generated Repeater/workbook schemas or CG Control.
It SHALL NOT widen to the project or package image inventory. For backward compatibility only, an
image field with neither `inputMode` nor `assetOptions` SHALL retain the legacy implicit choice set.

#### Scenario: Modern field with no checked image

- **WHEN** the author uses Allowed images or Allowed images + Browse and checks no image
- **THEN** Preview and CG Control show an empty allowed-image picker (plus Browse only when authored)

#### Scenario: Repeater row uses the same empty allowlist

- **WHEN** that image field belongs to a composition repeated as rows
- **THEN** every row editor and generated workbook schema carries zero allowed image choices

#### Scenario: Legacy field retains compatibility

- **WHEN** an imported older image field has no `inputMode` and no `assetOptions`
- **THEN** its historical implicit packaged-image choices remain available
