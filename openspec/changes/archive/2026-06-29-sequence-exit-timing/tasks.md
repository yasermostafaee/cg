# Tasks — finite sequence first-IN / last-OUT before completion (D-116)

## 1. Runtime (`@cg/template-runtime` sequence-driver.ts)

- [x] Add `entrance` / `exit` to `Phase`; `boundarySpec` + `paintBoundary` + `finishBoundary` (reuse
      `sampleTransition`, single moving edge, simultaneous).
- [x] `start()` plays the FIRST item's `transitionIn` (finite only) before dwelling.
- [x] `advance()` end-of-finite-run plays the LAST item's `transitionOut`, then `fireComplete()` (was
      immediate). A `phase === 'exit'` guard prevents re-entry.
- [x] `step()` / `scheduleIfNeeded()` / `resume()` handle the new phases. INFINITE path untouched.

## 2. Tests

- [x] `sequence-driver` unit: entrance plays on start; last item exits before completion (by timer +
      by `next()`); reset re-runs with the boundaries; reconcile resume still completes; infinite
      unchanged (existing test).
- [x] `sequence-runtime`: a finite sequence governs the content-driven hold across entrance/exit (the
      parent's stop.\* fires after the run, last item exited); loop-cycle re-runs each cycle;
      pause/resume freeze in lockstep.

## 3. Gate

- [ ] `format:check` + `typecheck` + `lint` + `test` + `build` for `@cg/template-runtime` (turbo
      `--force`); `pnpm test:e2e` (the sequence E2E still passes — boundary transitions don't change
      the asserted end-state).
- [ ] `pnpm openspec validate sequence-exit-timing --strict`.
- [ ] Conventional commit; D-116 PRD `[~]`. Do NOT archive (until confirmed).
