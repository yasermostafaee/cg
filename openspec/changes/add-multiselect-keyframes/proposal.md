## Why

Opening a keyframe's detail required a double-click, and only one keyframe could
be selected at a time. Operators want a single click to open the inspector, and
they want to select several points and tune their easing together.

## What Changes

- **Single-click opens the inspector.** Clicking a keyframe diamond — or the
  segment line between two points (opens the start point) — selects it and opens
  the Keyframe Inspector. The double-click affordance is removed.
- **Multi-select.** Shift / Ctrl / Cmd + click adds (or toggles) a point in the
  selection; every selected point is highlighted in the timeline. `Delete`
  removes all selected points.
- **Batch easing.** With more than one point selected, the Keyframe Inspector
  hides the per-point frame / value / property fields and shows only the easing
  editor (applied to every selected point) and a **"Remove keyframes"** button.
  With exactly one selected it shows the full single-point detail as before.

## Capabilities

### New Capabilities
<!-- None. -->

### Modified Capabilities
- `designer-animation-timeline`: keyframe selection becomes single-click-to-open
  and multi-select, with batch easing in the inspector.

## Impact

- **Store:** `state/store.ts` — add `selectedKeyframes` (the full multi-selection;
  mirrors `selectedKeyframe` as the primary) + `addKeyframeToSelection`; move /
  remove / clear keep the whole set in sync.
- **Timeline:** `TrackRow` highlights every selected point; click opens the
  inspector, shift/ctrl-click multi-selects. `TimelineDock` Delete removes all
  selected and threads `selectedKeyframes`.
- **Inspector:** `KeyframeInspector` branches on selection count (single detail vs
  shared easing + "Remove keyframes"); `InspectorPanel`/`App` thread the array.
- **Shortcuts modal** updated (click opens; shift/ctrl-click adds).
- **Unchanged:** schema, runtime.
- **Tests:** `store-animation.test.ts` — open selects one, add/toggle, move keeps
  the set in sync, remove drops from the set.
