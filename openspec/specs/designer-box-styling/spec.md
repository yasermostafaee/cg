# designer-box-styling Specification

## Purpose

TBD - created by archiving change box-props-all-elements. Update Purpose after archive.

## Requirements

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

### Requirement: Per-corner border radius is keyframe-able via per-corner sub-tracks

Per-corner border radius SHALL be keyframe-able on **shape and text** via four sub-tracks (`cornerRadius.tl/tr/br/bl`) recomposed into the `border-radius` each frame; this also fixes the previously-broken animated-tuple case for shapes. A uniform (single-value) cornerRadius animation SHALL keep working unchanged. The content-driven kinds SHALL NOT keyframe cornerRadius (D-056).

#### Scenario: A keyframed corner animates on shape and text

- **WHEN** a corner radius is keyframed on a shape or text element
- **THEN** it animates correctly via the per-corner sub-tracks recomposed each frame, including the shape per-corner case that was previously broken

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

### Requirement: Stroke animation is shape-only

Stroke SHALL be keyframe-able for **shapes only**. On text, ticker, clock, and sequence the stroke is NOT keyframe-able: text keeps a static stroke section (no diamond), and the content-driven kinds expose no stroke section at all (D-056). Shape stroke animation SHALL be unchanged.

#### Scenario: Shape stroke still animates

- **WHEN** stroke is keyframed on a shape
- **THEN** it animates exactly as before (unchanged)

#### Scenario: Text stroke stays static; content-driven kinds have no stroke

- **WHEN** a text element exposes its stroke section, or a ticker/clock/sequence is inspected
- **THEN** text shows a static stroke section with no keyframe diamond, and ticker/clock/sequence show no stroke section at all (D-056)

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

### Requirement: The text element has independent text-shadow and box-shadow

The text element SHALL expose TWO independent shadows: a **text-shadow** on the glyphs (the `textShadow` field, animated by the `shadow.*` keys) and a **box-shadow** on the box (the `shadow` field, animated by the distinct `boxShadow.*` keys). The runtime SHALL render BOTH for text — `text-shadow` from `textShadow` and `box-shadow` from `shadow` — in preview and export, and the two SHALL be settable and keyframe-able INDEPENDENTLY (a text-shadow keyframe never moves the box-shadow and vice-versa). The text `shadow` field SHALL be optional and additive (scenes without it are unchanged). The shape element's box shadow SHALL be unchanged in behavior — its inspector section is relabeled "Box Shadow" (it already renders `box-shadow` from `shadow` via the `shadow.*` keys). The content-driven kinds (ticker, clock, sequence) SHALL be unaffected — they keep only their text-shadow.

#### Scenario: A text element renders both shadows independently

- **WHEN** a text element has both a `textShadow` and a box `shadow` set
- **THEN** the runtime renders `text-shadow` on the glyphs (from `textShadow`) AND `box-shadow` on the box (from `shadow`), independently, identically in preview and export

#### Scenario: The two text shadows keyframe independently

- **WHEN** a text element keyframes its text-shadow (on `shadow.*`) AND its box-shadow (on `boxShadow.*`)
- **THEN** at a given frame each animates to its own value — the text-shadow and box-shadow are driven by separate track sets and never collide

#### Scenario: The text inspector shows two shadow sections

- **WHEN** a text element is inspected
- **THEN** it shows a "Text Shadow" section (the renamed former "Drop Shadow", wired to `textShadow`) AND a "Box Shadow" section (wired to the box `shadow`)

#### Scenario: The shape shadow section is relabeled with no behavior change

- **WHEN** a shape element is inspected
- **THEN** its shadow section is titled "Box Shadow" (formerly "Drop Shadow") and behaves exactly as before — the same `shadow` field, the same `shadow.*` keys, the same `box-shadow` render

#### Scenario: Old text scenes load unchanged

- **WHEN** a text scene authored before this change (no box `shadow`) is loaded, played, and exported
- **THEN** it behaves exactly as before — only the new optional box shadow is added; the existing text-shadow is untouched

### Requirement: Gradient text renders independently of the box background and shadows correctly

Gradient text (linear OR radial, both via `background-clip: text` + `color: transparent`) SHALL render independently of the box background without clipping it away [B-016], SHALL map the gradient to the TEXT extent (a content-sized node) rather than the box width [B-016], and a glyph shadow over gradient text SHALL sit BEHIND the gradient, not over it [B-017]. For a **text** element the gradient + clip + the glyph shadow (rendered
as `filter: drop-shadow(...)`) live on a dedicated, content-sized inner node while the
box background / border / radius / padding / box-shadow stay on the outer element; for
**clock and sequence** (no box background) the gradient + clip go on their content-sized
time span / item nodes and the glyph shadow is rendered as `filter: drop-shadow(...)`
composed onto the host's filter. A **solid** text colour SHALL render exactly as before —
on the outer node, with the glyph shadow as `text-shadow`. The behavior SHALL be identical
in preview and export, and `box-shadow` (text) and shape shadow SHALL be unchanged.

#### Scenario: A gradient text colour and a box background render independently

- **WHEN** a text element has both a box background (colour or fill) AND a gradient text
  colour (linear or radial)
- **THEN** the box background renders on the outer element (not clipped away) while the
  gradient text fill renders on the dedicated inner node — both visible at once

#### Scenario: The gradient maps to the text, not the box width

- **WHEN** a text (or clock / sequence) element is wider than its text and has a gradient
  text colour (linear or radial)
- **THEN** the gradient is painted on a content-sized node (the inner text node / clock
  span / sequence item), so it maps to the text's extent — changing the box width does not
  change which gradient stop falls on a glyph

#### Scenario: A glyph shadow sits behind gradient text on a text element

- **WHEN** a text element has a gradient text colour (linear or radial) AND a Text Shadow
- **THEN** the glyph shadow renders as `filter: drop-shadow(...)` on the inner gradient
  node (behind the gradient glyphs), the outer box is unaffected, and the gradient is fully
  visible — not covered by the shadow

#### Scenario: A glyph shadow sits behind gradient text on clock and sequence

- **WHEN** a clock or sequence element has a gradient text colour (linear or radial) AND a
  Text Shadow
- **THEN** the glyph shadow renders as `filter: drop-shadow(...)` composed onto the host's
  filter (preserving any `element.filter`), sitting behind the gradient glyphs

#### Scenario: Solid text colour is unchanged

- **WHEN** a text, clock, or sequence element has a SOLID text colour and a Text Shadow
- **THEN** it renders exactly as before — the colour and `text-shadow` on the outer node,
  with no inner gradient node and no `drop-shadow`

#### Scenario: Switching a text colour between solid and gradient keeps writes on the right node

- **WHEN** a text element's colour is switched between solid and gradient (the inner
  gradient node is created or removed) and then its text, colour, or shadow is updated
  (binding or keyframe)
- **THEN** the update lands on the correct current node — the inner node while gradient,
  the outer node while solid — never on a removed/stale node
