# Clearing the out-point reverts an out-point-dependent mode to manual (D-113)

## Why

`auto-out` and `loop-cycle` require an out-point: the inspector's mode select seeds a marker when one
of them is chosen, and the preview disables them (`NEEDS_OUTPOINT`) when no marker exists. But the
relationship was one-directional — clearing the out-point while in `auto-out` / `loop-cycle` left the
mode stranded, claiming an animated exit with no marker to start from (an impossible state). The
missing reverse invariant: clearing the out-point must revert such a mode to `manual`.

## What Changes

- **Designer store (`document.ts`)** — the single clear action `setLifecycle(null)` now, when the
  active composition's resolved mode is not `manual` (i.e. `auto-out` / `loop-cycle`), reverts the
  mode to `manual` in the SAME `set()` (one atomic undo step). No change when already manual; the
  rest of the playout (holdMs, repeat) is preserved; no auto-restore when an out-point is re-added.
  Every clear path (the inspector Clear button, drag-off, marker delete) routes through this action.

## Capabilities

- `designer-playout-lifecycle` (ADDED: the out-point ⇄ mode invariant — clearing the out-point
  reverts an out-point-dependent mode to manual).

## Impact

- `apps/designer/src/renderer/state/slices/document.ts` (the `setLifecycle(null)` branch).
- Tests: store/unit (`tests/store-lifecycle.test.ts` — revert in auto-out / loop-cycle, no-op in
  manual, single undo step) + a designer E2E (`outpoint-clear-reverts-mode.spec.ts`).
- Designer-only, no runtime / schema change, no version bump.
