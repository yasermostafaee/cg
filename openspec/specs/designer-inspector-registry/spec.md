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

### Requirement: Keyframe-able styling for time-driven elements is deferred

For ticker, clock, and sequence elements the registry SHALL expose as
keyframe-able the properties whose animated values the runtime already applies —
transform, opacity, filter, AND `cornerRadius` (including the per-corner sub-tracks
`cornerRadius.tl/tr/br/bl`, D-042). These three kinds additionally expose a stroke
section that is STATIC — present but non-keyframe-able. Their text, shadow,
padding, and background styling — and stroke ANIMATION — SHALL remain
non-keyframe-able pending the runtime work tracked separately as D-052, and the
registry SHALL be shaped so enabling each remaining deferred property is a single
per-property declaration. Repeater (which has no background) SHALL expose only
transform, opacity, and filter — no stroke or border-radius box styling.

#### Scenario: Time-driven elements keyframe transform/opacity/filter and cornerRadius; the rest is deferred

- **WHEN** a ticker, clock, or sequence is selected
- **THEN** its transform, opacity, filter, and `cornerRadius` (including the
  per-corner `tl/tr/br/bl` sub-tracks) properties show keyframe diamonds; its
  stroke section is present but shows NO diamond (static); and its text / shadow /
  padding / background fields show no diamond in either panel (deferred to D-052)

#### Scenario: Stroke animation is not carved out for the time-driven kinds

- **WHEN** a ticker, clock, or sequence exposes its (static) stroke section
- **THEN** the stroke colour / width / dash fields show no keyframe diamond —
  only `cornerRadius` keyframing is enabled for these kinds (D-042); stroke
  animation stays deferred to D-052

#### Scenario: Repeater exposes only transform/opacity/filter

- **WHEN** a repeater is selected
- **THEN** only its transform, opacity, and filter properties show keyframe
  diamonds; it exposes no stroke or border-radius box styling (it has no
  background)
