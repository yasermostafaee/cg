# designer-box-styling

## ADDED Requirements

### Requirement: The box-shadow supports a spread radius and an inset toggle

The box-shadow on **shape and text** SHALL gain a keyframe-able `spread` radius (the CSS box-shadow 4th length — `shadow.spread` for the shape, `boxShadow.spread` for the text box) and a non-keyframe-able `inset` toggle (the CSS `inset` keyword prefix), rendered identically in preview and export; the text-shadow and the gradient-text glyph drop-shadow SHALL carry NEITHER (CSS `text-shadow` / `drop-shadow` have no spread or inset), and both fields SHALL be optional and additive so a scene authored before this change renders identically (spread 0, inset false) with no migration.

#### Scenario: Spread renders as the box-shadow 4th length on shape and text

- **WHEN** a shape's or the text element's box `shadow` has a `spread` set
- **THEN** the runtime emits it as the box-shadow 4th length (`offsetX offsetY blur spread color`) on the box, identically in preview and export

#### Scenario: Spread keyframes per frame, independently of the other channels

- **WHEN** the box-shadow spread is keyframed — `shadow.spread` for a shape, `boxShadow.spread` for a text box
- **THEN** the spread length tracks the interpolated value each frame while offset / blur / colour keep their own (static or animated) values

#### Scenario: Inset prefixes the box-shadow and is static-only

- **WHEN** the box-shadow `inset` toggle is enabled on a shape or text box
- **THEN** the `box-shadow` string is prefixed `inset`, the toggle shows no keyframe diamond (it is not animatable), and the inset state persists across play / stop and across frames whether or not spread animates

#### Scenario: The text-shadow carries no spread or inset

- **WHEN** the "Text Shadow" section of a text element, or the "Text Shadow" of a content-driven kind (ticker / clock / sequence), is shown or rendered
- **THEN** it exposes NO Spread row and NO Inset toggle, and the rendered `text-shadow` carries neither — its rows are exactly as before

#### Scenario: A gradient text glyph shadow carries no spread or inset

- **WHEN** a text element uses a gradient colour (so its glyph shadow renders as `filter: drop-shadow(...)`)
- **THEN** spread / inset are NOT applied to the drop-shadow; only the box-shadow on the box carries them

#### Scenario: Pre-D-043 scenes render identically

- **WHEN** a scene authored before this change (a box `shadow` with no `spread` / `inset`) is loaded, rendered, or exported
- **THEN** it renders identically to today — spread defaults to 0 (a no-op 4th length) and inset to false (no `inset` prefix) — with no data migration
