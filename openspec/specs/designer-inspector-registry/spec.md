# designer-inspector-registry Specification

## Purpose

TBD - created by archiving change add-keyframe-ability-registry. Update Purpose after archive.

## Requirements

### Requirement: Central registry is the single source of keyframe-ability and field presence

The Designer SHALL derive every property's keyframe-ability (whether a keyframe
diamond renders) and its inspector presence and section from ONE central,
per-element-kind registry, and the three property consumers — the right inspector,
the timeline-left inspector, and the multi-select editor — SHALL read from that
registry rather than from per-file hand-written lists. A property MAY be marked
keyframe-able only if its id is a member of the schema's `AnimatablePropertySchema`.

#### Scenario: One registry feeds all three consumers

- **WHEN** any property is rendered in the right inspector, the timeline-left
  inspector, or the multi-select editor
- **THEN** its keyframe-ability (diamond) and its presence/section come from the
  central per-kind registry, not from per-file hand-written logic

#### Scenario: Right and timeline-left agree on the keyframe-able set

- **WHEN** a property shows a keyframe diamond in the right inspector
- **THEN** the same property shows a keyframe affordance in the timeline-left
  inspector, and vice-versa — neither panel shows a diamond the other omits

#### Scenario: A new element kind or property is declared once

- **WHEN** a new element kind or animatable property is added by declaring it in
  the registry
- **THEN** its diamond and inspector presence are correct in all three consumers
  with no per-file edits

### Requirement: A keyframe diamond renders exactly when the property is keyframe-able

The Designer SHALL render a keyframe diamond for a property IF AND ONLY IF the
registry marks that property keyframe-able for the selected element's kind and
instance; a non-keyframe-able control SHALL render no keyframe glyph at all (no
disabled placeholder diamond).

#### Scenario: Keyframe-able style properties show a diamond in both panels

- **WHEN** a shape or text element exposes border-radius, drop-shadow /
  text-shadow sub-properties, or box-padding
- **THEN** each is keyframe-able and shows a diamond in both the right inspector
  and the timeline-left inspector

#### Scenario: Discrete clock settings have no diamond

- **WHEN** a clock's `digits` or `mode` is shown
- **THEN** it has no keyframe diamond (discrete settings, not animatable)

#### Scenario: Font family, weight, and alignments never show a diamond

- **WHEN** font-family, font-weight, or any alignment (horizontal or vertical) is
  shown on any element
- **THEN** it has no keyframe diamond

#### Scenario: Non-animatable controls render no placeholder diamond

- **WHEN** a non-keyframe-able control is shown (an image's `fit`, a ticker's
  `direction` / `speed` / `gap`, or any other config-only field)
- **THEN** no keyframe glyph renders next to it

#### Scenario: A gradient fill, text colour, or background shows no diamond on either panel

- **WHEN** an element's fill, text colour, or background is a gradient (which
  cannot interpolate)
- **THEN** no keyframe diamond renders for it in the right inspector or the
  timeline-left inspector; WHEN it is a solid colour THEN the diamond renders in
  both

### Requirement: The registry refactor preserves existing keyframe behaviour and authored scenes

The change SHALL NOT alter the keyframe data model, its evaluation, or any
authored scene's playout; it routes the existing keyframe-ability and presence
decisions through the registry and applies only the diamond corrections defined
above.

#### Scenario: Pre-existing scenes are unchanged

- **WHEN** a scene authored before this change is loaded, played, previewed, and
  exported
- **THEN** its behaviour is unchanged apart from the corrected diamond set

#### Scenario: Existing keyframe authoring and evaluation are unchanged

- **WHEN** keyframes are added, removed, evaluated, or multi-selected
- **THEN** behaviour is unchanged — keyframing, evaluation, the B-005/B-006/B-007
  read-path fixes, and the D-049/D-050 multi-select rules all still hold

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
