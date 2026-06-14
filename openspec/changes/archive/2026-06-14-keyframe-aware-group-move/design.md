# Design — keyframe-aware-group-move

## Decision: Option B (unify), signed off

Group move AND group field edits become keyframe-aware — multi == single
selection, fanned out. Rejected Option A (only move + diamond clicks keyframe-aware;
field edits stay keyframe-free) because it makes the SAME property behave
differently between a field scrub and a canvas drag, and the diamond's filled
state would lie about what a field edit does. Under Option B the keyframe-free path
is simply what the shared `commitAnimatable` takes for un-animated members, so
D-053's behaviour is preserved for those members at no extra cost.

## Reuse, don't rewrite — the isolation strategy

`commitAnimatable` (`state/slices/timeline.ts`) is ALREADY the shared helper every
single path calls; it routes keyframe-at-`currentFrame`-vs-static internally. D-054
makes the GROUP paths call that same helper in a loop and changes NOTHING else:

- **Group move:** `beginGroupDrag` swaps `writeStaticAnimatable(m.id, 'position.x'|
'position.y', m.x|m.y + delta)` → `commitAnimatable(m.id, …)`. `m.x/m.y` come from
  `collectGroupMoveTargets` as `effectiveTransformAt(el, currentFrame)`, so the
  keyframe holds evaluated-start + delta (B-005-safe). Leading + trailing
  `markHistoryBoundary` already bracket the gesture → one undo. Per-tick upsert at
  the fixed `currentFrame` coalesces exactly like the static write did.
- **Field edits:** `applySharedPropertyLiveKeyframed` loops `commitAnimatable`
  instead of `writeStaticAnimatable`; otherwise byte-identical to D-053's
  `applySharedPropertyLive` (no per-tick boundary; the field's `onCommitBoundary`
  still sets ONE boundary on drag-release/Enter/blur). All multi number fields route
  through it, so `applySharedPropertyLive` (the keyframe-free one) is no longer
  called by any number field — it is RETAINED only for any non-keyframe-aware
  discrete use; the implementation report states which path each field uses.
- **Diamonds toggle:** a new multi helper wraps the EXISTING `togglePropertyKeyframe`
  (which captures the evaluated-at-playhead value, B-005) over the selection in ONE
  `runAsSingleHistoryEntry`.

### Single-path byte-unchanged guarantee

`commitAnimatable`, `togglePropertyKeyframe`, `upsertKeyframe`, the single-drag
handlers (`Gizmo.tsx`, `CanvasOverlay` single-body-drag), `TransformSection`, and
D-053's single-selection field path are NOT edited. The implementation report
includes a `git diff`/grep proof that these symbols are untouched. Regression risk
to single drag is therefore near-zero: new callers only.

## The third diamond variant

`KeyframeIndicator` gains `partial` alongside `empty`/`at-frame` — a distinct
colour (e.g. a dimmed/half tone) so a selection where SOME members are keyframed at
`currentFrame` and some are not is visually distinct from "all" and "none". The
single inspector never passes `partial` (one element is binary), so its appearance
is unchanged.

Aggregate rule (over the selected elements that EXPOSE the property):

- all have a keyframe at `currentFrame` → `at-frame`
- none have one → `empty`
- otherwise → `partial`

Toggle rule (one `runAsSingleHistoryEntry`): if all have a keyframe there → remove
from all; else → add to every member lacking one (existing evaluated-at-playhead
`togglePropertyKeyframe`/`upsertKeyframe`). So a click on `partial` or `empty` fills
the selection; a click on `at-frame` clears it.

## Diamond presence (gating)

A diamond renders for a shared property only when it is keyframe-able for EVERY
selected element instance, via the D-051 registry `isKeyframeable(el, property)`.
Non-keyframe-able or non-shared properties (e.g. a colour that is a gradient, or a
property a mixed-kind member can't keyframe) show no diamond — the single rule both
inspectors already obey. Group move stays position-only; non-transform shared-prop
diamonds (stroke/shadow/…) are field-edit-only.

## Risks / where it can go wrong

- **Coalescing:** confirm the keyframed live fan-out still collapses a drag/typing
  burst to one undo (upsert at fixed frame + no per-tick boundary + the commit
  boundary). Covered by unit tests.
- **Aggregate over heterogeneous selections:** compute the variant only over members
  that expose the property; a mixed-kind member that can't keyframe it suppresses the
  diamond entirely (presence gate runs first).
- **Toggle semantics on `partial`:** "add to missing" (fill) is the chosen rule;
  documented in the spec scenario so it can't drift.
