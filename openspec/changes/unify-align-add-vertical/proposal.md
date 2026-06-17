# Unify alignment controls + add vertical align to ticker/clock/sequence (D-045)

## Why

Alignment is authored differently per kind today: the text element has a shared horizontal

- vertical button-group, but clock/sequence expose horizontal align as a dropdown and NONE
  of ticker/clock/sequence can set vertical alignment (their text is hardcoded vertically
  centred). This unifies every kind onto ONE shared alignment button-group (the text group is
  the model, so D-048 can polish a single control) and adds vertical alignment to the three
  time-driven kinds. The ticker is a crawl, so it gains VERTICAL only (no horizontal).

## Scope (locked)

- **ticker** → add VERTICAL align only (no horizontal).
- **clock + sequence** → add VERTICAL align; their existing 3-value HORIZONTAL align stays,
  but its control becomes the shared button-group (replacing the dropdown).
- **text** → unchanged: keeps its 4-value `align` SCHEMA (incl. `justify`) and its existing
  vertical align; the refactor onto the shared component is behaviour-preserving.
- **justify** stays TEXT-ONLY and SCHEMA-ONLY — the horizontal button-group is start/center/
  end only; `justify` is never exposed and is not added to any other kind.
- **align AND verticalAlign are NON-keyframable everywhere** (neither is an
  `AnimatableProperty`); every group writes via `updateElement`, no diamond.

## What Changes

- **Schema (additive, non-breaking):** add `verticalAlign: z.enum(['top','middle','bottom'])
.default('middle')` to `TickerElementSchema`, `ClockElementSchema`, `SequenceElementSchema`.
  Default `'middle'` preserves today's centring. `animation.ts` unchanged — verticalAlign /
  align are NOT animatable.
- **Render (template-runtime):** `buildClock` sets flex `align-items` from `verticalAlign`
  (via `vAlignToFlex`); `buildSequence` sets GRID `align-items` from `verticalAlign` (via a
  new grid mapping `vAlignToGrid` — start/center/end, not the flex keywords); `buildTicker`'s
  static authoring row sets flex `align-items` from `verticalAlign`; `TickerDriver` gains a
  `verticalAlign` option and applies it to each crawl item node (mirroring authoring), passed
  from `runtime.ts`. Horizontal align (clock `justify-content`, sequence `justify-items`) is
  untouched. Each site defaults to `'middle'` so a pre-D-045 fixture still centres.
- **Inspector (designer):** a new shared `AlignButtonGroup` component (extracted from the
  text group — bare `Control` icon buttons, accent active state, `updateElement`, no
  diamond) + shared `H_ALIGN_OPTIONS` / `V_ALIGN_OPTIONS`. Text uses it for its H + V groups
  (no behaviour change). Clock/sequence replace the `align` dropdown with the shared H group
  and add a V group. Ticker adds a V group only. `element-defaults` seed `verticalAlign:
'middle'`.
- **Multi-select:** unchanged — align / verticalAlign are single-select-only (like
  font-family / weight); not added to the shared-property model.

## Capabilities

### Modified Capabilities

- `designer-ticker-element`: a new requirement — vertical alignment of the crawl text within
  the band (default middle; mirrored in the authoring row AND the live crawl).
- `designer-clock-element`: a new requirement — vertical alignment of the time text (flex).
- `designer-sequence-element`: a new requirement — vertical alignment of the items (grid).
- `designer-inspector`: a new requirement — the unified alignment button-group (clock/
  sequence H replaces the dropdown; ticker V only; justify text-only/schema-only; align and
  verticalAlign non-keyframable).

## Impact

- **Schema:** `elements.ts` (three `verticalAlign` fields). No `.vcg`/GDD break (additive,
  defaulted).
- **Render:** `scene-builder.ts` (`buildClock`/`buildSequence`/`buildTicker` + `vAlignToGrid`),
  `ticker-driver.ts` (option + item node), `runtime.ts` (pass the option).
- **Designer:** new `AlignButtonGroup.tsx` + `.css.ts`; `TextStyleSection.tsx`/`.css.ts`
  (use the shared component; the align styles move to the new css); `StyleSection.tsx`
  (clock/sequence H+V, ticker V); `element-defaults.ts` (seed verticalAlign).
- **Tests:** schema defaults; render flex vs grid value sets + the TickerDriver item node;
  non-keyframable; inspector (button-group not dropdown; ticker V-only; commits).
- **Docs:** the four spec deltas + the `TickerDriverOptions` docstring.

## Out of scope

Making alignment animatable. Exposing `justify` anywhere (stays text-schema-only). Multi-
select alignment. The D-048 visual polish (this only unifies the control so D-048 has one).
