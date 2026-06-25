# Tasks — multi-select clipboard, context menu & shortcuts

## 1. Core — selection-aware clipboard + ops

- [x] `store-core.ts` — clipboard `Element | null` → `Element[]`; `getClipboard(): readonly Element[]`,
      `setClipboard(els)`, `_resetCore` clears to `[]`
- [x] `slices/document.ts` — clear clipboard on scene switch via `setClipboard([])`
- [x] `slices/elements.ts` — adapt single ops to the array clipboard (`copyElement` →
      `setClipboard([clone])`, `hasClipboardElement` → non-empty, `pasteElement` aliases
      `pasteElements`)
- [x] `slices/elements.ts` — add `copySelection`, `cutSelection`, `duplicateSelection`,
      `pasteElements`, `fitSelectionLifespanToActiveRange` (each ONE undo step)
- [x] `slices/elements.ts` — add `setSelectionTimelineColor` (selection-aware Color, one undo)

## 2. D-076 — multi-select layer context menu

- [x] `ElementRow.tsx` — right-click normalizes the target: keep the selection when the row is in
      it, else replace with just that row
- [x] `LayerContextMenu.tsx` — wire Color / Fit / Copy / Cut / Paste / Duplicate / Delete to the
      selection-aware ops (Paste enabled when `hasClipboardElement()`)

## 3. D-077 — copy/cut/paste keyboard shortcuts

- [x] `App.tsx` — keydown effect: Ctrl/Cmd+C/X/V → copy/cut/paste; bail on editable focus; no-op
      (no `preventDefault`) when nothing selected / clipboard empty; one `markHistoryBoundary` + op
- [x] `ShortcutsModal.tsx` — add the Copy / Cut / Paste rows

## 4. Spec & docs

- [x] Extend `designer-multi-select` (ADDED: selection-aware context-menu actions; copy/cut/paste
      shortcuts) — one scenario per D-076 / D-077 acceptance bullet
- [x] PRD `docs/prd/designer.md` — D-076 + D-077 → `[~]`
- [x] `pnpm openspec validate multi-select-clipboard --strict`

## 5. Tests & gate

- [x] Unit tests for the selection-aware ops (`store-layer-actions.test.ts`)
- [x] E2E mapping the scenarios (multi copy→paste, cut, duplicate, delete, fit, color;
      right-click-unselected targets just it; Ctrl+C/X/V; shortcut inert in an input)
- [x] Full `@cg/designer` green gate (format:check + typecheck + lint + test + build)
