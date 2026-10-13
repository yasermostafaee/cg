# The modal contract, written down: three action roles, the dismissal rule, and the size criterion

## Why

`DEBT.md:2079` says there are no OpenSpec artifacts for the `Modal` contract.
`runtime-modal-message-region` discharged half of it and said so in its own Impact
section:

> **Partial discharge only** of `DEBT.md:2079` […] this covers the MESSAGE region and its
> roles. The three action-button roles and the chrome migration of five dialogs remain
> unspecified and still owe their own artifacts.

This is the rest of it. The three action roles, the treatment each carries and the claim
each makes are written today in ONE component's module comment (`Modal.tsx` §2), and the
rule for a dismiss-only footer is written in ONE dialog's footer (`AuditPanel.tsx`).

**That is the mechanism this change exists to end, and it has already fired.** Three
dialogs — `Candidate layers — not configured`, `Live sources` and `Text file delimiters` —
each independently gave a button that DISMISSES the `primary` role, which is the treatment
that means "the action this dialog exists to perform". None of them was written by someone
ignoring the rule; the rule was in a file they had no reason to open. A rule stated in one
component's comment is a rule the next dialog cannot find.

## What changes

- **The three action roles are specified**, with what each ASSERTS rather than what colour
  it happens to be — so a future dialog picks a role from its meaning and inherits the
  treatment, instead of picking a treatment and inheriting a meaning it did not intend.
- **The dismissal rule moves out of `AuditPanel.tsx`'s footer and into the spec**, and the
  three dialogs that disagreed with it are corrected (already landed, `d9c47573`).
- **The `prose` / `wide` criterion is stated** — and the one place it contradicts the tree
  is settled rather than papered over. See the judgement below.

## 🔴 The criterion contradicts the tree, and it is the CRITERION that is wrong

`Modal.tsx` says `wide` is "for dialogs carrying a TABLE of per-row controls, which at prose
width wrap into an unreadable stack". The template picker is the one dialog that meets that
criterion while being **prose**: it carries a list of templates, one row each with a control,
and it absorbs the narrowness by stacking rows into a flex column.

**The picker is not the defect. The criterion is.** It names an IMPLEMENTATION (a table)
where the property that actually decides the answer is whether the content has a MINIMUM
LEGIBLE WIDTH that prose cannot give it — several columns that must stay aligned ACROSS rows,
so the operator can compare down a column. The fixed-bank config dialog has that (thirty
layers × checkbox + alias + observed state, compared down the list); the picker does not (one
name and one action per row, read one row at a time, never compared column-wise). Rewritten
that way the criterion returns `wide` for the first and `prose` for the second, which is what
both dialogs already are — so the tree was right and the sentence describing it was not.

⚠ **The picker's size does NOT move in this change**, and neither does any other dialog's.
`operator-surface` §1 answered that the picker stays; its LAYOUT is wave-2 territory. This
change states the criterion correctly and records that every current dialog already satisfies
it. Nothing is resized.

## Impact

- Affected specs: `runtime-ui`
- Affected code: `apps/runtime/src/renderer/ui/Modal.tsx` (the `size` prop's doc comment
  only), and the three dialogs already corrected in `d9c47573`
- **DISCHARGES the remainder of `DEBT.md:2079`.** With this landed, the `Modal` contract —
  chrome, message region, message roles, action roles, the dismissal rule and the size
  criterion — is specified rather than distributed across component comments.
- ⭐ **A hard dependency of `STATION-SETUP-01`**, which builds the settings home against these
  roles. It is not optional documentation.
