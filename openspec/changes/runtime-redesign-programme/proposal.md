# Build CG Control to the owner's approved reference, in ten phases

**Prompt ID:** `RUNTIME-REDESIGN-01` · authority: `docs/ui-reference/runtime-redesign/PROMPT.md`

## Why

The owner approved a visual design for the Runtime app — nine HTML files at
`docs/ui-reference/runtime-redesign/`, one prototype, differing only in `<title>` and
`<body data-start="…">`. The goal is that the Runtime looks and behaves like it **without losing
a single behaviour, refusal, or safety surface the product already has.**

That second clause is the whole reason this is a programme with a change document rather than a
sequence of styling commits. **A redesign that implements only what is drawn deletes everything
that is not, and nobody notices until the night it was needed.** The reference is a prototype: its
sample data, its timers and its JavaScript simulation are not the app's logic, it draws no alarm
that fires on a rare fault, and it has no equivalent for a surface whose whole job is to appear
when something has gone wrong. Twenty-six such surfaces exist in the app today and none of them is
in the reference.

**This change is the programme's memory.** Ten phases, ordered, each taken by one session. The
phase state lives in `tasks.md`; a later session reads that to choose a phase rather than assuming.

## What changes

- **Phase 1 (this session) — discovery, no product code.** The MAP (every surface the reference
  touches → the component that renders it today → the bridge channel that feeds it) and the
  DELETION GUARD (every surface the app has today that the reference does not draw, each with a
  named test that will prove it still appears). Both in `design.md`.
- **Phases 2–10 — the build.** Tokens and primitives; the layers table; Looks; preview/program and
  the Inspector; live plates and audio; settings and channels; library, import and the audit log;
  the undrawn surfaces re-dressed; verification. Each phase's scope, gates and acceptance are its
  section of the prompt, restated as tasks.

## What does NOT change

- **The command contract.** Load, Take, Update, Stop, Clear, Remove keep their existing meanings
  exactly. Golden rule 10 stands: `Update` does not take.
- **The bridge contracts.** The prototype's template shape (`t.layouts`, `t.plateIds`,
  `t.defaultSources`, `t.supportsNext`) is its own invention; `@cg/shared-schema` plus the `.vcg`
  manifest wins.
- **The refusals.** `R-017`'s on-air REMOVE refusal and its canonical sentence, the bulk gates, the
  published `removeExempt` answer, the bank fencing, the preflight paths, `reconcileOnReconnect`
  and the `LockPolicy` table.
- **Persisted keys.** The census in `apps/runtime/tests/persistedKeyCensus.test.ts` is unchanged by
  every phase. Phase 7 asserts it explicitly.
- **Language.** The interface stays English and LTR and must render existing Persian text
  correctly. Nothing is translated.

## Non-goals

- A multi-channel bridge contract. Phase 7 shapes the channel list to be filled from an API; where
  the bridge is single-channel today the gap is filed, not invented. See `design.md` §4.
- Restoring the reference's own simulation, sample data or timers into the product.
- Moving the lock screen onto the modal primitive. The reference draws its lock as a dialog inside
  the Station-setup shadow root; `PROMPT.md` §9 forbids reading that as an argument, and this
  change records why (`design.md` §3, guard item 15).
