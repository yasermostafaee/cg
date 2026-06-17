# Tasks — unify-align-add-vertical (D-045)

## 1. Schema (@cg/shared-schema)

- [x] 1.1 `elements.ts`: add `verticalAlign: z.enum(['top','middle','bottom']).default('middle')` to `TickerElementSchema`, `ClockElementSchema`, `SequenceElementSchema`. Do NOT touch text's `verticalAlign` or any `align` enum.
- [x] 1.2 `animation.ts`: NO change — `align`/`verticalAlign` stay out of `AnimatablePropertySchema`.

## 2. Render (@cg/template-runtime)

- [x] 2.1 `scene-builder.ts`: add `vAlignToGrid` (top→start, middle→center, bottom→end). `buildClock` flex `align-items` ← `vAlignToFlex(verticalAlign ?? 'middle')`; `buildSequence` grid `align-items` ← `vAlignToGrid(verticalAlign ?? 'middle')`; `buildTicker` static row `align-items` ← `vAlignToFlex(verticalAlign ?? 'middle')`. Horizontal align untouched.
- [x] 2.2 `ticker-driver.ts`: add `verticalAlign?` to `TickerDriverOptions`; `makeItemNode` applies it (local `tickerVAlignToFlex`, default middle).
- [x] 2.3 `runtime.ts`: pass `verticalAlign: t.element.verticalAlign` into `new TickerDriver`.

## 3. Designer (@cg/designer)

- [x] 3.1 New `AlignButtonGroup.tsx` + `AlignButtonGroup.css.ts` (extracted from the text group; bare `Control`, accent active, `updateElement`, no diamond) + `H_ALIGN_OPTIONS` / `V_ALIGN_OPTIONS`. Move the align group/button styles out of `TextStyleSection.css`.
- [x] 3.2 `TextStyleSection.tsx`: render its H + V groups via `AlignButtonGroup` (no behaviour change; `justify` stays unexposed).
- [x] 3.3 `StyleSection.tsx`: clock/sequence replace the `align` `SelectField` with the shared H group + a V group (`HAlignRow`/`VAlignRow`); ticker adds a V group only.
- [x] 3.4 `element-defaults.ts`: seed `verticalAlign: 'middle'` on ticker/clock/sequence.
- [x] 3.5 Multi-select: NO change (align/verticalAlign single-select-only).

## 4. Doc-sync

- [x] 4.1 The four spec deltas + the `TickerDriverOptions.verticalAlign` docstring. No other engine structure/contract change.

## 5. Tests

- [x] 5.1 `shared-schema`: ticker/clock/sequence parse with `verticalAlign` default `'middle'` (pre-D-045 element omitting it reads `'middle'`); explicit values accepted.
- [x] 5.2 `template-runtime`: `buildClock` (flex) / `buildSequence` (grid) / `buildTicker` static row emit the correct vertical CSS per `verticalAlign`; default centres; horizontal align unaffected.
- [x] 5.3 `template-runtime`: `TickerDriver` crawl item nodes use the element's `verticalAlign` (top→flex-start, bottom→flex-end), not a hardcoded centre; default centres.
- [x] 5.4 `designer`: `align`/`verticalAlign` are NOT `AnimatableProperty`s; the inspector groups create no track.
- [x] 5.5 `designer`: clock/sequence render the H button-group (NOT a dropdown) + V group; ticker renders the V group only (no H); text keeps both; committing writes `element.align` / `element.verticalAlign`.

## 6. Gate + validate

- [x] 6.1 `pnpm turbo run typecheck lint test build --filter @cg/shared-schema --filter @cg/template-runtime --filter @cg/designer --force` (uncached) + `pnpm format:check`.
- [x] 6.2 `pnpm openspec validate unify-align-add-vertical --strict`.
