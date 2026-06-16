# designer-inspector

## ADDED Requirements

### Requirement: The text element's inspector exposes a font-weight control

The plain **text** element's inspector SHALL expose a font-weight control — a select of the supported weights (100..900, step 100) — inline beside the font-family and font-size controls, matching the control the ticker, sequence, and clock inspectors already have. Choosing a weight SHALL write `font.weight` (via the non-keyframe element-update path, like font-family) so the text renders at that weight identically in canvas, preview, and export. The control SHALL NOT be keyframe-able (no keyframe diamond) and SHALL be single-select-only (not offered as a shared/multi-edit field). An existing text element's authored `font.weight` SHALL be shown unchanged — there is no schema, render, or data change.

#### Scenario: The text inspector shows a 100–900 font-weight control

- **WHEN** a text element is selected
- **THEN** its inspector shows a font-weight control (a 100..900 select) inline beside the font-family / font-size controls, reflecting the element's current `font.weight`

#### Scenario: Choosing a weight updates the text and is not keyframe-able

- **WHEN** the operator chooses a weight in the text inspector
- **THEN** `font.weight` is written via the element-update path and the text renders at that weight (canvas / preview / export); no keyframe diamond renders for it and no keyframe track is created (it is non-keyframable, like font-family)

#### Scenario: An existing text weight is shown unchanged

- **WHEN** a text element authored before this change (with a `font.weight` already in the schema) is selected
- **THEN** its existing weight is shown in the new control unchanged — no schema change and no data migration

#### Scenario: Font-weight is single-select-only

- **WHEN** multiple elements are selected
- **THEN** font-weight is not offered as a shared/multi-edit field (single-select-only, consistent with font-family and alignment)
