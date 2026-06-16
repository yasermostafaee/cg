# Design — unify-align-add-vertical (D-045)

## Context (verified in STEP 0)

1. Ticker vertical is hardcoded centre in TWO places: the scene-builder static authoring row
   (`buildTicker`: `staticRow.style.alignItems = 'center'`) and the `TickerDriver` crawl
   item nodes (`makeItemNode`: `node.style.alignItems = 'center'`). The driver is
   instantiated in `runtime.ts` from `t.element` (the full ticker element), so
   `verticalAlign` can be threaded into its options.
2. Clock vertical = FLEX `align-items` (values `flex-start`/`center`/`flex-end`). Sequence
   vertical = GRID `align-items` (values `start`/`center`/`end` — NOT the flex keywords).
3. Text's horizontal align control already offers start/center/end only (never `justify`)
   and writes `updateElement` (no diamond). `align`/`verticalAlign` are NOT in
   `AnimatablePropertySchema`.

## Decision — additive schema, one shared control, default-middle render

- **Schema:** `verticalAlign: z.enum(['top','middle','bottom']).default('middle')` on ticker/
  clock/sequence. The `.default` makes a pre-D-045 element parse to `'middle'` (centred as
  today). The OUTPUT type makes it required, so `element-defaults` seed `verticalAlign:
'middle'`. `animation.ts` untouched (not animatable).

- **Render — two vertical mappings (flex vs grid):**
  - `vAlignToFlex` (existing): top→`flex-start`, middle→`center`, bottom→`flex-end`. Used by
    the clock host and the ticker static row + driver item nodes (all flex).
  - `vAlignToGrid` (new): top→`start`, middle→`center`, bottom→`end`. Used by the sequence
    grid host. Grid does not accept the `flex-*` keywords, so a separate mapping is required.
  - Each call site passes `element.verticalAlign ?? 'middle'` so a fixture/older object
    lacking the field still centres (the schema default already guarantees it for parsed
    elements; the `?? 'middle'` is the belt-and-braces for unparsed test fixtures). Horizontal
    align (clock `justify-content`, sequence `justify-items`) is left exactly as-is.
  - `TickerDriver`: a new optional `verticalAlign` option; `makeItemNode` applies it via a
    LOCAL `tickerVAlignToFlex` helper (defaulting to middle) — kept local to avoid a
    `scene-builder → ticker-driver` import cycle (scene-builder already imports
    `populateTickerStaticRow` from the driver). `runtime.ts` passes
    `verticalAlign: t.element.verticalAlign`.

- **Inspector — one shared component:** `AlignButtonGroup` (extracted verbatim from the text
  group: a bordered row of bare `Control` icon buttons with an accent active state). It takes
  `ariaLabel`, the `current` value (may be outside `options` — e.g. text's `justify` — → no
  active button), `options`, and `onChange`. Shared `H_ALIGN_OPTIONS` (start/center/end, the
  glyphs ⫷☰⫸) and `V_ALIGN_OPTIONS` (top/middle/bottom, ⤒⇳⤓). The align group/button styles
  move from `TextStyleSection.css` to `AlignButtonGroup.css`. Consumers:
  - text: two `AlignButtonGroup` (H `current=element.align`, V `current=verticalAlign ?? 'top'`)
    — identical aria-labels/glyphs/writes as before (behaviour-preserving).
  - clock/sequence: a labelled H row (replacing the `align` `SelectField`) + a labelled V row,
    via small `HAlignRow`/`VAlignRow` wrappers in `StyleSection`.
  - ticker: a labelled V row only.
  - All write `updateElement({ align })` / `updateElement({ verticalAlign })` — non-keyframable.

## Risks / guards

- **Non-breaking centring** — default `'middle'` + `?? 'middle'` at every render site; tested:
  a clock/sequence/ticker WITHOUT verticalAlign still emits `center` (flex) / `center` (grid).
- **Grid vs flex keywords** — the sequence MUST use `start/center/end`, not `flex-*`; a flex
  keyword on a grid `align-items` is ignored. Separate `vAlignToGrid`; tested explicitly.
- **Authoring ↔ crawl parity (ticker)** — the static row and the driver item nodes both read
  `verticalAlign`; tested on both paths (the driver item node is the STEP-0.1 fix).
- **Text unchanged** — the refactor keeps the exact aria-labels (`Align start`…/`Vertical
top`…), glyphs, and `updateElement` writes; `justify` stays unexposed (it is never an
  option). Existing text-align tests still pass.
- **Non-keyframable** — `align`/`verticalAlign` are not `AnimatableProperty`s and no group
  calls `commitAnimatable`; tested (schema membership + no track created on commit).

## Out of scope

Animatable alignment. Exposing `justify`. Multi-select alignment. D-048 polish.
