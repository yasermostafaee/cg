# Multi-Select Number Fields: Drag + Realtime with Single-Undo Commit (D-053)

## Why

D-050 made multi-select number-field undo deterministic by DISABLING drag-scrub
and realtime updates: the field became type-to-edit (`commitMode='blur'` +
`deferCommit`), `onChange` was visual-only, and `applySharedProperty` ran inside
one `runAsSingleHistoryEntry` per committed value. That diverges from
single-selection UX — the owner's original ask was "like single selection,"
where a field scrubs by drag and updates live while editing. D-050's workaround
was needed only because the multi field wired `onChange → applySharedProperty`,
which wraps EVERY apply in a leading+trailing history boundary, so a live edit
spawned one undo entry per keystroke/tick.

Now that the cause is understood, the correct shape mirrors how single selection
already works: apply live during drag/typing WITHOUT a per-tick boundary (so the
burst time-coalesces in `store-core.set`'s COALESCE window), and set the history
boundary ONCE at the commit endpoint (drag release / Enter / blur). This restores
the single-selection feel while keeping each committed edit exactly one undo
entry.

## What Changes

- **Live multi-apply path (no per-tick boundary):** add a store action
  `applySharedPropertyLive(ids, property, value)` that fans `writeStaticAnimatable`
  over the selected ids WITHOUT `runAsSingleHistoryEntry`, so consecutive live
  writes coalesce in the COALESCE window exactly like the single-element drag.
  The existing boundary-wrapped `applySharedProperty` is KEPT for discrete
  one-shot commits (colour pick / gradient apply) that should each be one entry.
- **Commit boundary at the gesture endpoint:** the multi number field calls
  `markHistoryBoundary()` once at the commit/gesture endpoint — on drag-scrub
  release AND on the field's commit (Enter/blur) — so the whole drag/typing burst
  is ONE undo entry, isolated from the next edit. This mirrors the single
  canvas-drag pattern (ticks coalesce; boundary on pointerup).
- **Re-enable drag + realtime on the multi number fields:** remove D-050's
  `deferCommit` / `commitMode='blur'` from the multi fields. The field primitive
  becomes IDENTICAL to single selection — drag-scrub enabled, live `onChange` —
  with the live updates routed through `applySharedPropertyLive` and the commit
  through a new optional `onCommitBoundary` callback. The now-unused
  deferred-commit machinery (`commitMode`, `deferCommit`) is removed.
- **Keyframe-free, single untouched:** group editing still writes
  `writeStaticAnimatable` (no keyframes — diamonds and keyframe-aware group move
  are D-054). The single-selection path (`commitAnimatable`, its own scrub/commit)
  is unchanged — it passes no `onCommitBoundary`, so it keeps relying on
  time-coalescing as today.
- **Escape (reconciled):** in the live model each keystroke applies immediately,
  so Escape ends editing with the last live value (single-selection parity) and
  Ctrl+Z reverts the whole one-entry edit. This supersedes D-050's deferred
  "Escape discards" semantic, which the live model cannot honour.

## Capabilities

### Modified Capabilities

- `designer-multi-select`: update the "Mixed-value display and one-undo group
  edit" requirement — the multi number field now drag-scrubs and updates live
  (realtime, like single selection), applying each intermediate value to every
  selected element WITHOUT a per-tick boundary and committing ONE history
  boundary at the gesture endpoint (drag release / Enter / blur). All other
  requirements/scenarios (the shared-property editor across kinds, the per-shape
  selection boxes) are preserved verbatim. `designer-animation-timeline` is NOT
  touched (no keyframe-model change; group editing stays keyframe-free).

## Impact

- **State:** `state/slices/elements.ts` (`applySharedPropertyLive` — fan-out with
  NO boundary). `markHistoryBoundary` already exposed on the store.
- **Inspector:** `MultiSelectSection.tsx` (route live updates →
  `applySharedPropertyLive`, commit → `markHistoryBoundary`; drop `deferCommit`),
  `controls.tsx` (`RealtimeNumberInput`/`NumberField`: drop `commitMode`/
  `deferCommit`, add `onCommitBoundary`; `scrubHandle`/`fieldScrub` fire it on
  pointerup), `transform-fields.tsx` (`Seg`/`SingleField`/`FieldProps`: drop
  `deferCommit`, add `onCommitBoundary`; always render the scrub surface).
- **Tests:** designer units (store: live fan-out coalesces to one undo; updates
  apply during the gesture; mixed; keyframe-free; single unchanged) + jsdom
  render (typed edit updates elements live + one undo on commit, replacing the
  D-050 "visual-only until blur" test) + E2E `multi-select.spec.ts` (drag a
  shared field → both update live → release is one undo; typed live + Enter).
- **Docs:** `state/README.md` (the new live-apply action + boundary-on-commit
  model), and the inspector note describing the multi field's commit model.

## Out of scope

Keyframe-aware group move and the keyframe diamonds in the multi inspector
(single = keyframe-aware `commitAnimatable`; multi = keyframe-free
`writeStaticAnimatable`) — that is D-054. This change stays keyframe-free and
does not unify the two drag write-paths.
