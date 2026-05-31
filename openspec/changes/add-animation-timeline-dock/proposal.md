## Why

The `@cg/shared-schema` keyframe model (M12.0) and the `@cg/template-runtime`
frame-driven applier (M12.1) already let a scene's elements interpolate their
position, size, scale, rotation, and opacity per frame. But the Designer has
no way to **author** these keyframes — operators can build a static scene but
cannot animate anything, which the PRD calls out as "the main role of this
app". D-006 closes that gap with a docked timeline below the canvas where the
operator scrubs frames and adds/edits keyframes on the selected element.

## What Changes

- Add an **Animation Timeline** dock to the Designer shell, rendered below the
  canvas whenever a scene is open. The dock contains a frame ruler covering
  `scene.frameRange.in..frameRange.out`, a transport (play/pause/stop/step) and
  a playhead the operator can drag to scrub.
- When a single element is selected, the dock shows a **track row per
  animatable property**: Position X, Position Y, Scale X, Scale Y, Rotation,
  Width, Height, Opacity (the eight properties called out in the PRD). Each row
  has a diamond "add keyframe" affordance.
- Clicking the diamond on a row adds a keyframe at the current playhead frame
  using the element's current value for that property; the keyframe appears as
  a diamond glyph on the row and is persisted into the element's
  `animation.tracks[property].keyframes` array (M12.0 schema).
- The operator can **drag** a keyframe horizontally to move it to another
  frame and **delete** the selected keyframe with `Delete`/`Backspace`.
- When the playhead sits exactly on a keyframe and the operator edits the
  property's value via the Inspector or the canvas Gizmo, that keyframe's
  `value` updates in place (no new keyframe is inserted).
- A new shared selection mode tracks the active **current frame** in the
  Designer store; the Canvas preview iframe reloads on frame change so the
  operator sees the interpolated state at any frame (the template-runtime's
  `applyAnimationAtFrame` already does the per-frame math).
- No schema, runtime, or bridge changes — the keyframe data model
  (`ElementAnimation`, `Track`, `Keyframe`) already exists and is what the
  runtime evaluates.

## Capabilities

### New Capabilities
- `designer-animation-timeline`: authoring per-element keyframes for the
  M12 animatable properties via a docked timeline below the canvas (frame
  ruler, transport, playhead, per-property track rows, add/move/delete
  keyframes, edit value-at-playhead through the Inspector).

### Modified Capabilities
<!-- None. designer-shapes is untouched: timeline applies to every element kind
     (shape, text, image), not only shapes. The M12 schema and runtime
     applier already support the interpolation. -->

## Impact

- **Code:** `apps/designer/src/renderer` only.
  - `state/store.ts` — add `currentFrame: number`, `setCurrentFrame()`, and
    keyframe mutators (`upsertKeyframe`, `moveKeyframe`, `removeKeyframe`).
  - `features/timeline/` (new) — `TimelineDock.tsx`, `FrameRuler.tsx`,
    `TrackRow.tsx`, `keyframe-helpers.ts`.
  - `App.tsx` — render `<TimelineDock>` between canvas/inspector and the
    status bar when `scene !== null`.
  - `features/canvas/CanvasArea.tsx` — pass `currentFrame` into the preview
    iframe reload so the canvas reflects the playhead position.
- **Unchanged:** `@cg/shared-schema`, `@cg/template-runtime`,
  `@cg/vcg-format`, the bridge, every storage path.
- **Tests:** new `apps/designer/tests/store-animation.test.ts` for the
  keyframe mutators; extend the timeline UI with a thin smoke test
  (`tests/timeline-dock.test.tsx`) covering the add/move/delete loop.
- **Dependencies:** none added (custom React/SVG timeline; the old codes
  used `vis-timeline`/Konva — intentionally not reused).
