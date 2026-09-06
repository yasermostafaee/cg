# Tasks — the modal contract, written down

## 1. The action roles

- [x] 1.1 Specify the three roles and what each ASSERTS, in
      `specs/runtime-ui/spec.md` — the meaning, never the colour.
- [x] 1.2 Pin that one role resolves to ONE treatment across dialogs, and that the
      helper for callers that cannot use the component agrees with it
      (`modalPrimitive.dom.test.ts` §2 already asserts both; no new test owed).

## 2. The dismissal rule

- [x] 2.1 Move the rule out of `AuditPanel.tsx`'s footer comment and into the spec.
- [x] 2.2 Apply it to the three dialogs that disagreed — the unconfigured candidate-layers
      explainer, `Live sources` and `Text file delimiters` — verifying first that each
      commits nothing rather than assuming it (`d9c47573`).
- [x] 2.3 Red-first proof plus a NEGATIVE control: `Candidate layers` WITH a bank keeps
      its `primary` Apply, so the rule cannot decay into "no dialog has a primary"
      (`modalDismissRole.dom.test.ts`).
- [x] 2.4 Sweep for tests pinning the old copy or role before changing anything —
      case-insensitively and on the bare phrase. Found: seven Playwright steps across
      `live-source-sources.spec.ts`, `modal-message-in-viewport.spec.ts` and
      `pvw-live-plate-placeholder.spec.ts` click these buttons by ACCESSIBLE NAME, and
      `modalPrimitive.dom.test.ts` asserts roles on a synthetic modal only. Labels were
      therefore left unchanged and no spec needed editing.

## 3. The size criterion

- [x] 3.1 Judge the contradiction between the criterion and the tree, and record which is
      wrong: **the CRITERION**. It named an implementation (a table) where the deciding
      property is whether values must stay aligned ACROSS rows for the operator to compare
      down a column. See `proposal.md`.
- [x] 3.2 State the corrected criterion in the spec, in those terms.
- [x] 3.3 Correct `Modal.tsx`'s `size` prop comment to match, pointing at the spec.
- [ ] 3.4 ⚠ **NOT IN THIS CHANGE, recorded so it is not lost:** the template picker's
      LAYOUT (rows stacked into a flex column at prose width) is wave-2 territory.
      `operator-surface` §1 answered that the picker STAYS; nothing here resizes it, and
      every current dialog already satisfies the corrected criterion.

## 4. Gate

- [x] 4.1 `pnpm openspec validate runtime-modal-contract --strict`.
- [x] 4.2 Full green gate, uncached (`0 cached`).
- [ ] 4.3 ⚠ **Linux `gate:e2e` OWED.** This change's code half (`d9c47573`) alters a
      button's treatment on three dialogs, which is a rendering change. A green Windows
      run does not discharge it. Write the run URL beside this box when a COMPLETED,
      GREEN `e2e` job that actually RAN exists for a head containing the change — a
      SKIPPED job discharges nothing (`P-029`).
