# Multi-line text in SEQUENCE items on air (D-117)

## Why

A sequence item renders SINGLE-line today (`white-space: pre` on the item node), so long text
overflows or clips and there is no way to force a break (e.g. a two-line now/next title/subtitle).
Operators need both authored `\n` breaks AND automatic wrapping for long Persian lines. (Authoring
those breaks is D-118; this item is the on-air RENDER.)

This is SEQUENCE ONLY. The ticker is a horizontal CRAWL — multi-line is out of scope; the ticker's
single-line on-air rendering is unchanged.

## What Changes

- **Runtime (`@cg/template-runtime`)** — the sequence item node (`sequence-driver.ts`
  `makeSequenceItemNode`, the factory shared by the live driver AND the scene-builder's static
  item-1 render) switches `white-space: pre` → `pre-wrap` and gains a width cap (`max-width: 100%` of
  the grid cell) + `overflow-wrap: break-word`, so item text honors explicit `\n` AND auto-wraps at
  the element width.
- The item height becomes DYNAMIC (the wrapped content) but wraps INSIDE the FIXED element box (grid
  cell; overflow clips). The per-item transition (push-up etc.) already moves the whole item BLOCK by
  the fixed box height (`sequence-driver` `box()`), so a multi-line block animates as ONE unit (no
  mid-line cut) and needs no per-item height measurement. `align` / `verticalAlign` / RTL still
  position the taller item.

## Capabilities

- `designer-sequence-element` (ADDED): multi-line sequence item text.

## Impact

- `packages/template-runtime/src/sequence-driver.ts` only. No schema change (the item `text` is
  already a string; `\n` needs none — see design.md for the no-max-lines/no-wrap-toggle decision).
  Ticker untouched. Preview == export (the same runtime sequence driver).
- Tests: runtime unit (item node `pre-wrap` + `max-width`; `\n` preserved; RTL; single-line
  unchanged) + a Playwright E2E (a two-line sequence item renders multi-line in the preview and still
  transitions, incl. an RTL case).
