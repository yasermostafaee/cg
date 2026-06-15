# Design — ungate-time-driven-styling (D-052)

## Context

The styles already exist and render statically on ticker/clock/sequence
(`scene-builder` `buildTicker`/`buildClock`/`buildSequence`). The gate is
animation-only, in two layers:

1. **Registry** (`field-registry.ts`): `FIELD_REGISTRY[ticker|clock|sequence] =
[...TRANSFORM, ...BOX_DESCS, ...FILTER]`. `BOX_DESCS` = stroke (keyframeable only
   for shape) + radius. `text.color` / `backgroundColor` / `shadow.*` / `padding.*`
   live only in `TEXT_SPECIFIC` / `SHAPE_SHADOW`, so they aren't on the three kinds.
2. **Appliers** (`animation-applier.ts`): `text.color` and `backgroundColor` gated to
   `type === 'text'`; `applyStroke` early-returns unless `type === 'shape'`;
   `applyShadow` resolves the static shadow only from `shape.shadow`/`text.textShadow`
   and writes `box-shadow` for non-text. `cornerRadius` is already ungated (D-042).

`entry.node` for these kinds is the band / box / stage root — the same node the
static stroke/background/cornerRadius render on; `color` inherits to items/digits.

## Decision — mirror the cornerRadius precedent

### Registry

Add a shared "time-driven styling" descriptor set used by ticker/clock/sequence,
declared once and read off the element's own fields (the static lives in `el.color`,
`el.backgroundColor`, `el.textShadow`, `el.padding`, NOT a `text` object):

- `text.color` — read `el.color`; keyframeable for shape/text (today) PLUS
  ticker/clock/sequence; for clock/sequence gate on solid `colorFill`
  (`colorFill === undefined || colorFill.kind === 'solid'`), mirroring text.
- `backgroundColor` — read `el.backgroundColor`; keyframeable when
  `backgroundFill === undefined` (solid only) for text + the three kinds.
- `shadow.*` — extend the existing `shadowDesc.read` to also read the time-driven
  kinds' `textShadow`; keyframeable for shape/text PLUS the three kinds.
- `stroke.*` — change the keyframeable predicate from `type === 'shape'` to
  `shape || ticker || clock || sequence` (text stays excluded).
- `padding.*` — add for clock + sequence (read `el.padding?.[side]`); NOT ticker.

The simplest shape that keeps shape/text untouched: broaden the `keyframeable`
predicates on the existing descriptors and include the relevant descriptors in the
ticker/clock/sequence registry arrays. Helper predicate
`isTimeDriven(el)` = `el.type` ∈ {ticker, clock, sequence}.

### Appliers (additive — never remove the shape/text branch)

- `text.color` (L70): `type === 'text' || isTimeDriven` → write `node.style.color`.
- `backgroundColor` (L75): `type === 'text' || isTimeDriven` → `node.style.backgroundColor`.
- `applyStroke` (L222): early-return guard becomes `if (!(shape || isTimeDriven)) return;`
  reading `src.stroke` (present on all via BoxStyle). Border on `entry.node` (root).
- `applyShadow`: `staticShadow` resolves `shape.shadow` ?? `text.textShadow` ??
  (time-driven) `el.textShadow`; write target = `text-shadow` for text AND the three
  kinds (they are text shadows), `box-shadow` only for shape.
- padding: `applyNumeric` already writes `paddingTop/...`; it is not type-gated, so
  enabling padding is purely a REGISTRY change (clock/sequence get the descriptors;
  ticker does not, so no track is ever authored). No applier change for padding.
- `cornerRadius`: untouched.

### Why ticker padding is excluded

Ticker padding is applied to an inner viewport div, not the band, and the value
feeds the driver's `viewportWidth` (crawl distance / seam / speed). Animating it
would desync the treadmill, so it is not made keyframe-able (no descriptor → no
track → applier never sees it). Filed as a deferred follow-up.

## Risks / guards

- Shape/text unchanged — every gate edit is an OR that ADDS the three kinds; tests
  assert shape stroke/colour/shadow and text colour/background/shadow still animate.
- Gradient fills can't interpolate — `backgroundColor`/`text.color` diamonds are
  suppressed when the gradient variant is set (predicate), asserted by a unit test.
- Ticker measurement untouched — no ticker padding track; the driver's
  `viewportWidth` path is not modified.
- Per-frame apply runs in `applyAnimationAtFrame` independent of playout phases; the
  recomposition reads static fallbacks so a partial track set is well-defined through
  intro/hold/outro.
