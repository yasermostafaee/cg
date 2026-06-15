# Design — strip-box-styling-content-driven (D-056)

## Context

D-042 + D-052 gave ticker/clock/sequence full box styling. This reverses that for those
three kinds ONLY, keeping text colour (incl. gradient `colorFill`) + text-shadow +
font/text. `text` and `shape` are untouched; `repeater` is already box-free
(`RepeaterElementSchema` does not merge `BoxStyleSchema`).

The single regression risk is hitting `text`/`shape` — so EVERY reversion is gated to
`ticker|clock|sequence` (an `isTimeDriven` predicate), never the shared text/shape path.

## Decision — kind-gated reversions

### field-registry.ts

- ticker/clock/sequence arrays → `[...TRANSFORM, TEXT_COLOR_DESC, ...SHADOW_DESCS, ...FILTER]`
  (drop `BOX_DESCS` = stroke + radius, `BACKGROUND_COLOR_DESC`, `PADDING_DESCS`).
- Revert the `isTimeDriven` branch of the predicates: `STROKE_DESCS.keyframeable`
  `shape || isTimeDriven` → `shape`; `BACKGROUND_COLOR_DESC.keyframeable`
  `(text || isTimeDriven)` → `text`; `paddingDesc.read` clock/sequence widening → text-only.
- KEEP `TEXT_COLOR_DESC` (`text || isTimeDriven` — text colour stays) and
  `shadowDesc.read` (reads `textShadow` for these kinds — text-shadow stays).

### animation-applier.ts (additive reverts; shape/text branches kept)

- `backgroundColor` (`writesTextStyle`) → `type === 'text'`.
- `applyStroke` (`hasBoxStroke = shape || isTimeDriven`) → `shape`.
- `applyCornerRadius` (currently ungated) → early-return `if (isTimeDriven(type))`.
- padding `applyNumeric` block → gate `if (!isTimeDriven(type))`.
- KEEP `text.color` (`writesTextStyle` — text + trio) and `applyShadow`
  (`writesTextStyle` → `text-shadow` for the trio).

### scene-builder.ts (static paint)

- `buildTicker` / `buildClock` / `buildSequence`: remove the `backgroundColor` +
  `backgroundFill` writes, the `applyBoxStyle(el, element)` call (stroke + radius), and
  the padding writes (incl. the ticker inner-viewport inset — items start at the edge).
  KEEP `color`, `textShadow`, `colorFill` (gradient text). `applyBoxStyle` itself and
  its `buildText`/`buildShape` call sites are unchanged.

### timeline.ts writeStaticAnimatable

- `backgroundColor` + `padding.*` cases → text-only. STRICT: narrow the stroke cases'
  `boxKind` gate to `shape || text` so a programmatic stroke write does not mutate
  `el.stroke` for these kinds (dead-data prevention). KEEP `text.color` + the
  `shadow.*` `textShadow` widenings.

### StyleSection.tsx

- `TickerSections` / `ClockSections` / `SequenceSections`: remove the background
  `FillField`, the padding section, `<StrokeSection>`, `<BorderRadiusSection>`. KEEP the
  text-colour control + `<TickerShadowSection>`. Rename these three sections' shadow
  `CollapseSection title` "Drop Shadow" → "Text Shadow" (text + shape stay "Drop
  Shadow"). Relayout `TickerShadowSection` offset X/Y onto ONE `VectorField` line (like
  the text element's `DropShadowSection`).

## B-016 (gradient-text wipes background)

Removing background from clock/sequence makes the `colorFill` gradient (which still sets
`el.style.background` + `background-clip:text`) have nothing to clobber → moot for
clock/sequence (ticker never had `colorFill`). It REMAINS on `text` (unchanged) — the
narrowed B-016 (text-only), tracked separately.

## Risks / guards

- text/shape untouched: every edit gates on `isTimeDriven` or reverts a predicate to
  `shape`/`text`; tests assert shape stroke/radius/bg/shadow and text
  stroke/radius/bg/both-shadows still work.
- Ticker crawl: removing the inner-viewport padding changes layout (items start at the
  edge — intended) but not the `viewportWidth` measurement path; verify the crawl still
  runs.
- Migration option B: schema keeps the fields (dead data on unused kinds). Only the
  stroke `boxKind` write-gate is narrowed (strict).
- Parity invariant: these kinds must show NO box-style diamonds again (only text.color +
  shadow); the parametric parity test re-derives both sides and stays green once
  registry + UI agree.
