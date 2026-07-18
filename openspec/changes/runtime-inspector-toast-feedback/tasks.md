# Tasks — Inspector feedback is toast-only

## 1. Enumerate every inline message the Inspector renders (done)

- [x] 1.1 `Inspector` Update (`AsyncButton`, no `onError`) → inline `.cg-btn-error`, AND
      `applyDraft` already toasts the same failure. The duplicate.
- [x] 1.2 `PositionPicker` Apply position (`AsyncButton`, no `onError`) → inline only;
      `setPosition` does NOT self-report, so the toast never hears about it.
- [x] 1.3 `PositionPicker` "locked while on air" — NOT command feedback. A persistent
      disabled-state explanation (R-011); a transient toast would lose it. Stays.
- [x] 1.4 `DraftChip` "unapplied edits" — a state marker (R-003), not a message. Stays.
- [x] 1.5 `ListFieldEditor` — stages locally, issues no command, renders no feedback. Nothing
      to route.
- [x] 1.6 Field validation — none exists in the Inspector (no `role="alert"`, `aria-live` or
      `aria-invalid` rendering). Nothing to route.

## 2. Route them

- [x] 2.1 `Inspector` Update: `onError={() => undefined}` — suppress the duplicate INLINE copy,
      leave `applyDraft`'s toast as the single report. Mirrors `StackRow`'s UPDATE exactly.
- [x] 2.2 `PositionPicker` Apply position: `onError={reportCommandError}` — here the button IS
      the reporter. Wording unchanged (the same `errorCodeMessage` mapping, relocated).

## 3. Tests

- [x] 3.1 A refused Apply position toasts, with the mapped wording, and pins nothing inline.
- [x] 3.2 An accepted Apply position says nothing at all (no toast, no inline).
- [x] 3.3 The applyDraft path toasts exactly ONCE and pins nothing inline — the no-duplicate
      guarantee.
- [x] 3.4 Mutation-checked: dropping either `onError` turns these red (no toast in one case,
      an inline message in the other).

## 4. Gate

- [x] 4.1 `pnpm gate` green (uncached); caspar-bridge green isolated AND under full parallel test.
- [x] 4.2 `pnpm gate:e2e` green, with no dev server / mock / bridge competing for CPU.
- [x] 4.3 `pnpm openspec validate runtime-inspector-toast-feedback --strict`.
