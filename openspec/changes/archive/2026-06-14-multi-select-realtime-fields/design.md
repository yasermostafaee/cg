# Design — multi-select-realtime-fields

## Context (verified in code)

History grouping in `store-core.ts` is time-coalescing: `set()` pushes the prior
scene onto the undo stack only when `now() - lastSnapshotAt > COALESCE_MS`
(300 ms), so a burst of mutations within the window is ONE undo entry.
`markHistoryBoundary()` just resets `lastSnapshotAt = -Infinity`, forcing the
next mutation to snapshot. `runAsSingleHistoryEntry(fn)` wraps `fn` in a
leading + trailing boundary.

- **Single-element canvas drag** (`Gizmo.tsx`, `CanvasOverlay.tsx`) writes per
  tick WITHOUT a per-tick boundary (ticks coalesce) and calls
  `markHistoryBoundary()` on pointerup. THIS is the pattern D-053 mirrors.
- **Single inspector field scrub** (`controls.tsx runScrubGesture`) writes live
  via `onCommit` and sets NO boundary at all — it relies purely on coalescing.
  So "mirror the single drag's pointerup boundary" means mirror the CANVAS drag,
  not the inspector scrub (which has none).
- **The D-050 multi field** wired `onChange → applySharedProperty`, and
  `applySharedProperty` wraps the fan-out in `runAsSingleHistoryEntry` (a boundary
  before AND after). Fired per `onChange` keystroke/tick, that isolated EVERY
  keystroke into its own undo group — so D-050 set `commitMode='blur'` and dropped
  drag-scrub to make undo deterministic.

## D1. Live multi-apply path with no per-tick boundary

Add `applySharedPropertyLive(ids, property, value)` to `elements.ts`:

```ts
applySharedPropertyLive(ids, property, value) {
  for (const id of ids) designerStore.writeStaticAnimatable(id, property, value);
}
```

No `runAsSingleHistoryEntry`. Consecutive live calls (drag ticks / keystrokes)
land within COALESCE_MS, so the whole burst coalesces into ONE undo entry —
exactly like the single-element drag's per-tick `commitAnimatable` calls. The
boundary-wrapped `applySharedProperty` is KEPT for discrete commits (the colour
pick and gradient apply in `MultiSelectSection`), which should each be one entry.

This REVERSES D-050's type-to-edit trade-off (design.md D3 there): D-050 moved
the apply OFF `onChange` and wrapped each committed value in its own boundary;
D-053 puts the apply back ON `onChange` via a boundary-free fan-out and sets the
boundary once at the endpoint.

## D2. One history boundary at the gesture/commit endpoint

The multi field sets the boundary ONCE, at the endpoint, via a new optional
`onCommitBoundary?: () => void` prop that `MultiSelectSection` binds to
`markHistoryBoundary`:

- **Drag-scrub:** `scrubHandle`/`fieldScrub` (which own the whole-field gesture)
  call `onCommitBoundary` from `runScrubGesture`'s `onEnd` (pointerup) — mirroring
  the canvas drag's pointerup boundary.
- **Typing:** `RealtimeNumberInput` calls `onCommitBoundary` on blur (Enter blurs
  the input). A click-to-focus on the scrub surface also fires it via `onEnd`,
  acting as a leading boundary before typing — so a typed edit is bracketed
  leading + trailing and is fully isolated.

A trailing boundary per edit is sufficient to isolate the NEXT edit (it serves as
that edit's leading boundary). The first edit after load snapshots naturally
(`lastSnapshotAt = -Infinity`).

## D3. Re-enable drag + realtime; remove the deferred machinery

`MultiSelectSection` is the only consumer of `deferCommit`/`commitMode='blur'`, so
that machinery is removed entirely (no stale code):

- `NumberField`/`Seg`/`SingleField`: drop `deferCommit`; always render the
  drag-scrub surface (`fieldScrub`/`scrubHandle`); accept + forward
  `onCommitBoundary`.
- `RealtimeNumberInput`: drop `commitMode` and the deferred branches (the
  visual-only `onChange`, the blur-commit, the `discardRef` Escape path, the
  buffer-only arrow nudge). `onChange` commits live (as single already does);
  `onBlur` resyncs the buffer and fires `onCommitBoundary`; Escape resyncs +
  blurs (parity with single — no separate discard in a live model).
- `MultiSelectSection`: `applyNum` → `applySharedPropertyLive`; pass
  `onCommitBoundary={() => designerStore.markHistoryBoundary()}` on every number
  field. Colour/fill keep the boundary-wrapped `applySharedProperty` (discrete).

The field primitive is now IDENTICAL to single selection; the only multi-specific
wiring is the live fan-out target and the explicit commit boundary.

## D4. Single-selection parity and keyframe-freedom (unchanged)

Single selection passes no `onCommitBoundary` → no boundary is added anywhere, so
its scrub/commit behavior (live `commitAnimatable` + time-coalescing) is
byte-identical to today — verified by leaving `TransformSection`/`StyleSection`
untouched. Group editing still writes `writeStaticAnimatable` (keyframe-free); the
diamonds and keyframe-aware group move are D-054.

## Escape — reconciled with the PRD

The D-053 PRD draft inherited D-050's "Escape discards, no entry" clause. The live
model cannot honour it: each keystroke has already applied to every selected
element, and a multi "mixed" field has no single pre-edit value to restore. So
Escape matches single selection — it ends editing with the last live value, and
Ctrl+Z reverts the whole one-entry edit. The PRD acceptance and the spec scenario
are updated to this; recorded here per spec discipline.
