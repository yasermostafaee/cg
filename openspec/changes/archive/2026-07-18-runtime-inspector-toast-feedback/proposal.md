# Inspector feedback is toast-only, like the rest of the surface

## Why

#334 moved the Library's and Stack rows' inline messages to the transient command toast, so a
wrapped refusal could not bloat or break a tight row. The **Inspector was left behind**, and it
ended up with the two failure modes that migration exists to remove — one on each of its two
controls:

- **Update says everything twice.** The button has no `onError`, so a failure renders the inline
  `.cg-btn-error` beside the control — while `applyDraft`, the shared apply behind both this
  button and the stack row's UPDATE, has **already** reported the same failure to the toast. One
  refusal, two messages, in two different places.
- **Apply position says it only in the panel.** `setPosition` does not self-report, so its
  refusal renders inline and never reaches the toast at all — the one place the operator has
  learned to look for command feedback everywhere else in the app.

## What Changes

Placement only. No wording changes, no change to when a message fires, no gate or command-path
change.

- **`Inspector`'s Update routes failures to a no-op sink**, suppressing the duplicate INLINE
  copy while leaving `applyDraft`'s toast as the single report. This is exactly what
  `StackRow`'s UPDATE already does, for exactly this reason — the two Update controls now
  behave identically because they are the same action.
- **`PositionPicker`'s Apply position reports to the toast.** Unlike Update this is the only
  reporter, so it reports rather than suppresses. The message is unchanged: the button already
  mapped `r.reason` through `errorCodeMessage`, and the toast carries that same mapping.
- **The spec requirement generalizes.** The existing "a refusal is a toast, not inline" rule was
  written library-scoped (`runtime-template-library`); the equivalent for the Inspector is added
  to `runtime-ui`, so the doctrine reads as app-wide rather than as one panel's local habit.

## Deliberately NOT moved

Not every piece of inline text is command feedback, and converting these would lose information:

- **`PositionPicker`'s "locked while on air"** is a persistent explanation of why a control is
  disabled (R-011), not the outcome of an action. A toast is transient and fires on an event;
  this has to be readable for as long as the control is locked, next to the control.
- **The Update/Discard `DraftChip`** is a state marker (R-003 "unapplied edits"), not a message.
- **`ListFieldEditor`'s controls** stage locally and issue no command, so they have no feedback
  to route.

There is no field-level validation feedback in the Inspector to move — no `role="alert"`,
`aria-live` or `aria-invalid` rendering exists there.

## Frozen

On-air refusal (R-006), the linkDown gates, [[B-085]]'s browser-local library,
[[B-086]]/[[B-087]]'s `unverified` badge and [[B-092]]'s stack restore are untouched. Nothing
about WHEN a message fires changes — only where it appears.

## Impact

- **Affected specs:** `runtime-ui` (ADDED: command feedback is transient, never pinned inline).
- **Affected code:** `apps/runtime` only — `features/inspector/Inspector.tsx` and
  `features/inspector/PositionPicker.tsx`. No package, bridge, schema or wire change.
