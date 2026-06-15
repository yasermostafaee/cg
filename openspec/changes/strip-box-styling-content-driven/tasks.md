# Tasks — strip-box-styling-content-driven (D-056)

## 1. field-registry.ts (@cg/designer)

- [ ] 1.1 Shrink ticker/clock/sequence arrays to `[...TRANSFORM, TEXT_COLOR_DESC, ...SHADOW_DESCS, ...FILTER]` (drop BOX_DESCS, BACKGROUND_COLOR_DESC, PADDING_DESCS).
- [ ] 1.2 Revert `STROKE_DESCS.keyframeable` → `shape`; `BACKGROUND_COLOR_DESC.keyframeable` → `text`; `paddingDesc.read` → text-only. KEEP `TEXT_COLOR_DESC` (text||timeDriven) + `shadowDesc.read` (textShadow for these kinds).

## 2. animation-applier.ts (@cg/template-runtime)

- [ ] 2.1 `backgroundColor` → `type === 'text'`; `applyStroke` → `shape`.
- [ ] 2.2 Gate `applyCornerRadius` + the padding block with `!isTimeDriven`. KEEP `text.color` (writesTextStyle) + `applyShadow` (text-shadow for the trio).

## 3. scene-builder.ts (@cg/template-runtime)

- [ ] 3.1 `buildTicker`/`buildClock`/`buildSequence`: remove background/backgroundFill, the `applyBoxStyle` call, and padding (incl. ticker inner-viewport inset). KEEP color, textShadow, colorFill. `applyBoxStyle` + text/shape call sites untouched.

## 4. timeline.ts writeStaticAnimatable (@cg/designer)

- [ ] 4.1 `backgroundColor` + `padding.*` cases → text-only.
- [ ] 4.2 STRICT: narrow the stroke cases' `boxKind` gate to shape/text. KEEP `text.color` + shadow widenings.

## 5. StyleSection.tsx (@cg/designer)

- [ ] 5.1 Remove background FillField, padding section, `<StrokeSection>`, `<BorderRadiusSection>` from the three sections. KEEP text-colour control + `<TickerShadowSection>`.
- [ ] 5.2 Rename these three sections' shadow `title` "Drop Shadow" → "Text Shadow" (text/shape unchanged).
- [ ] 5.3 Relayout `TickerShadowSection` offset X/Y onto one `VectorField` line.

## 6. Doc-sync

- [ ] 6.1 The five specs above. Registry / applier / scene-builder / section docstrings that say these kinds have box styling.

## 7. Tests

- [ ] 7.1 `field-registry.test.ts`: time-driven kf set → TRANSFORM + text.color + shadow.\* + FILTER.
- [ ] 7.2 `box-props.test.ts`: background-capable expose → shape/text; stroke keyframe-able → shape-only; "static stroke ungated for ticker" → now asserts NOT written.
- [ ] 7.3 `inspector-keyframe-parity.test.ts`: clock shows NO stroke/background/padding/cornerRadius diamonds (keep text.color + shadow); revert the D-052 gradient/padding additions.
- [ ] 7.4 `animation-applier.test.ts`: keep text.color + shadow (text-shadow) for the trio; assert stroke/background/padding/cornerRadius NOT applied.
- [ ] 7.5 `scene-builder.test.ts`: ticker/clock/sequence paint NO background/stroke/radius/padding; KEEP the clock/sequence gradient-text (colorFill) tests.
- [ ] 7.6 Regression guard: shape + text box styling unchanged (stroke/radius/bg/shadow).
- [ ] 7.7 E2E `box-props.spec.ts`: these kinds expose only text colour + Text Shadow (no stroke/radius/bg/padding).

## 8. Gate + validate

- [ ] 8.1 `pnpm turbo run format:check typecheck lint test build --filter @cg/designer --filter @cg/template-runtime` (test uncached once with `--force`).
- [ ] 8.2 E2E + screenshots (ticker/clock inspector; rendered ticker — items at the edge, crawl runs).
- [ ] 8.3 `pnpm openspec validate strip-box-styling-content-driven --strict`.
