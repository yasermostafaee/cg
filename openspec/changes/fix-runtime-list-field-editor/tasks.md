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

## 5. Multi-line items (extension — 2026-07-07 live finding)

> Live session (CasparCG 2.5.0 `69e8ad5`): multi-line list items get flattened —
> the per-item editor is a single-line `<input>`, whose value sanitization strips
> line breaks. See the PRD B-040 appended finding + `design.md` → "Multi-line
> items".

- [ ] `ListFieldEditor.tsx`: replace the single-line item `<input>` with an
      auto-growing `<textarea>` (rows from the line count, comfortable minimum,
      capped; `resize: vertical`) preserving `\n` on read AND write. Enter inserts
      a newline — never commits/submits (commit stays on blur; the staged-edit
      model is R-003, out of scope). Add/remove/reorder + the structured-array
      round-trip unchanged (never `"[object Object]"`, never flattened strings).
- [ ] Unit (`tests/listField.test.ts`): multi-line round-trip — `setItemText`
      preserves `\n`; the committed array's JSON round-trip keeps the newline
      intact (never flattened).
- [ ] E2E (`inspect-list-field.spec.ts`): type a two-line item (Enter for the
      break) → the newline survives into the committed payload
      (`stack.snapshot`) and the re-read editor value; item 2 untouched; no
      `"[object Object]"`.
- [ ] Bridge→mock integration matrix stays green (it already covers two-line
      Persian list items on the wire — no bridge/mock change expected).

## 6. Gate + on-air validation (multi-line extension)

- [ ] Full green gate UNCACHED (`turbo … --force`) for `@cg/runtime` +
      repo `format:check`; `pnpm test:e2e`.
- [ ] `pnpm openspec validate fix-runtime-list-field-editor --strict`.
- [ ] Operator on-air validation (real CasparCG): edit a ticker item to two lines
      incl. Persian → Update → both lines render on the output; reorder; add +
      remove an item; plain text fields unaffected. (A sticky "updating" badge is
      the separately-filed B-044 — the pass criterion is the value on air, not
      the badge.)
- [ ] After the operator's PASS: flip B-040 → `[x]` in the PRD, archive the
      change per the workflow, commit + push.
