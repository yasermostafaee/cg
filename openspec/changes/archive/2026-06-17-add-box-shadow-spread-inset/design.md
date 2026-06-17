# Design — add-box-shadow-spread-inset (D-043)

## Context (verified in STEP 0)

1. `composeBoxShadow(s)` (`scene-builder.ts`) is the SOLE static box-shadow composer,
   used by BOTH `buildText` and `buildShape`. No other site builds a `box-shadow` string.
2. `el.shadow` is the box-shadow field for BOTH shape AND text (text's glyph shadow is the
   separate `el.textShadow`). Shape's box-shadow animates on `shadow.*` (`applyShadow` box
   branch reads `src.shadow`); text's box-shadow animates on `boxShadow.*` (`applyBoxShadow`
   reads `src.shadow`). So spread/inset read from `el.shadow` on both paths.
3. The inspector `PropertyDescriptor` model is `AnimatableProperty` + `number|color|fill`
   ONLY — it canNOT express a non-keyframable boolean. The established pattern for such a
   toggle (per-corner radius toggle, Text Wrap, Auto Squeeze) renders it DIRECTLY in the
   section component via `updateElement`, with NO registry entry. So `inset` lives only in
   `StyleSection`; `spread` (a keyframable number) lives in BOTH the registry and the
   section.

## Decision — additive, no migration; spread keyframable, inset static

- **Schema (shared field):** `ShadowSchema` gains `spread?: number` and `inset?: boolean`.
  The field is SHARED (backs `textShadow` + the box `shadow`); structurally allowing the
  two fields on `textShadow` is harmless because every text-shadow / drop-shadow path
  ignores them. Read-time defaults: `spread ?? 0`, `inset ?? false`. `AnimatablePropertySchema`
  gains `shadow.spread` (beside `shadow.offsetX/Y/blur`) and `boxShadow.spread` (beside
  `boxShadow.offsetX/Y/blur`). `inset` is added NOWHERE in `animation.ts` — it is not
  animatable.

- **Composer (one place fixes both kinds):**
  `composeBoxShadow(s) = ${s.inset ? 'inset ' : ''}${s.offsetX}px ${s.offsetY}px ${s.blur}px ${s.spread ?? 0}px ${s.color}`.
  Shape `box-shadow` (4 lengths) and text-box `box-shadow` both get the spread length + the
  optional `inset` prefix.

- **Animated box-shadow paths:**
  - Shape (`applyShadow`, box branch): `spread = readNumericTrack(tracks,'shadow.spread',frame) ?? src.shadow?.spread ?? 0`,
    `inset = src.shadow?.inset ?? false` (static — never a track). Compose with the
    inset-prefix + spread form. `shadow.spread` added to `SHADOW_PROPS` so animating spread
    triggers a recompose.
  - Text (`applyBoxShadow`): `spread = readNumericTrack(tracks,'boxShadow.spread',frame) ?? staticShadow?.spread ?? 0`,
    `inset = staticShadow?.inset ?? false`. Emit the inset-prefix + spread form.
    `boxShadow.spread` added to `BOX_SHADOW_PROPS`.

- **Untouched (no spread/inset leak):** `shadowCss` (the text-shadow / drop-shadow
  composer), `dropShadowFilter`, the text-shadow / drop-shadow branches of `applyShadow`,
  `applyTimeDrivenHostStyle`, `timeDrivenGlyphDrop`. CSS `text-shadow` and `drop-shadow`
  have no spread/inset; these paths never read the two fields.

- **Registry (spread only):** add a keyframable `Spread` numeric descriptor — `shadow.spread`
  on the shape "Box Shadow" set (`SHAPE_SHADOW`), `boxShadow.spread` on the text
  `BOX_SHADOW_DESCS` — placed after `blur`, before `color` (CSS length order). `shadowDesc`
  / `boxShadowDesc` `sub` unions gain `'spread'` (read `s?.spread ?? 0`). Shape's spread is
  `multiSelect: true` (parity with its other box-shadow channels); text's box-shadow set is
  not multi-exposed (unchanged). `SHADOW_DESCS` (Text Shadow) + `TIME_DRIVEN_STYLE` are NOT
  touched — the guard that keeps spread off text-shadow.

- **Inset toggle (StyleSection only):** `DropShadowSection` renders an Outset/Inset toggle
  (the `RadiusToggle` / `TogglePair` pattern) ONLY when it is a "Box Shadow" section (text:
  `keyPrefix='boxShadow'`/`staticField='shadow'`; shape: defaults). It writes
  `updateElement(id, { shadow: { ...shadow, inset } })`. No `KeyframeDot`. The `Spread` row
  renders like `Blur` and keyframes via `commitAnimatable(id, '<prefix>.spread', v)`.

- **Multi-select:** `spread` flows automatically (registry → `multiSelectDescriptors` →
  `sharedEditableProperties`, the `Box Shadow` section maps to the editor's `Drop Shadow`
  group). `inset` is single-select-only; NO `boolean` `SharedFieldKind` is added.

## Risks / guards

- **No spread/inset on text-shadow or drop-shadow** — guarded by (a) `shadowCss` /
  `dropShadowFilter` left untouched, (b) `SHADOW_DESCS` / `TIME_DRIVEN_STYLE` not extended,
  (c) the inset toggle rendered only in the two Box Shadow sections. Tested: a text-shadow /
  drop-shadow snapshot (solid + gradient text) is byte-identical to today.
- **Non-breaking** — spread/inset optional; defaults 0 / false. Tested: a pre-D-043 shadow
  (no spread/inset) parses and reads 0 / false, and `composeBoxShadow` emits `…px 0px …`
  (the spread default) for it — a visual no-op vs the old `…px …` (CSS treats an absent 4th
  length as 0).
- **inset is not keyframable** — not in `AnimatablePropertySchema`, no descriptor, no
  diamond. Tested: `'shadow.inset'` / `'boxShadow.inset'` are not `AnimatableProperty`s.
- **Static inset across play/stop** — read from `el.shadow.inset` on every recompose
  (never a track), so it persists whether or not spread animates.

## Out of scope

Text-shadow / drop-shadow spread/inset (CSS has neither). A boolean multi-select kind.
