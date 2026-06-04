## Why

Dragging a framepoint onto (or past) another point on the same track used to be
**destructive**: `moveKeyframe` filtered out the destination frame, so the
overlapped point was deleted, and because the drag moves frame-by-frame, dragging
_past_ a point silently removed it too. The operator wants the opposite — drag a
point onto another and **keep both** on the same frame, and stack more. Two
points on one frame with different values is also how you author an instant
**step** (jump) in a value.

The blocker was identity: a keyframe was addressed only by its `frame`, so two on
one frame couldn't be told apart (selection, the dragged-point tracking, and the
diamond's React key all collided). This change gives each keyframe a stable id —
just enough identity for the timeline to track and stack points.

## What Changes

- **Schema:** add an optional stable `id` to `KeyframeSchema`. Absent on scenes
  authored before this field (backward compatible); the Designer assigns ids on
  load and on create. The runtime ignores the id.
- **Store:** `upsertKeyframe` stamps a fresh id on each new keyframe; `setScene`
  normalizes any id-less keyframes on load. A new **`moveKeyframeById`** moves a
  specific point (by id) to a frame **without displacing** whatever is already
  there — so points stack. A stable sort keeps same-frame points in a defined
  order, which is what makes the instant step well-defined. The frame-based
  `moveKeyframe` (overwrite-on-collision) stays for the Keyframe Inspector's
  frame field.
- **Timeline UI:** diamonds are keyed by id (fixing the React key collision) and
  **fanned vertically** when several share a frame so each stays visible and
  grabbable; the drag uses `moveKeyframeById`.
- **No runtime change:** `interpolateAtFrame` already sorts by frame and ignores
  ids, so two same-frame keyframes interpolate up to the first value then jump to
  the second — the instant step — with no NaN/crash.

Selection, the point-icon toggle, value/easing edits, and delete stay
**frame-based** (unchanged). Stacked points therefore share frame-based selection
until pulled apart again — an accepted limitation for this pass.

## Capabilities

### New Capabilities

<!-- None. -->

### Modified Capabilities

- `designer-animation-timeline`: keyframes carry a stable id; dragging a point
  onto another keeps both (stacking) instead of overwriting, and stacked points
  fan vertically in the lane.

## Impact

- **Schema:** `packages/shared-schema/src/animation.ts` — `KeyframeSchema.id`
  optional. No `schemaVersion` bump (additive optional field).
- **Store:** `apps/designer/src/renderer/state/store.ts` — `freshKeyframeId`,
  `normalizeKeyframeIds` (applied in `setScene`), id on `upsertKeyframe`, new
  `moveKeyframeById`.
- **Timeline:** `features/timeline/TrackRow.tsx` — id-based diamond keys, vertical
  fan for stacked points, drag via `moveKeyframeById`.
- **Unchanged:** `@cg/template-runtime` (ignores id; already handles same-frame
  keyframes), `@cg/vcg-format` (optional field serializes through), selection /
  KeyframeInspector / indicators (frame-based).
- **Tests:** `apps/designer/tests/store-animation.test.ts` — id assignment,
  stack-on-collision keeps both, unstack; existing exact-match keyframe
  assertions relaxed to `toMatchObject` to tolerate the new id.
- **Dependencies:** none.
