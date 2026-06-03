# Design — Single-click + multi-select keyframes

## Decisions

### 1. Add `selectedKeyframes` alongside `selectedKeyframe`
A single primary ref (`selectedKeyframe`) is still read by the many inspector
sections that thread it into `keyframeVariantFor` (which ignores it), so rather
than churn all of those, the multi-selection is a new `selectedKeyframes` array
that mirrors the primary as its last entry. The timeline highlight and the
Keyframe Inspector read the array; everything else keeps working.

### 2. Click opens; shift/ctrl adds
`openKeyframeInspector(ref)` now sets the selection to `[ref]` and opens the
inspector (single click). `addKeyframeToSelection(ref)` toggles a ref in the set
and keeps the inspector open (shift/ctrl click). Move/remove/clear all maintain
both the primary and the array (`syncSelectionAfterMove`, remove drops matching
refs and closes the inspector only when the set empties).

### 3. Inspector branches on count
One selected → the existing element/property/frame/value + easing editor. More
than one → only the easing editor (its `onChange` loops the selection and calls
`setKeyframeBezier` for each) and a "Remove keyframes" button (loops
`removeKeyframe`). The displayed curve seeds from the first selected point.

## Notes
- The older "single-click vs double-click" behavior lived in the still-pending
  `add-animation-timeline-dock` change (not the living spec); this change adds the
  new behavior. Reconcile the wording when that change is archived.
