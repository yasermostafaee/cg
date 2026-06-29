# Finite sequence: first-item IN + last-item OUT before completion (D-116)

## Why

The per-item transitions (`transitionIn` / `transitionOut` / `transitionMs`) exist but were NOT applied
at the first/last boundaries: a finite sequence's first item appeared abruptly, and its last item froze
in place while the sequence reported "complete" — so the content-driven hold ended too early and the
composition's background outro could close OVER still-present content. D-116 plays the first item's
entrance and the last item's exit, and signals completion ONLY AFTER the last item's OUT finishes, so
the composition's outro fires after the content has left (content-first / background-last, D-105).

## What Changes

- **Runtime (`@cg/template-runtime` `sequence-driver.ts`)** — two new boundary phases:
  - `start()` plays the FIRST item's `transitionIn` (an `entrance` phase) before its first dwell.
  - When a FINITE run reaches the end of its last pass, it plays the LAST item's `transitionOut` (an
    `exit` phase), and `fireComplete()` is moved to AFTER that exit finishes (was: fired immediately,
    last item frozen on screen).
  - Both reuse `sampleTransition` via a single-edge boundary spec (the moving edge only, simultaneous).
- **INFINITE sequences are UNCHANGED**: gated on `repeat !== 'infinite'`, so an infinite run still
  renders item 1 statically, loops forever, and never completes (no entrance, no exit).
- A `'none'` edge or zero `transitionMs` is a no-op (today's behavior): straight to dwell / immediate
  completion.

## Capabilities

- `designer-playout-lifecycle` (MODIFIED): the finite-sequence completion now fires after the last
  item's exit; the sequence plays its boundary transitions.

## Impact

- `packages/template-runtime/src/sequence-driver.ts` only. No schema change (the transition fields
  exist). The delayed completion feeds the existing content-hold aggregation (`runtime.ts`
  `ownContentWait` → the PlayoutController hold → `startOutro`), so the parent's outro naturally fires
  after the sequence's exit. preview == export (one driver).
- Tests: `sequence-driver` unit (entrance plays; last-OUT plays before completion; infinite unchanged)
  - `sequence-runtime` (a finite sequence governs the hold across the entrance/exit; the parent's
    stop.\* fires after the run; loop-cycle re-runs; pause/resume).
