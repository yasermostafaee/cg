# Design — textarea SEQUENCE item-text input (D-118)

## Scope: SEQUENCE only

The ticker keeps its single-line `<input>` (a crawl is single-line on air, and D-117 is sequence-only).
Only the sequence text-item input becomes a textarea. `ListItemsEditor` is shared, so the swap is
scoped to its `compositions`-context "value" branch (the sequence path); the `columns`-less single-text
branch (ticker, preview form) is unchanged.

## Decision: a native `<textarea>` (shared primitive) — Enter is newline for free

The single-line `<input>` in `ListItemsEditor` has NO Enter handler, so swapping the sequence one for a
native `<textarea>` gives Enter-inserts-newline with no key override — and a textarea, unlike an input,
preserves `\n` in its value. We wrap it in a shared `renderer/ui/Textarea` primitive (design-system,
vanilla-extract). No `onKeyDown` is added; Escape/Tab keep their native behavior.

## Decision: the commit path + undo are UNCHANGED

The sequence item text already commits on every `onChange` → `setSequenceItems` (the existing
item-update store path). Swapping `<input>` → `<textarea>` does not change that wiring, so "one undo
entry per edit" is exactly what it was — embedded `\n` is just text in the committed item. No
commit-on-blur or new store action.

## RTL

The sequence element's `direction` is threaded into the textarea's `dir` so Persian/RTL item text
edits in reading order. The ticker / repeater columns / preview form omit it (unchanged).

## Out of scope

- The ticker item input (single-line, unchanged).
- Auto-grow to content height (ship a comfortable min-height + `resize: vertical`).
- The on-air rendering of the `\n` — that is D-117.
