## Why

Per-keyframe easing was a five-option dropdown (linear / step / ease-in / -out /
-in-out). Operators need precise control over the interpolation curve — the
reference tool exposes a cubic-bézier editor with a draggable curve and P1/P2
control points. This change replaces the dropdown with that editor and teaches
the runtime to ease through a custom curve.

## What Changes

- **Schema:** add an optional `Keyframe.bezier` — a cubic-bézier `[x1,y1,x2,y2]`
  (CSS `cubic-bezier()` form). When present the runtime eases the outgoing
  segment through it; absent ⇒ the named `easing` is used (backward compatible).
  Add a shared `cubicBezierEase(p, t)` solver (Newton-Raphson + bisection, the
  browser approach) and `EASING_PRESETS` (linear / ease-in / -out / -in-out /
  sine) to `@cg/shared-schema` so the runtime and the Designer share one
  implementation.
- **Runtime + Designer interpolation:** both honor `keyframe.bezier` when set
  (the canvas preview and the played/exported output match). `step` still snaps.
- **Keyframe Inspector:** keep element / property / frame / value; replace the
  easing dropdown with a **Keyframe interpolation** editor — a Preset dropdown
  (Linear, Ease In, Ease Out, Ease In-Out, Sine, Custom), an SVG curve graph
  (PROGRESS × TIME) with two draggable control handles, and editable P1/P2 X/Y
  fields. Choosing a preset sets the curve; dragging a handle or editing a field
  marks it Custom. Time components (x1, x2) clamp to [0, 1].

## Capabilities

### New Capabilities

<!-- None. -->

### Modified Capabilities

- `designer-animation-timeline`: per-keyframe easing becomes a custom
  cubic-bézier curve edited via a graphical editor; the runtime eases through it.

## Impact

- **Schema:** `packages/shared-schema/src/animation.ts` — `BezierEasingSchema`,
  optional `Keyframe.bezier`, `cubicBezierEase`, `EASING_PRESETS`. No
  `schemaVersion` bump (additive optional field).
- **Runtime:** `packages/template-runtime/src/keyframe-eval.ts` — use the bézier
  when set.
- **Designer:** `features/timeline/keyframe-helpers.ts` (same in the canvas/value
  interpolation); `state/store.ts` (`setKeyframeBezier`, time clamp);
  new `features/inspector/EasingEditor.tsx`; `KeyframeInspector.tsx` swaps the
  easing dropdown for the editor.
- **Unchanged:** `@cg/vcg-format` (optional field serializes through), existing
  named-easing data.
- **Tests:** `shared-schema/tests/animation.test.ts` (solver: endpoints, linear
  identity, monotonic ease-in, presets valid); `apps/designer/tests/
store-animation.test.ts` (`setKeyframeBezier` clamps + clears).
- **Dependencies:** none.
