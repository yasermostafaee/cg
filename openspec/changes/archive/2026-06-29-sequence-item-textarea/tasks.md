# Tasks — textarea SEQUENCE item-text input (D-118)

## 1. Shared primitive

- [x] `renderer/ui/Textarea.tsx` + `Textarea.css.ts` — a design-system multi-line text input
      (panel-input look, min-height, `resize: vertical`, `white-space: pre-wrap`).

## 2. Wire into the SEQUENCE item editor

- [x] `ListItemsEditor.tsx` — the SEQUENCE text-item input (`compositions`-context value line) becomes
      `<Textarea>` (same `onChange` item-update path); add a `dir` prop. Ticker row input stays
      `<input>`.
- [x] `StyleSection.tsx` — pass `dir={element.direction}` to the SEQUENCE `ListItemsEditor` only.

## 3. Tests

- [ ] Playwright E2E: in a sequence item textarea, Enter inserts a `\n` (does NOT commit/close); the
      value round-trips with the embedded `\n` through the store; undo reverts the edit; an RTL
      sequence's item textarea is `dir="rtl"`.

## 4. Gate

- [ ] `format:check` + `typecheck` + `lint` + `test` + `build` for `@cg/designer` (turbo `--force`).
- [ ] `pnpm test:e2e` (the new spec).
- [ ] `pnpm openspec validate sequence-item-textarea --strict`.
- [ ] Conventional commit; D-118 PRD `[~]`. Do NOT archive.
