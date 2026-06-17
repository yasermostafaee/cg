# Extended box-shadow — spread (keyframable) + inset toggle (D-043)

## Why

The box-shadow today renders only `offsetX / offsetY / blur / color` — it is missing
the CSS box-shadow's `spread` radius (4th length) and the `inset` keyword. Recon
confirmed a single static composer (`composeBoxShadow` in `scene-builder.ts`) feeds BOTH
the text box (`buildText`) and the shape (`buildShape`), and the box-shadow source field
is `el.shadow` for BOTH kinds (text's glyph shadow is the separate `el.textShadow`). So
one composer change + the two animated box-shadow paths cover the whole feature. The
text-shadow section shipped in D-057 and is out of scope — CSS `text-shadow` /
`drop-shadow` have neither spread nor inset.

## What Changes (additive — no migration)

- **Schema:** add `spread: z.number().optional()` and `inset: z.boolean().optional()` to
  `ShadowSchema` (the SHARED shadow type that backs `textShadow` + the box `shadow`).
  Read-time defaults: spread → 0, inset → false. Add `shadow.spread` and
  `boxShadow.spread` to `AnimatablePropertySchema`. `inset` is NOT animatable and is added
  nowhere in `animation.ts`. All additive ⇒ old scenes load/render unchanged.
- **Render (box-shadow ONLY):** `composeBoxShadow(s)` emits
  `${inset? 'inset '}…px …px …px ${spread}px ${color}` — fixing BOTH the text box and the
  shape in one place. The animated paths recompose with the spread track + the static
  inset: shape's `applyShadow` (box branch) reads `shadow.spread` + `src.shadow?.inset`;
  text's `applyBoxShadow` reads `boxShadow.spread` + `staticShadow?.inset`. `shadow.spread`
  joins `SHADOW_PROPS`, `boxShadow.spread` joins `BOX_SHADOW_PROPS`.
- **Untouched render:** `shadowCss`, `dropShadowFilter`, the text-shadow / drop-shadow
  branches of `applyShadow`, `applyTimeDrivenHostStyle`, and `timeDrivenGlyphDrop` —
  text-shadow and drop-shadow take NO spread/inset (the shared field is structurally
  present on `textShadow` but ignored on every glyph-shadow path).
- **Inspector — spread (keyframable):** the registry gets a `Spread` numeric descriptor —
  `shadow.spread` on the shape "Box Shadow" set, `boxShadow.spread` on the text
  `BOX_SHADOW_DESCS`. `SHADOW_DESCS` (Text Shadow) and the time-driven arrays are NOT
  touched. `StyleSection` renders a `Spread` row (like Blur) in the two "Box Shadow"
  sections.
- **Inspector — inset (NOT keyframable):** `inset` is a boolean and not an
  `AnimatableProperty`, so it CANNOT be a registry descriptor (the registry is
  `AnimatableProperty` + number/color/fill only). It is rendered ONLY in `StyleSection` as
  an Outset/Inset toggle (the per-corner-radius-toggle pattern) inside the two "Box Shadow"
  sections, writing `el.shadow.inset` via `updateElement`. No diamond, static-only.
- **Multi-select:** `spread` flows through the registry automatically (a shared-editable
  number). `inset` is single-select-only — the shared-property model is number/color/fill
  only; no `boolean` kind is added (matches the per-corner-radius toggle, also
  single-select-only today).

## Capabilities

### Modified Capabilities

- `designer-box-styling`: a new requirement — the box-shadow (shape + text) gains a
  keyframable `spread` radius and a non-keyframable `inset` toggle; the text-shadow and the
  gradient-text glyph drop-shadow carry neither; additive defaults (spread 0, inset false)
  keep pre-change scenes identical.
- `designer-inspector-registry`: the "A keyframe diamond renders exactly when the property
  is keyframe-able" requirement — the box-shadow `spread` sub-property (`shadow.spread` for
  shape, `boxShadow.spread` for text) is keyframe-able (diamond); the `inset` toggle is a
  static boolean with no diamond.

## Impact

- **Schema:** `primitives.ts` (`ShadowSchema` spread + inset), `animation.ts`
  (`shadow.spread`, `boxShadow.spread`). No `.vcg`/GDD break (additive optional).
- **Runtime:** `scene-builder.ts` (`composeBoxShadow`), `animation-applier.ts`
  (`applyShadow` box branch, `applyBoxShadow`, `SHADOW_PROPS`, `BOX_SHADOW_PROPS`).
- **Designer:** `field-registry.ts` (spread descriptors), `StyleSection.tsx` (Spread row +
  Inset toggle in the two Box Shadow sections).
- **Tests:** schema round-trip + pre-D-043 default; scene-builder + applier spread/inset;
  text-shadow / drop-shadow snapshot unchanged; registry spread present/absent + inset not
  Animatable; StyleSection inset toggle; E2E.
- **Docs:** the two specs + the `composeBoxShadow` / applier docstrings.

## Out of scope

Text-shadow / drop-shadow (D-057 — no spread/inset). A `boolean` multi-select field kind
(inset stays single-select-only). Any rename of `shadow.*` / `boxShadow.*`.
