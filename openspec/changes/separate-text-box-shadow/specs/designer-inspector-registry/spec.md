# designer-inspector-registry

## MODIFIED Requirements

### Requirement: A keyframe diamond renders exactly when the property is keyframe-able

The Designer SHALL render a keyframe diamond for a property IF AND ONLY IF the registry marks that property keyframe-able for the selected element's kind and instance; a non-keyframe-able control SHALL render no keyframe glyph at all (no disabled placeholder diamond).

#### Scenario: Keyframe-able style properties show a diamond in both panels

- **WHEN** a shape or text element exposes border-radius, drop-shadow / text-shadow sub-properties (`shadow.*`), box-padding, or — text only (D-057) — box-shadow sub-properties (`boxShadow.*`)
- **THEN** each is keyframe-able and shows a diamond in both the right inspector and the timeline-left inspector

#### Scenario: A text element's text-shadow and box-shadow are separately keyframe-able

- **WHEN** a text element is inspected
- **THEN** its "Text Shadow" sub-properties (`shadow.*`) AND its "Box Shadow" sub-properties (`boxShadow.*`) each show their own keyframe diamonds, independently; shape exposes only its box shadow (`shadow.*`) and the content-driven kinds only their text-shadow (`shadow.*`)

#### Scenario: Discrete clock settings have no diamond

- **WHEN** a clock's `digits` or `mode` is shown
- **THEN** it has no keyframe diamond (discrete settings, not animatable)

#### Scenario: Font family, weight, and alignments never show a diamond

- **WHEN** font-family, font-weight, or any alignment (horizontal or vertical) is shown on any element
- **THEN** it has no keyframe diamond

#### Scenario: Non-animatable controls render no placeholder diamond

- **WHEN** a non-keyframe-able control is shown (an image's `fit`, a ticker's `direction` / `speed` / `gap`, or any other config-only field)
- **THEN** no keyframe glyph renders next to it

#### Scenario: A gradient fill, text colour, or background shows no diamond on either panel

- **WHEN** an element's fill, text colour, or background is a gradient (which cannot interpolate)
- **THEN** no keyframe diamond renders for it in the right inspector or the timeline-left inspector; WHEN it is a solid colour THEN the diamond renders in both
