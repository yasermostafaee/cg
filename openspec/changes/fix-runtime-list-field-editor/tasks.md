# Tasks — Runtime Inspector list-field editor (B-040)

> **Reconciled 2026-07-07:** every task below shipped in the merged PR #243
> (`8a7fd87`) — boxes checked to match reality. The change stays ACTIVE (not
> archived) and **B-040 stays `[~]`** pending the operator's on-air validation;
> archive on the Runtime track after that report.

## 1. Pure list-edit helpers

- [x] Add `apps/runtime/src/renderer/features/inspector/listField.ts`:
      `toListItems(value)` (array → array; else `[]` — never `String()`-coerce),
      `itemText(item)`, `setItemText`, `addItem(items, id)`, `removeItem`,
      `moveItem` — all preserve each item's `id` + unknown fields and return arrays.

## 2. The editor + Inspector wiring

- [x] Add `apps/runtime/src/renderer/features/inspector/ListFieldEditor.tsx`: a
      structured items editor (one text input per item + ↑/↓/× + Add item), local
      state seeded from the value, commit-on-blur for text + immediate for
      structural ops; new ids via the Runtime `uuid()`; commits a `ListItem[]`.
- [x] `Inspector.tsx`: `FieldControl` gains a `list` branch (before the default text
      input), keyed by the value signature so switching items / external updates
      re-seed. `inferKind` maps `Array.isArray(value)` → `list`.

## 3. Tests

- [x] Unit (`tests/listField.test.ts`, node env): `toListItems` never yields
      `"[object Object]"` (non-array → `[]`); edits preserve `id` + unknown fields;
      results are arrays whose `JSON.stringify` is a real array literal.
- [x] E2E (`apps/runtime` Playwright): import a `.vcg` with a ticker `list` field →
      load → select → Inspector shows an items editor (NOT `"[object Object]"`); edit
      an item → it round-trips as structure via `stack.update` (re-read shows the
      edited text, not `"[object Object]"`). Add the fixture builder for the list
      field.

## 4. Gate

- [x] Full green gate UNCACHED (`turbo … --force`) for `@cg/runtime`:
      `format:check` + `typecheck` + `lint` + `test` + `build`.
- [x] `pnpm test:e2e` (Designer + Runtime stay green; the new list spec passes).
- [x] `pnpm openspec validate fix-runtime-list-field-editor --strict`.
- [x] Commit + push + open a PR. **B-040 stays `[~]`** (flip to `[x]` on review/merge
      confirmation, per the bug loop).
