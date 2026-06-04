# Design — Stackable keyframes

## Decisions

### 1. Identity via an optional `id`, normalized in the editor

A keyframe gains an optional `id: string`. It's optional so existing scenes /
starter templates / `.vcg` packages still validate; the store's `setScene`
runs `normalizeKeyframeIds`, assigning ids to any keyframe that lacks one, so
in-memory keyframes always have one. `upsertKeyframe` stamps an id on create.
The id is an **editor** concern only — the runtime never reads it.

### 2. Stacking lives in a new `moveKeyframeById`, not in `moveKeyframe`

The destructive overwrite is intrinsic to a frame-addressed move. Rather than
change `moveKeyframe`'s contract (still used by the Keyframe Inspector's frame
field, where overwrite-on-collision is reasonable, and covered by tests), add
`moveKeyframeById(elementId, property, keyframeId, toFrame)` that relocates one
specific point and leaves everything else — including any point already on the
destination — untouched. The timeline drag calls this. A **stable** sort
(`Array.prototype.sort` is stable) keeps same-frame points in insertion order so
the step direction is defined.

### 3. Selection / edit / delete stay frame-based

Making selection id-based would ripple through `selectedKeyframe`'s shape across
the store, App, InspectorPanel, the three inspector sections, KeyframeInspector,
and TimelineDock. For this pass we keep them frame-based: the value is the
_drag_ behavior. Consequence: while two points sit on one frame they share
frame-based selection/delete; pulling one off by drag restores independence.
This is a deliberate, documented limitation, revisitable later.

### 4. Fan stacked diamonds vertically

Two diamonds at the same frame would render exactly on top of each other
(unclickable). The lane computes, per frame, how many points share it and each
point's slot, then offsets each diamond vertically around the row centre so all
are visible and grabbable.

## Why the runtime needs no change

`interpolateAtFrame` clamps before the first / after the last keyframe and
otherwise finds the first keyframe whose `frame > t`, interpolating from the
previous one with its outgoing easing. With two keyframes on frame X (sorted
stably as A then B): just below X it interpolates toward A; at X the "previous"
is B, so the value is B — an instant jump A→B. No division by zero (the equal-
frame pair is never the interpolating span because the loop picks the first
`frame > t`), no NaN. Verified by the runtime suite staying green.

## Risks / migration

- **`.vcg` round-trip:** `id` is optional and serialized by `@cg/vcg-format`
  automatically; older packages load and get ids assigned on load.
- **Test assertions:** exact `toEqual` on keyframe objects now also sees `id`;
  those assertions were relaxed to `toMatchObject` (value/frame/easing still
  checked, id ignored).
