# designer-box-styling

## RENAMED Requirements

- FROM: `### Requirement: Stroke animation stays shape-only`
- TO: `### Requirement: Stroke animation for shapes and time-driven kinds`

## MODIFIED Requirements

### Requirement: Stroke animation for shapes and time-driven kinds

Stroke SHALL be keyframe-able for shapes AND for the time-driven kinds (ticker, clock, sequence) — when a `stroke.*` track is present the runtime SHALL recompose the animated `border` on the element's root node (the band / box / stage where the static stroke already renders). Shape stroke animation SHALL be unchanged, and the un-gating SHALL be additive (the shape path is never removed). On text the stroke section SHALL remain static (no keyframe diamond) — text is not a time-driven kind and is out of D-052 scope.

#### Scenario: Shape stroke still animates

- **WHEN** stroke is keyframed on a shape
- **THEN** it animates exactly as before this change (unchanged)

#### Scenario: Stroke animates on the time-driven kinds

- **WHEN** stroke (colour / width / dash) is keyframed on a ticker, clock, or sequence
- **THEN** the runtime recomposes the animated `border` on the element's band / box / stage root at playout, the same node its static stroke renders on

#### Scenario: Text stroke stays static

- **WHEN** a text element exposes its stroke section
- **THEN** the stroke fields show NO keyframe diamond (text stroke remains static — out of D-052 scope)
