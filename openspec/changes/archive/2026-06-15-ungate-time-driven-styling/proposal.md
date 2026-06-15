# Keyframe-able styling for time-driven elements (D-052)

## Why

ticker / clock / sequence already carry — and statically render — `stroke`,
`color`, `backgroundColor`/`backgroundFill`, `textShadow`, `padding`, and
`cornerRadius` (they `.merge(BoxStyleSchema)` and declare the rest). D-042 made
`cornerRadius` keyframe-able on them but left the other styles animation-gated in
two layers: the inspector field-registry doesn't expose them as keyframe-able, and
the runtime appliers type-gate `text.color` / `backgroundColor` to `text`, stroke
to `shape`, and shadow to shape/text. So an author can set these styles but cannot
animate them on the time-driven kinds. D-052 opens that animation gate — mirroring
the `cornerRadius` precedent — without touching the static render or the content
motion (crawl / tick / paging).

## What Changes

Un-gate (ADDITIVELY — shape/text paths unchanged) animation of the existing styles
for ticker / clock / sequence:

| property                      | ticker      | clock | sequence |
| ----------------------------- | ----------- | ----- | -------- |
| stroke (color/width/dash)     | ✅          | ✅    | ✅       |
| text colour (`color`)         | ✅          | ✅    | ✅       |
| backgroundColor (solid only)  | ✅          | ✅    | ✅       |
| shadow (offsetX/Y/blur/color) | ✅          | ✅    | ✅       |
| padding (4 sides)             | ⏸️ deferred | ✅    | ✅       |

- **Registry** (`field-registry.ts`): make these properties keyframe-able for the
  three kinds — read `el.color` / `el.backgroundColor` / `el.textShadow` /
  `el.padding`; `backgroundColor`'s diamond appears only when the solid variant is
  set (no diamond on a gradient `backgroundFill`/`colorFill`), mirroring the
  `fill.color` / `text.color` solid-only rule. Ticker `padding` is NOT added.
- **Appliers** (`animation-applier.ts`): additively allow the three kinds in
  `text.color`, `backgroundColor`, `applyStroke`; teach `applyShadow` to resolve
  `el.textShadow` and write `text-shadow` (not `box-shadow`) for them; enable
  `padding` for clock + sequence only. `cornerRadius` stays ungated (D-042).
- **Out of scope:** ticker `padding` (its inner-viewport padding feeds the driver's
  `viewportWidth` — animating it would desync the crawl; deferred as a follow-up).
  TEXT stroke stays static (text is not a time-driven kind; unchanged). No schema
  change — every field already exists.

## Capabilities

### Modified Capabilities

- `designer-inspector-registry`: the "Keyframe-able styling for time-driven elements
  is deferred" requirement is carved out — stroke, text colour, backgroundColor
  (solid), shadow, and (clock+sequence) padding are now keyframe-able for the
  time-driven kinds; only ticker padding stays deferred. (RENAMED to drop the
  now-inaccurate "is deferred".)
- `designer-box-styling`: the "Stroke animation stays shape-only" requirement now
  allows stroke animation on ticker / clock / sequence too (additive; shape
  unchanged, text stroke stays static).

## Impact

- **Designer:** `features/inspector/field-registry.ts` (descriptors +
  keyframeable predicates for the three kinds).
- **Runtime:** `@cg/template-runtime/animation-applier.ts` (additive un-gates +
  the `applyShadow` text-shadow branch). No schema change.
- **Tests:** `animation-applier.test.ts` (per-type recomposition; shape/text
  no-regression; gradient no-diamond; ticker padding not applied), an E2E in
  `box-props.spec.ts` (diamonds on a time-driven kind), registry unit assertions.
- **Docs:** the two living specs above + the registry/applier docstrings that say
  these styles are shape/text-only or deferred.
