## Why

The Designer timeline has a **scene-duration row** with a right-edge gripper
that resizes the scene. Today that gripper calls
`designerStore.setSceneDurationFrames`, which rewrites `scene.frameRange.out`.
But `frameRange` does **double duty**: it is both the scene's *total* frame
count (it drives the ruler labels, the gridlines, and the playhead's px↔frame
scaling in `TimelineDock`) **and** the playback / export window (the runtime
loops `frameRange.in..out`). So dragging the gripper instantly shrinks the
whole timeline — the ruler collapses and the trailing frames disappear.

The reference tool (Loopic, see the recorded video noted in D-012) behaves
differently: resizing the scene layer narrows only the **played / exported**
window. The ruler keeps its full frame count, the trailing "remaining" frames
stay visible but inactive, and the total is not mutated while the operator
drags. D-012 brings that behavior to the Designer by splitting the two
concepts apart.

## What Changes

- **Schema:** add an optional `scene.activeRange: FrameRange` to
  `@cg/shared-schema` (mirrors the existing element `lifespan`). When absent,
  the active region is the full `frameRange` (backward compatible — existing
  scenes and `.vcg` packages keep working unchanged). Invariant:
  `frameRange.in ≤ activeRange.in ≤ activeRange.out ≤ frameRange.out` and
  `activeRange.out > activeRange.in`.
- **Roles split:** `frameRange` stays the canonical **total** scene length —
  it keeps driving the ruler, gridlines, playhead scaling, and the Inspector's
  Duration field. `activeRange` is the resized **play / export / preview**
  window.
- **Store:** the timeline gripper now calls a new `setActiveOutFrames(out)`
  that moves `activeRange.out` only (clamped to `[activeRange.in + 1,
  frameRange.out]`) and leaves `frameRange` untouched. The Inspector's Duration
  field keeps setting the total via `setSceneDurationFrames`, which now also
  clamps `activeRange` into the new total. Playback (play/step loop) and the
  authoring clamps use the active region.
- **Timeline UI:** the ruler/grid keep spanning the total `frameRange`; the
  scene bar now spans the **active region**, with its right gripper at
  `activeRange.out`. The trailing region `[activeRange.out, frameRange.out]` is
  rendered dimmed / hatched and is non-interactive. Keyframes beyond the active
  out-point still render on their lanes but are inactive.
- **Runtime / export / preview:** repoint the play range from
  `scene.frameRange` to `scene.activeRange ?? scene.frameRange`
  (`@cg/template-runtime` `runtime.ts:62`). Element `lifespan` gating is
  unchanged.

## Capabilities

### New Capabilities
<!-- None. -->

### Modified Capabilities
- `designer-animation-timeline`: adds the **scene active region** — a resizable
  play/export/preview window distinct from the scene's total frame count, so
  resizing the scene bar narrows playback/output while the ruler keeps the full
  frame count and the trailing frames stay visible but inactive.

## Impact

- **Schema:** `packages/shared-schema/src/scene.ts` — add optional
  `activeRange: FrameRangeSchema`. No `schemaVersion` bump (additive optional
  field; absent ⇒ full range). `newScene()` may set `activeRange` equal to the
  default `frameRange` for clarity.
- **Runtime:** `packages/template-runtime/src/runtime.ts` — `range` resolves to
  `scene.activeRange ?? scene.frameRange` (line ~62). Add/extend tests in
  `packages/template-runtime/tests/runtime.test.ts`.
- **Designer renderer:**
  - `state/store.ts` — add `setActiveOutFrames`; extend `setSceneDurationFrames`
    to clamp `activeRange`; route the play loop and `currentFrame`/keyframe
    clamps that gate output through the active region.
  - `features/timeline/TimelineDock.tsx` — `startSceneResize` calls
    `setActiveOutFrames`; scene bar spans the active region; render the dimmed
    inactive tail; ruler/grid stay on the total.
  - Preview path (`src/platform/preview.ts`) and any export trigger pass the
    active region through to the runtime.
- **Unchanged:** `@cg/vcg-format` (serializes `Scene` via the schema, so the
  optional field flows through), the bridge, storage paths, `designer-shapes`.
- **Tests:** store tests for `setActiveOutFrames` (clamp to total, total not
  mutated) and `setSceneDurationFrames` (clamps `activeRange`); runtime test for
  looping/output within `activeRange`; a timeline smoke test that the ruler
  total is unchanged after a resize and the tail renders inactive.
- **Dependencies:** none added.
