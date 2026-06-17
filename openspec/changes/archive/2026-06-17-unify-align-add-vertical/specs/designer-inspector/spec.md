# designer-inspector

## ADDED Requirements

### Requirement: Unified alignment button-group across element kinds

The inspector SHALL render alignment using ONE shared button-group control (the text element's group is the model) for every kind that has alignment, so a later visual polish styles a single control. Clock and sequence SHALL render their horizontal align (start / center / end) with this button-group, replacing the previous dropdown, AND gain a vertical-align button-group (top / middle / bottom). The ticker SHALL gain a vertical-align button-group ONLY (it is a crawl — no horizontal align). The text element SHALL keep both its horizontal and vertical groups, unchanged. The horizontal button-group SHALL offer start / center / end only — `justify` stays text-SCHEMA-only and is never exposed in the control nor added to any other kind. Alignment (horizontal AND vertical) SHALL be NON-keyframe-able on every kind: each group writes via the element-update path (not the keyframe path), creates no keyframe track, and renders no keyframe diamond; and `align` / `verticalAlign` SHALL remain absent from `AnimatablePropertySchema`. Alignment SHALL be single-select-only (not offered in the multi-select editor), consistent with font-family and font-weight.

#### Scenario: Clock and sequence use the button-group (not a dropdown) plus a vertical group

- **WHEN** a clock or sequence element is inspected
- **THEN** its horizontal align is the shared start/center/end button-group (the dropdown is gone) AND a vertical-align button-group (top/middle/bottom) is shown; choosing either writes `align` / `verticalAlign` via the element-update path with no keyframe diamond and no track

#### Scenario: The ticker shows a vertical group only

- **WHEN** a ticker element is inspected
- **THEN** it shows a vertical-align button-group (top/middle/bottom) and NO horizontal-align control (a crawl has no horizontal alignment)

#### Scenario: Text keeps both groups and never exposes justify

- **WHEN** a text element is inspected
- **THEN** it shows the same horizontal (start/center/end) and vertical (top/middle/bottom) button-groups as before — `justify` remains in the schema but is never an option in the control

#### Scenario: Alignment is not keyframe-able anywhere

- **WHEN** alignment (horizontal or vertical) is shown for any kind (text / ticker / clock / sequence)
- **THEN** no keyframe diamond renders for it and `align` / `verticalAlign` are not members of `AnimatablePropertySchema`
