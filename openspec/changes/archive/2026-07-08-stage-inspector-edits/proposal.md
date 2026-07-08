# Staged Inspector edits: nothing reaches air until the Update button (R-003)

## Why

R-003 (filed 2026-07-07, operator-reconfirmed twice since): every Inspector
edit commits on change/blur/Enter and reaches the on-air output immediately —
a half-finished or accidental edit goes straight to air. On-air safety needs an
explicit apply step. The same commit-on-blur mechanism carries the recorded
hazard (R-003's Notes): the `JSON.stringify(value)` remount key swallows the
first click on the list editor's structural buttons and can lose keystrokes
typed into another row when a state push lands.

## What Changes

The operator-agreed behavior contract, verbatim scope:

1. **ALL Inspector edits stage locally** — text fields, textareas, and list
   operations (item text, add, remove, reorder). Nothing is sent to the bridge
   on change, on blur, or on Enter. Enter in a textarea inserts a newline;
   Enter in a single-line input commits nothing.
2. **The stack row's UPDATE button is the ONLY apply path**: it sends the
   item's complete staged field-set as ONE `stack.update` (atomic — no
   per-field sends), then the normal B-044 lifecycle runs (transient
   `updating` → settles on ack / `unconfirmed` on timeout). An equivalent
   apply control also sits inside the Inspector — same action, no new
   semantics.
3. **UPDATE stays enabled when nothing is staged** (sending unchanged values
   remains possible — the operator's documented B-048 workaround). Dirty state
   is communicated by field markers, never by disabling the button. (The
   pre-existing STATUS gating of the row button — disabled for idle/loaded —
   is untouched; see design.)
4. **Dirty state is visible and honest**: staged-but-unapplied fields get a
   minimal dirty marker; a Discard control reverts drafts to the last applied
   values. Minimal styling only (the queued UI-polish change restyles).
5. **Drafts are per stack item** and survive selection switches within the
   session; switching items never silently loses a draft.
6. **Take / Out / Remove never auto-apply drafts**: Take plays the last
   APPLIED values; a dirty item stays visibly dirty (row-level draft chip) so
   the operator knows air ≠ draft.
7. **Incoming state pushes never clobber in-progress drafts.** The
   `JSON.stringify(value)` remount-key mechanism is REMOVED (the recorded
   hazard): the first click on ↑/↓/× always lands, and typing while a push
   arrives never loses keystrokes. Mechanism + replacement named in design.md.
8. Out of scope: bridge/protocol changes (the `stack.update` payload shape is
   unchanged), busy-spinner visuals (UI polish), the AMCP escape rule, audit
   semantics (only applied updates are audited — staging is renderer-local and
   invisible to the audit log).

## Capabilities

- `runtime-template-library` (MODIFIED): the list-field editor requirement's
  commit wording — structure guarantees unchanged, but edits now stage and
  ship on the explicit apply.
- `runtime-template-library` (ADDED): the staged-edits contract (stage /
  apply / discard / draft persistence / push-safety).

## Impact

- `apps/runtime` renderer ONLY: a framework-free draft store
  (`features/inspector/draftStore.ts`), Inspector + ListFieldEditor become
  controlled draft-or-applied views (remount keys removed), StackPanel's
  UPDATE builds the staged payload, StackRow gains a minimal draft chip.
- `MockRuntime` needs NO behavior change (verified: staging is renderer-local;
  the apply sends the same `{ itemId, fields, mergeMode: 'merge' }` shape).
- Tests: draft-store unit suite; the blur-commit e2e specs re-encoded on the
  Update-button flow (intent kept); a new staged-edits e2e; the bridge→mock
  matrix and badge-settle e2e stay green.
- R-003 stays `[ ]` → flips `[x]` after the operator's live validation.
