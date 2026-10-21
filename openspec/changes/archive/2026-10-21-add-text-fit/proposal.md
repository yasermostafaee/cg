# Shrink to Fit — a text that fits its box on air (B-147, TEXT-FIT-01)

## Why

A long Persian name in a lower third overflowed its box on air. The schema carried THREE spellings of
"make it fit" — `fitMode: 'shrink-to-fit'`, `autoSqueeze: true` and `overflow: 'shrink'` — and the
runtime read none of them (`B-147`). The Inspector's Auto Squeeze toggle wrote a value nothing read;
`DESIGNER-FIX-02` (owner Q8 (a)) replaced it with an honest "not available" fact until this change.
The owner chose (Q8 (b)) to build the real thing.

## What Changes

- **One spelling:** `fitMode: 'shrink-to-fit'`. A REGISTERED scene migration (`migrateTextFit`,
  second in `SCENE_MIGRATIONS`) rewrites the two legacy spellings on every load — in the Designer and
  in the on-air page — and a text that asked for none of them is returned as the SAME object, so no old
  template changes how it looks unless it had asked for fit. The schema still parses the legacy values;
  nothing writes them.
- **Real shrink-to-fit on the page** (`text-fit.ts`): the font (and its letter spacing, in em) shrinks
  until the LAID-OUT, shaped text fits its box — measured, never a character count — down to half
  its authored size (`TEXT_FIT_MIN_SCALE`); past that, the author's overflow: clip, or a one-line
  ellipsis. It re-fits synchronously when a field writes new text (no jump frame), when the box first
  gets or changes its size, and when a font loads.
- **One code path:** the Designer's preview and canvas and the exported page run the same runtime.
- **The Inspector control is back:** `Shrink to Fit [Yes | No]` on a FIXED text box, and
  `Overflow [Clip | Ellipsis]` while it shrinks — no explanatory prose. It replaces
  `DESIGNER-FIX-02`'s interim fact.

## Impact

- **Specs:** `designer-text-autosize` (ADDED × 3, MODIFIED × 1), `designer-dynamic-fields` (MODIFIED × 1);
  `designer-fix-02`'s interim requirement is withdrawn from that change.
- **Code:** `@cg/shared-schema` (`elements.ts`, `scene-migrations.ts`), `@cg/template-runtime`
  (`text-fit.ts`, `scene-builder.ts`, `bindings.ts`, `runtime.ts`, `animation-applier.ts`),
  `apps/designer` (the text Inspector).
- **Wire:** none. **Schema version:** stays `1`.
