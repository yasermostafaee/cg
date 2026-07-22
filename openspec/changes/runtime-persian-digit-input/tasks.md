# Tasks — Persian/Arabic-Indic digit input (R-020)

## 1. Primitive

- [x] 1.1 `NumericInput` in `apps/runtime/src/renderer/ui/NumericInput.tsx`:
      `type="text"` + `inputMode` (numeric/decimal), normalizes Persian ۰–۹ and
      Arabic-Indic ٠–٩ → Latin in `onChange` (typing + paste) via `latinDigits` from
      `@cg/text-shaping` (read-only reuse — the shared package is not modified), caret
      preserved across the normalizing swap.
- [x] 1.2 `normalizeDigits` exported for the non-NumericInput digit site (the lock PIN)
      and for tests; `decimal` mode additionally maps ٫ (U+066B) → "." locally (the
      shared package does not cover it).

## 2. Route the sites

- [x] 2.1 Inspector `NumberField` → `NumericInput` (`decimal`); `step`/`min`/`max` no
      longer rendered (they never clamped the staged value — spinner/`:invalid` only).
- [x] 2.2 PositionPicker dx/dy → `NumericInput` (`decimal`).
- [x] 2.3 ServerSettingsPanel AMCP/OSC ports → `NumericInput` (integer-only): digits
      normalize BEFORE `parsePort`'s `/^\d+$/` — the B-077 interaction.
- [x] 2.4 Lock PIN — both ends of one comparison: StatusBar normalizes digits before
      `lock.engage`, LockOverlay before `onRelease`; the generic `usePrompt` dialog stays
      verbatim.
- [x] 2.5 Site survey confirmed the complete numeric set (all other Runtime inputs are
      text/file/checkbox/color surfaces — verbatim by design).

## 3. Tests

- [x] 3.1 `tests/numericInput.dom.test.ts`: `normalizeDigits` (both digit sets, verbatim
      non-digits, ٫ only in decimal mode); primitive (text+inputMode, typed Persian →
      Latin displayed AND delivered, paste path, decimal ٫ → ".").
- [x] 3.2 Site integration: Inspector number field stages the canonical NUMBER; a TEXT
      field keeps Persian digits verbatim; PositionPicker applies canonical offsets on
      the wire; a Persian-typed port passes validation and submits canonical; LockOverlay
      release and StatusBar engage both deliver the normalized PIN.
- [x] 3.3 E2E ripple only (no new spec — closes on the local gate): the number control's
      role is textbox now, `stage-inspector-edits.spec.ts` selector updated.

## 4. Docs

- [x] 4.1 PRD: R-020 `[ ]` → `[~]` with the status note; R-014 narrowed to display-only
      (input half owned by R-020; display half + open questions kept).
