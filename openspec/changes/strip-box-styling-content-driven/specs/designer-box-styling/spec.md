# designer-box-styling

## RENAMED Requirements

- FROM: `### Requirement: Stroke animation for shapes and time-driven kinds`
- TO: `### Requirement: Stroke animation is shape-only`

## MODIFIED Requirements

### Requirement: Background-capable elements expose stroke and border radius

The background-capable kinds — **shape and text** — SHALL each expose a stroke section (colour / width / dash) and a border-radius control in the inspector, grouped under the same section headers the single-element inspector uses, and these box properties SHALL appear in all three property surfaces (right inspector, timeline-left, multi-select editor) via the central field registry. The content-driven kinds (ticker, clock, sequence) and repeater SHALL expose NONE of them (D-056 — they carry only their text; box styling belongs on a separate shape layer beneath them).

#### Scenario: Shape and text expose stroke + border radius

- **WHEN** a shape or text element is inspected
- **THEN** it exposes a stroke section (colour / width / dash) and a border-radius control, grouped as in the single-element inspector

#### Scenario: Content-driven kinds and repeater expose no box styling

- **WHEN** a ticker, clock, sequence, or repeater element is inspected
- **THEN** it exposes neither a stroke section nor a border-radius control (nor background / box padding / box drop-shadow) — only text styling for the content-driven kinds

#### Scenario: Box properties appear in the timeline-left and multi-select via the registry

- **WHEN** the timeline-left inspector or the multi-select editor is shown for shape or text
- **THEN** the stroke and border-radius box properties appear there too (registry-driven), and a multi-selection shows a box-property diamond only when every selected kind has that property

### Requirement: Per-corner border radius with a per-element toggle

The border-radius control — on **shape and text** (the background-capable kinds) — SHALL support a per-element toggle between a single uniform value and four independent corners, represented by the stored value shape itself — a `number` is uniform and a `[tl, tr, br, bl]` tuple is per-corner — so no separate flag is needed and the state persists on the element. In per-corner mode the right inspector SHALL show four inputs side-by-side and the timeline-left SHALL show four stacked rows, both in top-left / top-right / bottom-right / bottom-left order; toggling back to uniform SHALL collapse to a single value. The content-driven kinds do not expose the control (D-056).

#### Scenario: Toggling to per-corner shows four independently-editable corners

- **WHEN** the operator toggles a border-radius control to per-corner (on a shape or text)
- **THEN** it shows four inputs (right inspector side-by-side; timeline-left four stacked rows) in tl/tr/br/bl order, each corner independently editable; toggling back to uniform collapses to one value

#### Scenario: The toggle state is per-element and persists

- **WHEN** the per-corner toggle is set on one element
- **THEN** it is per-element (another element can stay uniform at the same time) and persists on that element (it is the stored value shape)

### Requirement: The runtime renders static stroke and per-corner radius for shape and text

The runtime SHALL render a static border from `stroke` and a four-value `border-radius` from a per-corner `cornerRadius` tuple for **shape and text**, identically in preview and export — not a broken single value. For the content-driven kinds (ticker, clock, sequence) the runtime SHALL NOT paint background, stroke, border-radius, or box padding (D-056).

#### Scenario: A per-corner radius renders four corners on shape and text

- **WHEN** a per-corner (tuple) cornerRadius is set on a shape or text element
- **THEN** the runtime emits the four-value `border-radius` (not a broken single value), and preview matches export

#### Scenario: A static stroke renders on text

- **WHEN** a static stroke is set on a text element
- **THEN** the runtime renders the border (mirroring shape) in both preview and export

#### Scenario: The content-driven kinds paint no box styling

- **WHEN** a ticker, clock, or sequence is rendered (canvas / preview / export)
- **THEN** the runtime paints no background, stroke, border-radius, or box padding for it — only its text, text colour (incl. gradient), and text-shadow

### Requirement: Per-corner border radius is keyframe-able via per-corner sub-tracks

Per-corner border radius SHALL be keyframe-able on **shape and text** via four sub-tracks (`cornerRadius.tl/tr/br/bl`) recomposed into the `border-radius` each frame; this also fixes the previously-broken animated-tuple case for shapes. A uniform (single-value) cornerRadius animation SHALL keep working unchanged. The content-driven kinds SHALL NOT keyframe cornerRadius (D-056).

#### Scenario: A keyframed corner animates on shape and text

- **WHEN** a corner radius is keyframed on a shape or text element
- **THEN** it animates correctly via the per-corner sub-tracks recomposed each frame, including the shape per-corner case that was previously broken

### Requirement: Stroke animation is shape-only

Stroke SHALL be keyframe-able for **shapes only**. On text, ticker, clock, and sequence the stroke is NOT keyframe-able: text keeps a static stroke section (no diamond), and the content-driven kinds expose no stroke section at all (D-056). Shape stroke animation SHALL be unchanged.

#### Scenario: Shape stroke still animates

- **WHEN** stroke is keyframed on a shape
- **THEN** it animates exactly as before (unchanged)

#### Scenario: Text stroke stays static; content-driven kinds have no stroke

- **WHEN** a text element exposes its stroke section, or a ticker/clock/sequence is inspected
- **THEN** text shows a static stroke section with no keyframe diamond, and ticker/clock/sequence show no stroke section at all (D-056)
