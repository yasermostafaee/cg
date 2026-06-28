# A content-driven nested composition drives its parent's hold (B-031)

## Why

D-104 made finite content inside a NON-coordinator nested composition drive its
content-driven parent's hold. But a nested composition that is itself
content-driven (a "coordinator") was UNCONDITIONALLY SKIPPED — the runtime's
`contentTreeWait` / the inline `waitForContent` aggregation guard with
`if (!child.isCoordinator)`, on the assumption it self-settles. So a parent whose
closing content lives inside a content-driven child never waits on it and its
background never closes (it holds until `stop()`). Compounding it, the preview's
per-scope content check (`hasOtherContentIn` in `PreviewScopeTiming.tsx`) was
SHALLOW — it did not recurse nested instances — so the parent was not even OFFERED
the content-driven hold in the preview (unlike the inspector's recursive
`hasContentElement`).

## What Changes

- **Runtime** — a content-driven (coordinator) nested child now DRIVES its parent's
  hold: the parent waits until the child has SELF-SETTLED (its content complete and
  its own outro played), honoring the child's per-element `drivesHold` (D-107). The
  child still self-starts and self-settles (no double-start; `startContentTree` is
  unchanged), giving the staggered content-first / background-last exit. An infinite
  content-driven nested child never settles, so the parent holds until `stop()`. A
  `manual` (non-coordinator) parent still never aggregates.
  - Mechanism: a reset-safe `ScopeNode.whenSettled()` (resolved in the child's
    `onSettle`, after its outro) — NOT the child's `whenComplete()` (which is
    re-minted per run on `reset()`, so capturing it early would orphan it). The
    aggregation (`aggregateContentWait`) pushes a coordinator child's `whenSettled()`
    and recurses a non-coordinator child as before.
- **Preview** — the per-scope content check recurses nested composition instances
  (matching `hasContentElement`), so a nested-only parent IS offered the
  content-driven hold.

No schema change (reuses D-107 `drivesHold`). Coordinated with B-030 (the inverse
timed-auto-out strand) — both touch the coordinator's child handling; B-031 is the
content-driven case, where the child's settle resolves at completion, so there is no
strand.

## Capabilities

- `designer-playout-lifecycle` (MODIFIED): the content-completion requirement now
  aggregates a content-driven nested child's self-settle (honoring `drivesHold`)
  instead of skipping it; the hold-control-offer requirement extends to the preview's
  per-scope timing.

## Impact

- `packages/template-runtime/src/runtime.ts` (`ScopeNode.whenSettled`, the settled
  deferred + `onSettle` wiring, `aggregateContentWait` / `contentTreeWait` /
  inline `waitForContent`).
- `packages/template-runtime/tests/nested-content-lifecycle.test.ts` (two new B-031
  tests) + `ticker-runtime.test.ts` (the "finite root self-settle past a nested
  infinite content-driven child" test is rewritten — that scenario now holds until
  `stop()`).
- `apps/designer/src/renderer/features/fields/PreviewScopeTiming.tsx` (recursive
  `hasAnyContentIn` / per-scope `hasContent`) + `tests/preview-scope-timing.test.ts`
  - a designer E2E (`nested-content-drives-parent-hold.spec.ts`).
- No schema change, no version bump.
