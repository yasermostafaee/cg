## 1. Store + keyframe mutators

- [x] 1.1 Add `currentFrame: number` (default 0) to `DesignerStoreState` and a `setCurrentFrame(frame)` mutator that clamps to `[scene.frameRange.in, scene.frameRange.out]`
- [x] 1.2 Add `upsertKeyframe(elementId, property, frame, value)` that inserts (or replaces, on collision) a keyframe and keeps `keyframes` sorted by frame
- [x] 1.3 Add `moveKeyframe(elementId, property, fromFrame, toFrame)` that updates the frame index, re-sorts, and drops any keyframe it collides with on `toFrame`
- [x] 1.4 Add `removeKeyframe(elementId, property, frame)` that removes the keyframe and prunes the empty track / empty `animation` entry
- [x] 1.5 Add **track-aware** `commitAnimatable(elementId, property, value)` — routes to `upsertKeyframe` at the current frame whenever the property already has a track (any keyframes), otherwise writes the static value. This is what lets the operator build the animation by dragging
- [x] 1.6 Route the Inspector's eight animatable rows (and the Gizmo's drag/rotate/resize handlers, and the canvas drag-to-move) through `commitAnimatable`
- [x] 1.7 Add `selectedKeyframe` (elementId/property/frame) to the store with `setSelectedKeyframe`; clear it on scene change, element removal, removeKeyframe of the selected point, and selection change to a different element; follow it through `moveKeyframe`
- [x] 1.8 Add `setKeyframeValue` and `setKeyframeEasing` for the Keyframe Inspector

## 2. Timeline UI

- [x] 2.1 Create `apps/designer/src/renderer/features/timeline/` with `TimelineDock.tsx`, `FrameRuler.tsx`, `TrackRow.tsx`, `keyframe-helpers.ts`
- [x] 2.2 `keyframe-helpers.ts` exports the eight UI rows (label, `AnimatableProperty` id, current-value reader from an element) and the shared `LABEL_COL_PX` so the ruler and lanes share a horizontal coordinate system
- [x] 2.3 `FrameRuler` renders ticks every N frames + a draggable playhead; pointer events convert px → frame and call `setCurrentFrame`
- [x] 2.4 `TrackRow` renders one row per property: label cell on the left, lane on the right with one diamond marker per keyframe and an add-keyframe button; click-to-select drives the store's `selectedKeyframe`, drag-to-move calls `moveKeyframe`, and `Delete`/`Backspace` removes the selected keyframe
- [x] 2.5 `TimelineDock` wires the transport (play/pause/stop, step ±1) using a small frame-driver loop based on `scene.frameRate`; auto-loops at `frameRange.out`
- [x] 2.6 `TimelineDock` lays out as a 2-column grid so frame 0 in the ruler aligns with the left edge of every lane (the label column has no ticks)

## 3. Shell + canvas wiring

- [x] 3.1 Render `<TimelineDock>` in `App.tsx` between the issues row and the status bar when `scene !== null` (new `gridTemplateRows` slot)
- [x] 3.2 No canvas/preview changes: the iframe keeps auto-playing the scene; the Designer's `currentFrame` is the authoring cursor (per design.md)

## 4. Inspector switching

- [x] 4.1 New `KeyframeInspector.tsx` shows the selected keyframe's element / property / frame / value / easing with editable controls, plus a "Remove keyframe" button
- [x] 4.2 `InspectorPanel` switches to `KeyframeInspector` whenever `selectedKeyframe !== null`, falling back to the Element / Scene inspectors otherwise

## 5. Tests

- [x] 5.1 `apps/designer/tests/store-animation.test.ts` — covers upsert (new + collide), move (regular + collide), remove (last keyframe prunes the track), the track-aware `commitAnimatable` (static off-track, replace on-keyframe, insert on a new frame once a track exists), and the `selectedKeyframe` lifecycle

## 6. B-001 + B-002 follow-ups

- [x] 6.1 Split selection from "open keyframe inspector" — add `keyframeInspectorOpen` to the store and `openKeyframeInspector` / `closeKeyframeInspector` helpers; InspectorPanel only switches when the flag is on
- [x] 6.2 New `KeyframeIndicator` component (empty / has-track / at-frame / selected) and a shared `keyframeVariantFor` helper so the inspector indicator and TrackRow label indicator stay in lockstep
- [x] 6.3 Render the indicator next to each of the eight animatable rows in `TransformSection`; click toggles a keyframe at the current frame; controls grow an optional `trailing` slot
- [x] 6.4 TrackRow: single-click selects, double-click opens the Keyframe Inspector; row label shows property name + current value + indicator
- [x] 6.5 KeyframeInspector grows a "← back" button that calls `closeKeyframeInspector` (preserves selection)
- [x] 6.6 Designer-only theme overrides adopt the Loopic chrome palette (`#272b40`, `#24273d`, `#2e3247`); typography passes drops Inspector + Timeline rows to ~0.72rem with tabular-nums values
- [x] 6.7 Regression tests in `tests/store-animation.test.ts` — distinct values per keyframe (3 points keep 3 values; commit at frame 25 touches only that one), the `setSelectedKeyframe` → no inspector flip rule, the `openKeyframeInspector` flip, and the close-preserves-selection invariant

## 7. Validation

- [x] 7.1 `pnpm openspec validate add-animation-timeline-dock --strict` passes
- [x] 7.2 `pnpm --filter @cg/designer typecheck && lint && test` pass
- [x] 7.3 `pnpm --filter @cg/designer build` succeeds
