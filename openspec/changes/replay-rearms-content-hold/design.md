# Design — replay re-arms the content-driven hold (B-033)

## Recon

- The PlayoutController re-calls `waitForContent()` FRESH at each hold entry (`playout-controller.ts`
  ~242), so OWN content re-arms: `play()` resets each driver (`runtime.ts` ~1092-1102), `reset()`
  re-mints the driver's `completion`, and the fresh `whenComplete()` is captured anew.
- The CONTENT-DRIVEN (coordinator) nested path is different: the parent's aggregation awaits the
  child's `whenSettled()` (B-031), and that `settled` deferred is created ONCE in `wireScope`
  (`runtime.ts` ~693) and resolved by `onSettle`. `play()` never re-armed it — so on a replay,
  `child.whenSettled()` returns the already-resolved promise and the parent's `Promise.all` resolves
  immediately → instant close. Confirmed: this is the only stale signal across a replay.

## Decision: re-arm the settle deferred per run, before the cascade

Make `settled` re-mintable (`let settled` + `resetSettled()` that creates a fresh unresolved
promise), expose `resetSettled` on `ScopeNode`, and in `play()` walk every scope (`rootNode` + its
`children`, after repeater rows are re-stamped) calling `resetSettled()` BEFORE the controller
cascade. Because each parent captures `whenSettled()` fresh at its (async, post-intro) hold entry,
re-arming all settle deferreds up-front guarantees the next run's wait is pending.

- `whenSettled: () => settled` keeps returning the CURRENT deferred, so the fresh one is what later
  captures see.
- Done before `cascade(rootNode, c => c.play())` so no hold entry can capture a stale settle.
- Freshly re-stamped repeater rows already have new deferreds; re-arming them again is a harmless
  no-op. Rows are not `instanceChildren`, so they are not awaited for content anyway.

## Out of scope

- Driver `whenComplete` (already re-minted by `reset()`), `holdToken` invalidation (already handles
  stale resolutions after stop/outro), and any schema / animation-engine change.
