# Render gradient text with independent background and correct shadow layering (B-016, B-017)

## Why

Two related rendering bugs share one root — the gradient-text technique
(`background: <gradient>` + `background-clip: text` + `color: transparent`) living on
the SAME node that carries the box background and the text-shadow. Both reproduce for
**linear AND radial** gradients (both use `background-clip: text`).

- **B-016 (text only):** the gradient text fill sets `el.style.background`, which
  overwrites the box background's `background`/`backgroundColor` on the same node, and
  `background-clip: text` clips what remains to the glyphs — so the box shows no
  background.
- **B-017 (text + clock + sequence):** with gradient text, a `text-shadow` paints OVER
  the glyphs. In CSS paint order within one element the background layer (the clipped
  gradient — the visible "ink") sits BELOW `text-shadow`, so the shadow covers the
  gradient. With a SOLID colour the visible ink is the glyph layer (above the shadow), so
  the shadow correctly sits behind. Confirmed PRE-EXISTING (not a D-057 regression — the
  `textShadow` paint dates to the original runtime; D-057 only added the box-shadow).
  `box-shadow` and shape shadow are correct and stay correct.

## What Changes (gradient-only — the solid path is untouched)

- **Text (B-016 + B-017):** when the text colour is a **gradient**, render the gradient
  on a dedicated **content-sized inner node** (`data-cg-text`) that carries
  `background: <gradient>` + `background-clip: text` + `color: transparent` + the glyph
  shadow as `filter: drop-shadow(...)`. The box (background, border, radius, padding,
  box-shadow), layout, transform, `element.filter`, `data-cg-element-id`, and the
  `elementMap` registration STAY on the outer element. The inner node is **content-sized**
  (`max-width: 100%`, auto width; the host flexes to position it) so the gradient maps to
  the TEXT, not the box width (changing the box width can't shift which stop falls on a
  glyph). A **solid** text colour renders exactly as today (outer node, `color` +
  `text-shadow`) — no inner node.
- **Clock + sequence (B-017 + B-016 width):** no box background, so no box/gradient
  collision — but the gradient still must map to the text. The gradient + clip + transparent
  colour go on their already content-sized **time span** / **item nodes**, and the glyph
  shadow is rendered as `filter: drop-shadow(...)` composed onto the host's `filter` (which
  already carries `element.filter`, and which the animation applier writes — a filter there
  shadows the composited gradient text). A solid colour keeps `text-shadow` on the host.
- **Ripple (the inner text node):** for the gradient text case the text/placeholder
  binding, the dynamic colour binding + animated colour track, and the animated
  text-shadow now target the inner node instead of the outer one. A shared resolver
  (`textRenderNode`, keyed off the `data-cg-text` marker) keeps build, bindings, and the
  animation applier in agreement — including across a solid↔gradient switch (the inner
  node is created/removed and every writer follows it).

## Capabilities

### Modified Capabilities

- `designer-box-styling`: a new requirement — gradient text colour renders independently
  of the box background (B-016) and a glyph shadow sits BEHIND gradient text (B-017),
  for text via a dedicated inner node and for clock/sequence via a composed
  `drop-shadow`; the solid path is unchanged. (designer-box-styling already owns box
  styling + D-057's two text shadows, so this requirement lives there.)

## Impact

- **Runtime:** `scene-builder.ts` (`buildText` inner-node gradient path; `buildClock` /
  `buildSequence` gradient drop-shadow), `animation-applier.ts` (`applyShadow` /
  `applyFilter` gradient routing; `text.color` routing), `bindings.ts` (text / placeholder
  / colour → inner node), new `text-render-node.ts` (the shared resolver + `data-cg-text`
  marker).
- **No schema change** — uses existing `colorFill` / `textShadow` / `filter`. No
  `.vcg`/GDD break.
- **Tests:** scene-builder (B-016 + B-017 for linear AND radial; solid unchanged),
  animation-applier (animated shadow over gradient → drop-shadow; solid → text-shadow;
  box-shadow path unchanged), the solid↔gradient switch, and E2E.
- **Docs:** the designer-box-styling spec + the scene-builder / applier / bindings
  docstrings (text/colour/shadow targets are now node-dependent for the gradient case).

## Out of scope

The solid text path (unchanged). The box-shadow (text) and shape shadow (correct today).
Any schema change. The content-driven kinds' box styling (still none, D-056).
