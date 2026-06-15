# designer-inspector-registry

## MODIFIED Requirements

### Requirement: Keyframe-able styling for time-driven elements

For ticker, clock, and sequence elements the registry SHALL expose as keyframe-able ONLY transform, opacity, filter, `text.color` (the element's `color`, incl. the solid-variant rule when a gradient `colorFill` is present), and `shadow.*` (the element's `textShadow`). It SHALL NOT expose `stroke.*`, `cornerRadius` (or the per-corner sub-tracks), `backgroundColor`, or `padding.*` for these kinds (D-056 — content-driven kinds carry only their text; box styling belongs on a separate shape layer). Repeater (no background) SHALL expose only transform, opacity, and filter. Shape and text keyframe-ability SHALL be unchanged, and each property SHALL be a single registry declaration shared across the right inspector, timeline-left, and multi-select editor.

#### Scenario: Time-driven kinds keyframe only text colour and text-shadow

- **WHEN** a ticker, clock, or sequence is selected
- **THEN** only its transform / opacity / filter, `text.color`, and `shadow.*` (text-shadow) properties show a keyframe diamond — there is NO diamond for `stroke.*`, `cornerRadius`, `backgroundColor`, or `padding.*`

#### Scenario: text.color keeps the solid-only rule on the content-driven kinds

- **WHEN** a clock or sequence has a gradient `colorFill` set (ticker has no `colorFill`)
- **THEN** `text.color` shows NO keyframe diamond (a gradient cannot interpolate); a solid colour shows the diamond

#### Scenario: Repeater, shape, and text are unchanged

- **WHEN** a repeater, shape, or text element is selected
- **THEN** the repeater exposes only transform / opacity / filter, and the shape and text keyframe-able sets are exactly as they were (shape keeps stroke / cornerRadius / shadow / fill; text keeps stroke / cornerRadius / background / both shadows / padding)
