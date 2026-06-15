# designer-box-styling Specification

## Purpose

TBD - created by archiving change box-props-all-elements. Update Purpose after archive.

## Requirements

### Requirement: Background-capable elements expose stroke and border radius

The five background-capable kinds (shape, text, ticker, clock, sequence) SHALL each
expose a stroke section (colour / width / dash) and a border-radius control in the
inspector, grouped under the same section headers the single-element inspector
uses, and these box properties SHALL appear in all three property surfaces (right
inspector, timeline-left, multi-select editor) via the central field registry.
Repeater (which has no background) SHALL expose none of them.

#### Scenario: The five background-capable kinds expose stroke + border radius

- **WHEN** a shape, text, ticker, clock, or sequence element is inspected
- **THEN** it exposes a stroke section (colour / width / dash) and a border-radius
  control, grouped as in the single-element inspector

#### Scenario: Repeater exposes no box styling

- **WHEN** a repeater element is inspected
- **THEN** it exposes neither a stroke section nor a border-radius control (it has
  no background)

#### Scenario: Box properties appear in the timeline-left and multi-select via the registry

- **WHEN** the timeline-left inspector or the multi-select editor is shown for a
  background-capable kind
- **THEN** the stroke and border-radius box properties appear there too (registry-
  driven), and a multi-selection shows a box-property diamond only when every
  selected kind has that property

### Requirement: Per-corner border radius with a per-element toggle

The border-radius control SHALL support a per-element toggle between a single
uniform value and four independent corners, represented by the stored value shape
itself — a `number` is uniform and a `[tl, tr, br, bl]` tuple is per-corner — so
no separate flag is needed and the state persists on the element. In per-corner
mode the right inspector SHALL show four inputs side-by-side and the timeline-left
SHALL show four stacked rows, both in top-left / top-right / bottom-right /
bottom-left order; toggling back to uniform SHALL collapse to a single value.

#### Scenario: Toggling to per-corner shows four independently-editable corners

- **WHEN** the operator toggles a border-radius control to per-corner
- **THEN** it shows four inputs (right inspector side-by-side; timeline-left four
  stacked rows) in tl/tr/br/bl order, each corner independently editable; toggling
  back to uniform collapses to one value

#### Scenario: The toggle state is per-element and persists

- **WHEN** the per-corner toggle is set on one element
- **THEN** it is per-element (another element can stay uniform at the same time)
  and persists on that element (it is the stored value shape)

### Requirement: The runtime renders static stroke and per-corner radius for every background-capable kind

The runtime SHALL render a static border from `stroke` and a four-value
`border-radius` from a per-corner `cornerRadius` tuple for every background-capable
kind, identically in preview and export — not a broken single value.

#### Scenario: A per-corner radius renders four corners on any background-capable kind

- **WHEN** a per-corner (tuple) cornerRadius is set on shape, text, ticker, clock,
  or sequence
- **THEN** the runtime emits the four-value `border-radius` (not a broken single
  value), and preview matches export

#### Scenario: A static stroke renders on the non-shape kinds

- **WHEN** a static stroke is set on text, ticker, clock, or sequence
- **THEN** the runtime renders the border (mirroring shape) in both preview and
  export

### Requirement: Per-corner border radius is keyframe-able via per-corner sub-tracks

Per-corner border radius SHALL be keyframe-able on all five background-capable
kinds via four sub-tracks (`cornerRadius.tl/tr/br/bl`) recomposed into the
`border-radius` each frame; this also fixes the previously-broken animated-tuple
case for shapes. A uniform (single-value) cornerRadius animation SHALL keep
working unchanged.

#### Scenario: A keyframed corner animates on any background-capable kind

- **WHEN** a corner radius is keyframed on shape, text, ticker, clock, or sequence
- **THEN** it animates correctly via the per-corner sub-tracks recomposed each
  frame, including the shape per-corner case that was previously broken

### Requirement: Toggling between uniform and per-corner migrates keyframes

Toggling a border-radius control between uniform and per-corner SHALL migrate the value and its keyframes between the uniform `cornerRadius` track and the four per-corner sub-tracks (`cornerRadius.tl/tr/br/bl`) in ONE undo step, never silently dropping a live keyframe, and SHALL leave no orphaned track that drives the runtime into a different mode than the inspector. uniform→per-corner copies the uniform value and keyframes into all four corners (lossless) and clears the uniform track; per-corner→uniform keeps the value and keyframes when all four corners are identical, otherwise takes the top-left corner as the representative and drops the other three.

#### Scenario: Uniform to per-corner copies the value and keyframes into all four corners

- **WHEN** the operator toggles a uniform border-radius (with one or more keyframes) to per-corner
- **THEN** all four sub-tracks (`cornerRadius.tl/tr/br/bl`) receive an equal-by-value copy of the uniform keyframes (same frame / value / easing / bezier) with distinct ids, the static value becomes the four-corner spread `[u,u,u,u]`, and the uniform `cornerRadius` track is cleared (nothing orphaned)

#### Scenario: Uniform to per-corner with no keyframes just spreads the static value

- **WHEN** the operator toggles a uniform border-radius that has NO keyframes to per-corner
- **THEN** the static value becomes `[u,u,u,u]` and no keyframe tracks are created (today's behavior is preserved)

#### Scenario: Per-corner to uniform keeps the value and keyframes when all four corners are identical

- **WHEN** the operator collapses a per-corner radius to uniform and all four corners are identical (equal static entries AND equal sub-tracks by value)
- **THEN** the shared value and keyframes are migrated onto the single `cornerRadius` track and the four sub-tracks are removed (no loss)

#### Scenario: Per-corner to uniform takes the top-left representative when corners differ

- **WHEN** the operator collapses a per-corner radius to uniform and the corners differ
- **THEN** the static value becomes the top-left value and the `cornerRadius.tl` keyframes migrate onto the single `cornerRadius` track, while the `tr/br/bl` corners are dropped (approved lossiness — discarded even if top-left has no keyframes)

#### Scenario: Either toggle is a single undo that restores the prior value and tracks

- **WHEN** the operator toggles in either direction and then presses undo once
- **THEN** the pre-toggle value SHAPE and its keyframe tracks are fully restored in ONE step (no orphaned still-applied tracks — the B-014 class), and a keyframe selection that referenced a dropped track is cleared rather than left dangling

#### Scenario: After either toggle the runtime mode matches the inspector

- **WHEN** either toggle completes
- **THEN** the runtime's track-presence mode (per-corner iff any `cornerRadius.tl/tr/br/bl` track exists, else uniform) matches the inspector's value-shape mode (per-corner iff the stored value is a tuple) — no orphaned track drives the wrong mode

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
