# designer-inspector-registry

## MODIFIED Requirements

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
