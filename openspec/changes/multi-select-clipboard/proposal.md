# Multi-select clipboard, context menu & shortcuts (D-076, D-077)

## Why

The layer clipboard is single-element today: the right-click menu's Copy / Cut / Paste /
Duplicate / Delete / Fit (and Color) act only on the clicked row, and there is no keyboard
clipboard at all. Once you can multi-select layers (designer-multi-select), the natural
expectation — operate on the WHOLE selection, and with Ctrl/Cmd+C/X/V — is missing. D-076 and
D-077 share one core (a selection-aware clipboard + ops), so they ship together.

## What Changes

- The in-memory clipboard becomes `Element[]` (the whole copied selection, in stack order)
  instead of a single `Element | null`. `getClipboard()` returns the array, `setClipboard(els)`
  replaces it, and `hasClipboardElement()` is "array non-empty". The single-element ops adapt
  (copy/cut wrap in a 1-element array; `pasteElement` is a thin alias for `pasteElements`).
- New selection-aware store ops in `state/slices/elements.ts`, each ONE undo step
  (`runAsSingleHistoryEntry`): `copySelection`, `cutSelection`, `duplicateSelection`,
  `pasteElements`, `fitSelectionLifespanToActiveRange`, and `setSelectionTimelineColor`.
- **D-076** — the layer right-click menu (`LayerContextMenu.tsx`) wires Color / Fit / Copy / Cut /
  Paste / Duplicate / Delete to the selection-aware ops. The right-clicked row is normalized into
  the selection at the row's `onContextMenu` (`ElementRow.tsx`): a row already in the
  multi-selection keeps the whole selection, a row outside it replaces it with just that row — so
  the menu always acts on the intended set (matching standard editors). Color is selection-aware
  too (applies the chosen swatch to every selected layer).
- **D-077** — a new global keydown effect in `App.tsx`, cloned from the Delete/Backspace handler:
  Ctrl/Cmd+C → `copySelection`, +X → `cutSelection`, +V → `pasteElements`. It bails when an
  `input` / `textarea` / `select` / contentEditable is focused (native text clipboard wins) and
  does nothing (no `preventDefault`) when there is nothing selected (C/X) or the clipboard is empty
  (V); on a real action it `preventDefault`s, sets one `markHistoryBoundary()`, then runs the op.
- Ripple: the Copy / Cut / Paste rows are added to the keyboard `ShortcutsModal`.

## Impact

- Affected specs: **designer-multi-select** (ADDED — selection-aware context-menu actions;
  copy/cut/paste keyboard shortcuts).
- Affected code: `@cg/designer` only — `renderer/state/store-core.ts` (clipboard `Element[]`),
  `renderer/state/slices/elements.ts` (selection-aware ops) + `slices/document.ts` (clear on scene
  switch), `renderer/features/timeline/LayerContextMenu.tsx` + `ElementRow.tsx` (wire + target
  normalization), `renderer/App.tsx` (keydown effect), `renderer/features/shell/ShortcutsModal.tsx`
  (rows).
- **No** schema / `@cg/template-runtime` / exporter / `.vcg` / runtime change. Clones reuse the
  existing `cloneElementWithNewIds` (fresh ids deep), so no id collisions.
