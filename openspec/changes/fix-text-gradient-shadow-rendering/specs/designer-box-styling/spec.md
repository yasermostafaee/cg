# designer-box-styling Specification

## ADDED Requirements

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
