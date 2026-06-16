# Tasks — separate-text-box-shadow (D-057)

## 1. Schema (@cg/shared-schema)

- [ ] 1.1 Add `shadow: ShadowSchema.optional()` to `TextElementSchema` (explicit, NOT BoxStyle).
- [ ] 1.2 Add `boxShadow.offsetX`, `boxShadow.offsetY`, `boxShadow.blur`, `boxShadow.color` to `AnimatablePropertySchema`.

## 2. Runtime (@cg/template-runtime)

- [ ] 2.1 `scene-builder.ts` `buildText`: paint `el.style.boxShadow = composeBoxShadow(element.shadow)` (mirror buildShape); keep the text-shadow paint. buildShape unchanged.
- [ ] 2.2 `animation-applier.ts`: add a `boxShadow.*` branch (recompose `box-shadow` for text from static `el.shadow` + animated `boxShadow.*`). The `shadow.*` path (text→text-shadow, shape→box-shadow) is unchanged.

## 3. Designer (@cg/designer)

- [ ] 3.1 `field-registry.ts`: add a `boxShadow.*` descriptor set for TEXT (reads `el.shadow`, section "Box Shadow"); keep `shadow.*` descriptors (text "Text Shadow"). Shape + content-driven unchanged.
- [ ] 3.2 `StyleSection.tsx`: parameterize `DropShadowSection` (keyPrefix + field accessor + title); text renders "Text Shadow" (`shadow.*`/`textShadow`) + "Box Shadow" (`boxShadow.*`/`shadow`); shape renders "Box Shadow" (`shadow.*`/`shadow`, relabel only). Content-driven untouched.
- [ ] 3.3 `timeline.ts` `writeStaticAnimatable`: add a `boxShadow.*` case (text → `el.shadow`); `shadow.*` cases unchanged.

## 4. Doc-sync

- [ ] 4.1 The two specs above + any `DropShadowSection`/applier/scene-builder docstring describing the single shadow.

## 5. Tests

- [ ] 5.1 schema: text accepts `shadow`; old scene (no shadow) loads/validates; existing `shadow.*` keyframes unaffected.
- [ ] 5.2 `scene-builder.test.ts`: a text element paints BOTH text-shadow (from `textShadow`) and box-shadow (from `shadow`); buildShape unchanged.
- [ ] 5.3 `animation-applier.test.ts` (KEY independence): a text element with a text-shadow keyframe on `shadow.*` AND a box-shadow keyframe on `boxShadow.*` animates to DIFFERENT values in one frame. Keep the "shape shadow stays box-shadow; text shadow stays text-shadow" no-regression test.
- [ ] 5.4 `field-registry.test.ts` / `inspector-keyframe-parity.test.ts`: text exposes both shadow sets' diamonds (`shadow.*` + `boxShadow.*`); shape + content-driven unchanged.
- [ ] 5.5 Shape-relabel assertion: section title "Box Shadow", behavior identical.
- [ ] 5.6 E2E `box-props.spec.ts`: text shows "Text Shadow" + "Box Shadow"; shape shows "Box Shadow".

## 6. Gate + validate

- [ ] 6.1 `pnpm turbo run format:check typecheck lint test build --filter @cg/designer --filter @cg/template-runtime --filter @cg/shared-schema` (test uncached once, `--force`).
- [ ] 6.2 E2E + screenshots (text: both sections; shape: Box Shadow).
- [ ] 6.3 `pnpm openspec validate separate-text-box-shadow --strict`.
