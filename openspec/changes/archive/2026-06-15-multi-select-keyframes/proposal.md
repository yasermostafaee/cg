## Why

Opening a keyframe's details required a double-click, and only one point could
be selected at a time. Operators want a single click to open the inspector and
the ability to select several points to ease them together.

## What Changes

- **Single click opens the inspector.** Clicking a keyframe point — or the
  segment between two points (opens it for the segment's start point) — selects
  it and shows the Keyframe Inspector. The old double-click requirement is gone.
- **Multi-select.** Shift/Ctrl/Cmd-clicking points accumulates them in the
  selection (toggle); every selected point is highlighted on the timeline.
- **Batch easing.** With more than one point selected, the inspector hides the
  per-point frame / value / property fields and shows only the easing (curve)
  editor; changing it applies to every selected point. The remove button reads
  "Remove keyframes" (plural).
- **Delete** removes every selected point.

## Capabilities

### New Capabilities

<!-- None. -->

### Modified Capabilities

- `designer-animation-timeline`: keyframe selection becomes click-to-open and
  multi-select, with the inspector showing shared easing for a multi-selection.

## Impact

- **Store:** `state/store.ts` — add `selectedKeyframes` (multi; mirrors the
  primary `selectedKeyframe`) and `addKeyframeToSelection`; selection follows
  moves and prunes on remove for the whole set.
- **Timeline:** `TrackRow` click opens the inspector / shift-click multi-selects;
  highlights every selected point; `TimelineDock` Delete removes all selected.
- **Inspector:** `KeyframeInspector` branches single vs. multi (multi = easing
  editor + "Remove keyframes"); `InspectorPanel`/`App` thread `selectedKeyframes`.
- **Unchanged:** schema, runtime, vcg.
- **Tests:** existing selection-lifecycle tests still pass (single-select API
  retained).
