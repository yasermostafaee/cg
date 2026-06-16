# Tasks — add-box-shadow-spread-inset (D-043)

## 1. Schema (@cg/shared-schema)

- [ ] 1.1 `primitives.ts` `ShadowSchema`: add `spread: z.number().optional()` and `inset: z.boolean().optional()` (shared field; read-time defaults spread→0, inset→false).
- [ ] 1.2 `animation.ts` `AnimatablePropertySchema`: add `shadow.spread` (beside `shadow.offsetX/Y/blur`) and `boxShadow.spread` (beside `boxShadow.offsetX/Y/blur`). Add `inset` NOWHERE.

## 2. Runtime (@cg/template-runtime) — box-shadow ONLY

- [ ] 2.1 `scene-builder.ts` `composeBoxShadow(s)`: emit `${s.inset ? 'inset ' : ''}${s.offsetX}px ${s.offsetY}px ${s.blur}px ${s.spread ?? 0}px ${s.color}` (fixes both buildText + buildShape).
- [ ] 2.2 `animation-applier.ts` shape (`applyShadow` box branch): spread = `readNumericTrack(tracks,'shadow.spread',frame) ?? src.shadow?.spread ?? 0`, inset = `src.shadow?.inset ?? false` (static); compose the inset-prefix + spread box-shadow form. Add `shadow.spread` to `SHADOW_PROPS`.
- [ ] 2.3 `animation-applier.ts` text (`applyBoxShadow`): spread = `readNumericTrack(tracks,'boxShadow.spread',frame) ?? staticShadow?.spread ?? 0`, inset = `staticShadow?.inset ?? false`; emit the inset-prefix + spread form. Add `boxShadow.spread` to `BOX_SHADOW_PROPS`.
- [ ] 2.4 Leave `shadowCss`, `dropShadowFilter`, the text-shadow / drop-shadow branches of `applyShadow`, `applyTimeDrivenHostStyle`, `timeDrivenGlyphDrop` UNCHANGED (no spread/inset).

## 3. Designer (@cg/designer)

- [ ] 3.1 `field-registry.ts`: add a keyframable `Spread` numeric descriptor — `shadow.spread` to `SHAPE_SHADOW` (multiSelect) and `boxShadow.spread` to `BOX_SHADOW_DESCS` — placed after blur, before color; extend `shadowDesc` / `boxShadowDesc` `sub` unions with `'spread'`. Do NOT touch `SHADOW_DESCS` / `TIME_DRIVEN_STYLE`. Do NOT add any inset descriptor.
- [ ] 3.2 `StyleSection.tsx` `DropShadowSection`: render a `Spread` row (like Blur, `commitAnimatable(id, '<prefix>.spread', v)`) AND an Outset/Inset toggle (the RadiusToggle pattern, writing `updateElement(id, { shadow: { ...shadow, inset } })`) ONLY in the two "Box Shadow" instances (shape + text box). Never in a "Text Shadow" section. No diamond on the toggle.

## 4. Doc-sync

- [ ] 4.1 The two specs above + the `composeBoxShadow` / `applyShadow` / `applyBoxShadow` docstrings (spread + inset). No engine structure/contract change beyond these.

## 5. Tests

- [ ] 5.1 `shared-schema`: `ShadowSchema` round-trips `spread` + `inset`; a pre-D-043 shadow (no spread/inset) parses and reads as 0 / false.
- [ ] 5.2 `template-runtime` `scene-builder.test.ts`: static `composeBoxShadow` (via buildShape + buildText) emits the `inset` prefix + spread length for shape AND text.
- [ ] 5.3 `template-runtime` `animation-applier.test.ts`: shape `applyShadow` recomposes box-shadow on `shadow.spread` (and keeps static inset); text `applyBoxShadow` recomposes on `boxShadow.spread`; update the existing exact-string box-shadow assertions to the 4-length form.
- [ ] 5.4 `template-runtime`: a text-shadow / drop-shadow snapshot is UNCHANGED (no spread/inset leak) for solid AND gradient text.
- [ ] 5.5 `field-registry.test.ts`: `spread` present on Box Shadow (shape `shadow.spread` + text `boxShadow.spread`) and ABSENT on Text Shadow (text) and on the content-driven Text Shadow; `isKeyframeable('*.spread')` true; `'shadow.inset'` / `'boxShadow.inset'` are NOT `AnimatableProperty`s (no inset descriptor anywhere).
- [ ] 5.6 `StyleSection` (jsdom): the Inset toggle renders in BOTH Box Shadow sections (shape + text), writes `el.shadow.inset` via `updateElement`, and does NOT render in any Text Shadow section.
- [ ] 5.7 E2E `box-props.spec.ts`: a shape / text "Box Shadow" section shows the Spread row + the Inset toggle; the Text Shadow section shows neither.

## 6. Gate + validate

- [ ] 6.1 `pnpm turbo run format:check typecheck lint test build --filter @cg/shared-schema --filter @cg/template-runtime --filter @cg/designer` (test uncached once, `--force`).
- [ ] 6.2 `pnpm test:e2e` (turbo builds first).
- [ ] 6.3 `pnpm openspec validate add-box-shadow-spread-inset --strict`.
