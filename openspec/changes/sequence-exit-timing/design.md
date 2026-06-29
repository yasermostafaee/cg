# Design — finite sequence boundary transitions + completion timing (D-116)

## Confirmed recon (change-sites verified against the codebase)

- `sequence-driver.ts` — `Phase = 'idle' | 'dwell' | 'transition'` (extended). `start()` rendered item
  1 statically then `enterPhase('dwell')`. `advance()` (the timer/`next()` path): at the end of the
  last pass of a FINITE run it called `fireComplete()` immediately and froze (`this.running = false`),
  leaving the last item on screen. `beginTransition` / `paintTransition` / `finishTransition` drive a
  two-item transition via `sampleTransition(spec, elapsed)` (`sequence-motion.ts`), which returns
  `{ out, in, done }` poses; `applyPose` writes `transform` + `visibility`.
- `whenComplete()` returns the per-run promise (`fireComplete` → `resolveComplete`). The runtime
  collects `driver.whenComplete()` into `ownContentWait` (`runtime.ts`), which the PlayoutController
  awaits before `startOutro()` — so MOVING `fireComplete` later automatically delays the parent outro.
- The infinite branch is the `repeat !== 'infinite'` guard in `advance()` (wrap vs complete).

## Decision — two new single-item boundary phases, finite-only

Add `'entrance'` and `'exit'` to `Phase`. An entrance/exit is a ONE-item motion (no second item to
sequence against), so it reuses `sampleTransition` with a `boundarySpec`: the moving edge set
(`transitionIn` for entrance / `transitionOut` for exit), the other edge `'none'`, `timing:
'simultaneous'`. The driver applies only the relevant pose (`frame.in` for entrance, `frame.out` for
exit) to the single on-screen node, and `step()` / `scheduleIfNeeded()` / `resume()` treat the two
phases like a transition (rAF-driven).

- `start()`: a FINITE sequence with `transitionIn !== 'none'` and `transitionMs > 0` enters the
  `entrance` phase (first item slides in), then `finishBoundary('entrance')` settles it at rest and
  enters `dwell`. Else straight to dwell (today).
- `advance()` end-of-finite-run: with `transitionOut !== 'none'` and `transitionMs > 0`, enter the
  `exit` phase (last item slides out); `finishBoundary('exit')` calls `fireComplete()` + freezes. Else
  complete immediately (today). A `phase === 'exit'` guard prevents re-entry.

**Why finite-only.** The PRD scopes the boundary transitions + completion to finite sequences and
requires INFINITE behavior unchanged. Gating both on `repeat !== 'infinite'` keeps the infinite path
(static first item, endless loop, never completes) byte-for-byte as before — the high-risk content-hold
aggregation only ever saw infinite sequences as "never settles", and that is preserved.

## Decision — completion fires after the exit ⇒ parent outro is last

Because `whenComplete()` already feeds the content hold, moving `fireComplete()` from "last dwell ends"
to "last item's exit finished" makes the parent hold until the content has LEFT, then play its own
outro — the D-105 content-first / background-last staggering, now correct for sequences. No
animation-engine / aggregation change is needed; only the moment of `fireComplete`.

## Manual advance + reconcile + pause

- The entrance plays on `start()` regardless of `advance: 'auto' | 'manual'`; `next()` is ignored
  during the entrance/exit phases (it already guards `phase !== 'dwell'`), so a manual run waits for
  the entrance to settle before the first `next()`.
- `pause()`/`resume()` freeze and repaint the boundary phases in lockstep (added to `resume`).
- The mid-transition reconcile (`setItems` removing the on-screen item) is untouched; the exit is only
  entered at a genuine end-of-finite-run, after the resume/successor logic has run.

## Out of scope

Ticker/clock boundary transitions (they have their own content models); the infinite first-item
entrance (kept unchanged to honor "infinite unchanged"); any schema change (transition fields exist).
