## 1. Store + keyframe mutators

- [x] 1.1 Add `currentFrame: number` (default 0) to `DesignerStoreState` and a `setCurrentFrame(frame)` mutator that clamps to `[scene.frameRange.in, scene.frameRange.out]`
- [x] 1.2 Add `upsertKeyframe(elementId, property, frame, value)` that inserts (or replaces, on collision) a keyframe and keeps `keyframes` sorted by frame
- [x] 1.3 Add `moveKeyframe(elementId, property, fromFrame, toFrame)` that updates the frame index, re-sorts, and drops any keyframe it collides with on `toFrame`
- [x] 1.4 Add `removeKeyframe(elementId, property, frame)` that removes the keyframe and prunes the empty track / empty `animation` entry
- [x] 1.5 Add `commitAnimatable(elementId, property, value)` that routes to `upsertKeyframe` when a keyframe sits at the current frame and otherwise to the matching static-value writer
- [x] 1.6 Route the Inspector's eight animatable rows (and the Gizmo's drag/rotate/resize handlers) through `commitAnimatable`

## 2. Timeline UI

- [x] 2.1 Create `apps/designer/src/renderer/features/timeline/` with `TimelineDock.tsx`, `FrameRuler.tsx`, `TrackRow.tsx`, `keyframe-helpers.ts`
- [x] 2.2 `keyframe-helpers.ts` exports the eight UI rows (label, `AnimatableProperty` id, current-value reader from an element)
- [x] 2.3 `FrameRuler` renders ticks every N frames + a draggable playhead; pointer events convert px → frame and call `setCurrentFrame`
- [x] 2.4 `TrackRow` renders one row per property: label cell on the left, lane on the right with one diamond marker per keyframe and an add-keyframe button; supports click-to-select a keyframe, drag-to-move, and `Delete`/`Backspace`-to-remove
- [x] 2.5 `TimelineDock` wires the transport (play/pause/stop, step ±1) using a small frame-driver loop based on `scene.frameRate`; auto-loops at `frameRange.out`

## 3. Shell + canvas wiring

- [x] 3.1 Render `<TimelineDock>` in `App.tsx` between the issues row and the status bar when `scene !== null` (new `gridTemplateRows` slot)
- [x] 3.2 No canvas/preview changes: the iframe keeps auto-playing the scene; the Designer's `currentFrame` is the authoring cursor (per design.md)

## 4. Tests

- [x] 4.1 `apps/designer/tests/store-animation.test.ts` — covers upsert (new + collide), move (regular + collide), remove (last keyframe prunes the track), and the "edit at keyframe updates keyframe, not static" rule

## 5. Validation

- [x] 5.1 `pnpm openspec validate add-animation-timeline-dock --strict` passes
- [x] 5.2 `pnpm --filter @cg/designer typecheck && lint && test` pass
- [x] 5.3 `pnpm --filter @cg/designer build` succeeds
