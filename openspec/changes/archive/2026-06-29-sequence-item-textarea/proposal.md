# Larger multi-line (textarea) input for SEQUENCE item text (D-118)

## Why

The sequence item-text input is a single-line `<input>`: it can't hold long Persian copy comfortably
and can't enter a line break at all (a single-line input strips `\n`), so the authored multi-line
text that D-117 renders on air is impossible to create. This is the authoring half of the D-117 pair.

This is SEQUENCE ONLY. The ticker keeps its single-line item input (a crawl is single-line on air).

## What Changes

- **New shared primitive `renderer/ui/Textarea`** (vanilla-extract, the panel-input look + multi-line
  sizing: a comfortable min-height, `resize: vertical`, `white-space: pre-wrap`). A native
  `<textarea>` inserts a newline on Enter and does NOT submit/close — exactly D-118's requirement.
- **`ListItemsEditor`** — the SEQUENCE text-item input (the `compositions`-context "value" line)
  becomes `<Textarea>` instead of `<input>`, with the element's `direction` applied (`dir`) for
  RTL/mixed text. The TICKER row input (the `columns`-less single-text branch) stays a single-line
  `<input>`. The commit path is UNCHANGED (the same per-change `onChange` → `setSequenceItems`
  item-update store path, one undo entry per edit), so embedded `\n` round-trips like any text edit.
- The per-column (repeater) inputs, the dwell input, the data-key input, and the composition picker
  are NOT item text and stay as they were.

## Capabilities

- `designer-sequence-element` (ADDED): the sequence item-text input is a multi-line textarea.

## Impact

- `apps/designer/src/renderer/ui/Textarea.tsx` + `Textarea.css.ts` (new), `ListItemsEditor.tsx`
  (sequence branch → `<Textarea>` + a `dir` prop), `StyleSection.tsx` (sequence passes `dir`). Ticker
  inspector untouched. No runtime / schema / render change (rendering is D-117).
- Tests: a Playwright E2E — Enter inserts a `\n` (does not commit/close), the value round-trips with
  the embedded `\n` through the store, undo reverts the edit, and an RTL sequence's item textarea is
  `dir="rtl"`.
