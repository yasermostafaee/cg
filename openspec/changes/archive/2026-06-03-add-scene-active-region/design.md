# Design — Scene active region

## Decisions

### 1. Model the split as `frameRange` (total) + optional `activeRange` (window)
`frameRange` is already wired into the ruler, gridlines, playhead scaling, and
the Inspector Duration field, and it is what `newScene()` defaults to `[0, 50]`.
Re-purposing it would ripple through all of those. Instead we **keep
`frameRange` as the total** and **add** `scene.activeRange: FrameRange`
(optional) as the play/export/preview window.

- Mirrors the existing element `lifespan: FrameRange.optional()` precedent.
- **Backward compatible:** absent `activeRange` ⇒ the active region is the full
  `frameRange`. Existing saved scenes and `.vcg` packages validate and play
  unchanged, so no `schemaVersion` bump is needed.
- A single helper `activeRangeOf(scene) = scene.activeRange ?? scene.frameRange`
  is the one place renderer + runtime resolve the effective window.

Rejected alternative: making `frameRange` the *active* range and adding a
separate `totalFrames`/`displayRange`. It keeps the runtime untouched but
inverts the meaning of the field every existing call site reads, and makes the
Inspector Duration field (which operators think of as "the scene length")
ambiguous.

### 2. Invariant and clamping
`frameRange.in ≤ activeRange.in ≤ activeRange.out ≤ frameRange.out` and
`activeRange.out > activeRange.in`.

- The timeline gripper edits **`activeRange.out` only**, clamped to
  `[activeRange.in + 1, frameRange.out]`. It never touches `frameRange`, so the
  total is preserved during the drag.
- The Inspector Duration field edits the **total** (`frameRange.out`). When the
  new total is smaller than `activeRange.out`, the store clamps
  `activeRange.out` (and `.in`) down into the new total.

### 3. Only the right (out) gripper for now
The current scene bar exposes a single right-edge handle, and the reference
video only narrows the out-point. `activeRange.in` defaults to `frameRange.in`
(0). A left handle to set an active in-point is out of scope; the FrameRange
shape leaves room for it later without another schema change.

### 4. Scrub the full total, play within the active region
`setCurrentFrame` keeps clamping to the **total** `frameRange`, so the operator
can still scrub the playhead into the trailing frames to inspect them ("we can
see the remaining frames yet"). **Playback** (the play/step loop) and
**export/preview** are bounded by the active region: play loops back at
`activeRange.out`.

### 5. Kept-but-inactive trailing content
Keyframes whose frame is `> activeRange.out` are **kept** and still render on
their lanes; they are simply outside the played/exported window. The runtime
evaluates frames only within the active region, so those keyframes have no
effect on output until the active region is widened again — no data is
discarded on resize.

## Risks / migration

- **Runtime range repoint** (`runtime.ts:62`): switching `range` from
  `scene.frameRange` to `activeRangeOf(scene)` changes output bounds. Existing
  runtime tests that build scenes without `activeRange` are unaffected (fallback
  = full range); add explicit tests for the narrowed case.
- **`.vcg` round-trip:** `@cg/vcg-format` packs/unpacks `Scene` through the Zod
  schema, so the optional `activeRange` serializes automatically. Add a
  round-trip assertion if a vcg fixture is touched.
- **Store call sites:** any place that read `frameRange` to bound *playback*
  (the play loop, output clamps) must switch to the active region; places that
  bound *display/scrub* (ruler, grid, `setCurrentFrame`) stay on `frameRange`.
  Audit `store.ts` (~lines 455, 935) and `TimelineDock` during implementation.
