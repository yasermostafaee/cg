# Design — multi-line SEQUENCE item text (D-117)

## Scope: SEQUENCE only (ticker is a single-line crawl)

The ticker is a horizontal CRAWL; multi-line wrapping makes no sense there (and the corrected D-118
leaves the ticker item input single-line, so a `\n` can't even be authored for a ticker). This change
touches ONLY the sequence renderer; ticker rendering + its item input are unchanged.

## Decision: CSS `pre-wrap` + a grid-cell width cap; NO height measurement, NO schema field

The item `text` is already a `string` that can hold `\n`. The feature is a render-CSS change on the
shared `makeSequenceItemNode` factory: `white-space: 'pre'` → `'pre-wrap'` (honors `\n` AND allows
soft-wrap), `max-width: 100%` (wrap inside the grid cell), `overflow-wrap: break-word` (unbreakable
long word). The item wraps inside the FIXED element box (`grid-area: 1/1`); overflow clips.

**Why no height measurement.** The per-item transition (push-up etc.) translates the whole item by
the FIXED box height (`sequence-driver` `box()` reads the element's height), which moves the
multi-line block as ONE unit (no mid-line cut) and fully clears the box — using the ITEM's own height
would UNDER-shoot a short item in a tall box. So the fixed box height is the correct, unchanged
metric. Dwell/advance layout is unaffected (one grid cell). This keeps the change tiny; the E2E in a
real browser is the adversarial check that the wrapped block renders + transitions cleanly.

## Decision: no `maxLines` / `wrap` schema field (default = wrap + honor `\n`, no cap)

The PRD default is "wrap + honor `\n`, no cap". A `maxLines`/`wrap` toggle is not required by any
Acceptance scenario and adds schema + UI surface for no current need; ship the default only.

## RTL

The item node already sets `direction` + `unicode-bidi: isolate`; `pre-wrap` wraps in reading order,
so Persian/RTL multi-line wraps right-to-left. An E2E RTL case covers it.

## Out of scope

- The ticker (single-line crawl, unchanged).
- Authoring the `\n` (the sequence textarea) — that is D-118.
- The box AUTO-growing to content height (items wrap inside the authored box and clip).
