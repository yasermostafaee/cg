# Replay re-arms the content-driven hold (B-033)

## Why

In the preview, a content-driven hold waits correctly on the FIRST play, but pressing Play again
(without reopening) makes it close instantly — it no longer waits for content; only reopening the
preview restores correct behaviour. Recon pinned the cause to the B-031 self-settle signal: a content
-driven parent awaits a nested content-driven (coordinator) child's `whenSettled` deferred, which is
created ONCE and resolves on the first play. `play()` re-mints every driver's `whenComplete` (via
`reset()`) but never re-armed `whenSettled`, so on the 2nd+ play the parent captured an
already-resolved settle and stopped waiting. (Own / non-coordinator-nested content already re-armed,
because the parent re-calls `waitForContent()` fresh at each hold entry over freshly-reset drivers.)

## What Changes

- **Runtime (`@cg/template-runtime`)** — the per-scope self-settle deferred becomes re-mintable
  (`ScopeNode.resetSettled`), and `play()` re-arms every scope's settle signal before the controller
  cascade. So a replay's content-driven hold waits on a PENDING settle again. No other behaviour
  changes (settle still resolves at the scope's outro; the parent still captures `whenSettled()`
  fresh at each hold entry).

## Capabilities

- `designer-playout-lifecycle` (ADDED): a content-driven hold re-arms on every replay.

## Impact

- `packages/template-runtime/src/runtime.ts` (the `settled` deferred + `play()`).
- Tests: a runtime test (own + nested-coordinator reset/replay re-arms the hold) + a preview E2E
  play-twice guard. No schema change, no version bump.
