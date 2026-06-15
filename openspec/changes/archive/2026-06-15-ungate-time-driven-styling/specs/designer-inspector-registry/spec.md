# designer-inspector-registry

## RENAMED Requirements

- FROM: `### Requirement: Keyframe-able styling for time-driven elements is deferred`
- TO: `### Requirement: Keyframe-able styling for time-driven elements`

## MODIFIED Requirements

### Requirement: Keyframe-able styling for time-driven elements

For ticker, clock, and sequence elements the registry SHALL expose as keyframe-able every styling property whose animated value the runtime applies at playout: transform, opacity, filter, `cornerRadius` (including the per-corner sub-tracks `cornerRadius.tl/tr/br/bl`, D-042), `stroke.*`, `text.color` (the element's `color`), `backgroundColor`, `shadow.*` (the element's `textShadow`), and — for clock and sequence only — `padding.*`. `backgroundColor` SHALL be keyframe-able only when the solid variant is set (no diamond when a gradient `backgroundFill` or `colorFill` is present, mirroring the `fill.color` / `text.color` solid-only rule). Ticker `padding` SHALL remain non-keyframe-able (its inner-viewport padding feeds the crawl-measurement and is deferred). Repeater (no background) SHALL expose only transform, opacity, and filter. Shape and text keyframe-ability SHALL be unchanged, and each property SHALL be a single registry declaration shared across the right inspector, timeline-left, and multi-select editor.

#### Scenario: Time-driven kinds keyframe stroke, colour, background, and shadow

- **WHEN** a ticker, clock, or sequence is selected
- **THEN** its `stroke.*`, `text.color`, `backgroundColor` (solid), and `shadow.*` properties show a keyframe diamond in both the right inspector and the timeline-left (alongside the already-animatable transform / opacity / filter / `cornerRadius`)

#### Scenario: backgroundColor is solid-only — no diamond on a gradient fill

- **WHEN** a ticker, clock, or sequence has a gradient `backgroundFill` (or, for clock/sequence, a gradient `colorFill`) set
- **THEN** `backgroundColor` shows NO keyframe diamond (a gradient cannot interpolate), exactly as the `fill.color` / `text.color` rule already does

#### Scenario: Padding keyframes on clock and sequence but not ticker

- **WHEN** a clock or a sequence is selected
- **THEN** its `padding.*` sides show a keyframe diamond; but a ticker's `padding` shows NO diamond (deferred — ticker padding feeds the crawl viewport measurement)

#### Scenario: Repeater, shape, and text are unchanged

- **WHEN** a repeater, shape, or text element is selected
- **THEN** the repeater exposes only transform / opacity / filter, and the shape and text keyframe-able sets are exactly as before this change (additive un-gating)
