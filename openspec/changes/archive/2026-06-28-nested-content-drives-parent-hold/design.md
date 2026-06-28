# Design — content-driven nested composition drives the parent's hold (B-031)

## Decision: wait on the child's SELF-SETTLE, not its content `whenComplete()`

The obvious fix — have the parent capture a coordinator child's `ownContentWait()`
(its drivers' `whenComplete()`) — is UNSAFE. `TickerDriver.whenComplete()` returns
a per-run promise that is RE-MINTED on `reset()` (ticker-driver.ts; the same for the
clock/sequence drivers). A content-driven child resets+starts its own content at ITS
hold entry (its own `onContentStart`), which is on an independent timeline from the
parent's hold entry where the parent would capture the wait. If the parent captures
before the child resets, it holds the OLD (orphaned) promise → the parent strands.

So the parent waits on a RESET-SAFE lifecycle signal: the child's SETTLE. Each
non-root scope gets a `whenSettled()` promise resolved in its controller's `onSettle`
(after its outro). A content-driven child self-settles when its own content completes
(its `waitForContent` resolves → its outro → settle); the parent holds until that
resolves. This is captured-once-resolved-later safe regardless of the two timelines'
order. It also yields the staggered exit the design wants: the nested content
composition fully plays out (content-first), then the parent plays its outro
(background-last).

`drivesHold` (D-107) is honored automatically: the child's `ownContentWait()` is
already `drivesHold`-filtered, so an all-excluded child gets a zero-length hold and
self-settles fast → the parent does not wait on the excluded content.

## Decision: start stays self-driven (no double-start)

`startContentTree` is UNCHANGED — it still skips coordinator children. A content-driven
child self-starts its content at its own hold entry (it `drivesContent` because it is a
coordinator). The parent must NOT also start it (that would reset+start its drivers
twice). The parent only AWAITS the child's settle. So the change is purely on the WAIT
side (`aggregateContentWait`), not the start side.

## Decision: `aggregateContentWait` unifies the two aggregation sites

The module `contentTreeWait` and the inline `waitForContent` closure both aggregated
`own + non-coordinator descendants`. They now share `aggregateContentWait(ownWait,
instanceChildren)`: own wait + per child, EITHER the recursed `contentTreeWait` of a
non-coordinator child OR a coordinator child's `whenSettled()`. Mutual recursion
(`aggregateContentWait` ↔ `contentTreeWait`) reaches every depth, so a coordinator
grandchild under a non-coordinator child also drives the top parent.

## Risk: B-030 coupling and the loop-cycle edge

- **B-030** (the inverse) is a non-coordinator child set to a finite TIMED auto-out that
  stops its drivers on its own outro before completion, stranding the parent's captured
  `whenComplete()`. B-031 does NOT widen that: a content-driven child's `whenSettled`
  resolves exactly when it self-settles (after its content completes), so there is no
  orphaned promise. B-030 remains a separate, filed follow-up.
- **loop-cycle parent + content-driven nested child**: `whenSettled` is a single-resolve
  promise. A `loop-cycle` parent re-enters hold each cycle and would see the child's
  already-resolved settle on cycle 2+ (a zero-length hold). Out of scope here — B-031 is
  scoped to "nested content drives the parent" (the auto-out case in the repro + the
  decided design). Documented; not regressed (the prior behavior also did not loop a
  content-driven nested child per parent cycle).

## Preview half

`PreviewScopeTiming`'s per-scope content check (`hasOtherContentIn`, shallow) is replaced
by `hasAnyContentIn(doc, scene)`, which recurses nested `composition` instances (resolving
`scene.compositions`, cycle-guarded) — exactly like the inspector's `hasContentElement`.
The per-scope node carries `hasContent` (recursive); the per-ticker rows still use the
scope's OWN tickers (`tickersOf`, container-recursing only). So a nested-only parent is
offered the content-driven hold in the preview, while you still tune each scope's own
tickers in that scope.

## Tests

- **Runtime**: a content-driven parent holds for a content-driven nested child until it
  self-settles; `drivesHold:false` on the nested content opts it out (parent settles fast);
  the rewritten ticker-runtime test asserts an INFINITE content-driven nested child now
  holds the parent until `stop()`.
- **Preview**: `timingScopeList` marks a nested-only parent `hasContent: true`; a static
  nest stays `false`.
- **E2E**: the preview offers the content-driven hold source for a parent whose only
  content is nested.

## Out of scope

- The stop-vs-out split (D-105) — B-031 is strictly "nested content drives the parent".
- B-030 (the timed-auto-out nested-holder strand) — separate follow-up.
- loop-cycle parent re-arming a content-driven nested child's settle per cycle.
