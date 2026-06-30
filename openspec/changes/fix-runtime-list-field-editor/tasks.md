# Tasks — Runtime Inspector list-field editor (B-040)

## 1. Pure list-edit helpers

- [ ] Add `apps/runtime/src/renderer/features/inspector/listField.ts`:
      `toListItems(value)` (array → array; else `[]` — never `String()`-coerce),
      `itemText(item)`, `setItemText`, `addItem(items, id)`, `removeItem`,
      `moveItem` — all preserve each item's `id` + unknown fields and return arrays.

## 2. The editor + Inspector wiring

- [ ] Add `apps/runtime/src/renderer/features/inspector/ListFieldEditor.tsx`: a
      structured items editor (one text input per item + ↑/↓/× + Add item), local
      state seeded from the value, commit-on-blur for text + immediate for
      structural ops; new ids via the Runtime `uuid()`; commits a `ListItem[]`.
- [ ] `Inspector.tsx`: `FieldControl` gains a `list` branch (before the default text
      input), keyed by the value signature so switching items / external updates
      re-seed. `inferKind` maps `Array.isArray(value)` → `list`.

## 3. Tests

- [ ] Unit (`tests/listField.test.ts`, node env): `toListItems` never yields
      `"[object Object]"` (non-array → `[]`); edits preserve `id` + unknown fields;
      results are arrays whose `JSON.stringify` is a real array literal.
- [ ] E2E (`apps/runtime` Playwright): import a `.vcg` with a ticker `list` field →
      load → select → Inspector shows an items editor (NOT `"[object Object]"`); edit
      an item → it round-trips as structure via `stack.update` (re-read shows the
      edited text, not `"[object Object]"`). Add the fixture builder for the list
      field.

## 4. Gate

- [ ] Full green gate UNCACHED (`turbo … --force`) for `@cg/runtime`:
      `format:check` + `typecheck` + `lint` + `test` + `build`.
- [ ] `pnpm test:e2e` (Designer + Runtime stay green; the new list spec passes).
- [ ] `pnpm openspec validate fix-runtime-list-field-editor --strict`.
- [ ] Commit + push + open a PR. **B-040 stays `[~]`** (flip to `[x]` on review/merge
      confirmation, per the bug loop).
