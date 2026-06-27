# Tasks — preview field form: explicit Update + textarea (D-106)

## 1. Pending vs applied state

- [x] `PreviewModal.tsx`: split field state into `applied` (`NestedFieldValues`,
      on stage) and `pending` (per-path edits); `onFieldChange` writes pending
      only (drop the realtime `dispatch.update`).
- [x] Compute `anyPending` (any pending value differs from applied).

## 2. Explicit Update

- [x] `onUpdateAll()` — merge all pending into applied, `dispatch.update`
      once, clear pending; wire a global "Update all" control (disabled when
      `!anyPending`).
- [x] `onUpdateField(path)` — merge one field's pending into applied,
      `dispatch.update`, clear that field's pending; per-field Update affordance.
- [x] Reset still re-seeds defaults + applies (clears pending); Play uses applied.

## 3. Pending indicator + textarea

- [x] Reuse the D-088/D-089 amber (`#ffdd40`) for the per-field pending indicator + the "Update all" affordance.
- [x] `PreviewFieldForm.tsx`: per-field pending state + per-field Update button;
      auto-grow textarea for text/multiline values.

## 4. Tests

- [x] Designer E2E: editing a field does NOT change the stage until Update,
      and the field shows a pending indicator.
- [x] global "Update all" applies all pending at once; a per-field Update applies
      only that field (others stay pending).
- [x] a long value renders as a multi-line textarea (auto-grow).
- [x] Reset still restores defaults to the stage.

## 5. Gate

- [x] Part of the ONE combined gate with D-105 (turbo `--force`: typecheck + lint +
      test + build across `@cg/designer` + `@cg/template-runtime`; `format:check`
      run separately as a root prettier script).
- [x] `pnpm openspec validate preview-field-update --strict`.

## 6. Consolidated fixes (FIX 1 / FIX 2 / FIX 3, pre-merge)

- [x] FIX 1 — per-field Update is PER pending field: each pending field shows its
      OWN Update control (applies only that field); exactly ONE global "Update all";
      no redundant second global "Update".
- [x] FIX 2 — apply IN PLACE: `platform/preview.ts` no longer re-ticks the
      controller-owned held frame on `update` during playback (a `playing` flag
      gates the post-update `runtime.tick`), so an Update swaps only the bound
      values and never tears down the held background / animation (CG UPDATE).
- [x] FIX 3 — long values stay fully visible: text + multiline render in an
      auto-growing `<textarea>` that wraps + grows to show the whole value.
- [x] D-106 E2E asserts all three: 3 pending fields ⇒ 3 per-field controls + 1
      "Update all" (no extra global); per-field applies in place keeping the held
      background; "Update all" applies the rest; a long value renders as a visible
      multi-line textarea showing the full text. Fixed `regressions.spec.ts` D-025 + `critical-flow.spec.ts` to the explicit-Update flow.
- [x] Re-ran the ONE combined gate (turbo `--force`) + the full E2E (120 passed).
