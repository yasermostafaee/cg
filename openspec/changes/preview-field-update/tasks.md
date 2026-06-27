# Tasks — preview field form: explicit Update + textarea (D-106)

## 1. Pending vs applied state

- [ ] `PreviewModal.tsx`: split field state into `applied` (`NestedFieldValues`,
      on stage) and `pending` (per-path edits); `onFieldChange` writes pending
      only (drop the realtime `dispatch.update`).
- [ ] Compute `anyPending` (any pending value differs from applied).

## 2. Explicit Update

- [ ] `handleUpdateAll()` — merge all pending into applied, `dispatch.update`
      once, clear pending; wire a global "Update all" control (disabled when
      `!anyPending`).
- [ ] `handleUpdateField(path)` — merge one field's pending into applied,
      `dispatch.update`, clear that field's pending; per-field Update affordance.
- [ ] Reset still re-seeds defaults + applies (clears pending); Play uses applied.

## 3. Pending indicator + textarea

- [ ] Reuse the D-088/D-089 amber (`#ffdd40` → a `colors.pending` token) for the
      per-field pending indicator + the "Update all" affordance.
- [ ] `PreviewFieldForm.tsx`: per-field pending state + per-field Update button;
      auto-grow textarea for long fields (`multiline` + ticker/sequence text),
      single-line otherwise.

## 4. Tests

- [ ] Designer test/E2E: editing a field does NOT change the stage until Update,
      and the field shows a pending indicator.
- [ ] global "Update all" applies all pending at once; a per-field Update applies
      only that field (others stay pending).
- [ ] a long value renders as a multi-line textarea (auto-grow).
- [ ] Reset still restores defaults to the stage.

## 5. Gate

- [ ] Part of the ONE combined gate with D-105 (turbo `--force`: format:check +
      typecheck + lint + test + build) across `@cg/designer` (+ `@cg/template-runtime`
      for D-105).
- [ ] `pnpm openspec validate preview-field-update --strict`.
