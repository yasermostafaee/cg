# designer-box-styling

## ADDED Requirements

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

### Requirement: Collapsing per-corner to uniform drops the extra corner tracks in one undo

The Designer SHALL remove the extra per-corner keyframe tracks
(`cornerRadius.tl/tr/br/bl`) in ONE undo step when the operator collapses a
per-corner radius back to uniform while those sub-tracks exist, leaving no
orphaned still-applied tracks.

#### Scenario: Collapsing to uniform removes the per-corner tracks as one undo

- **WHEN** the operator collapses a per-corner radius to uniform and per-corner
  keyframe tracks exist
- **THEN** the `tl/tr/br/bl` tracks are removed in ONE undo step (no orphaned
  still-applied tracks — the B-014 class), and one undo restores both the
  per-corner value and its tracks

### Requirement: Stroke animation stays shape-only

Stroke SHALL remain keyframe-able only for shapes; on text, ticker, clock, and
sequence the stroke section is static (no keyframe diamond), because animating
stroke on those kinds is deferred to D-052. Shape stroke animation SHALL be
unchanged.

#### Scenario: Shape stroke still animates; non-shape stroke is static

- **WHEN** stroke is keyframed on a shape
- **THEN** it animates as today (unchanged)

#### Scenario: Stroke animation is not offered on the time-driven kinds

- **WHEN** a ticker, clock, or sequence exposes its stroke section
- **THEN** the stroke fields show no keyframe diamond (static only — stroke
  animation on these kinds is deferred to D-052)
