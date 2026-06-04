## 1. Schema

- [x] 1.1 `BezierEasingSchema` + optional `Keyframe.bezier`
- [x] 1.2 Shared `cubicBezierEase(p, t)` solver + `EASING_PRESETS`

## 2. Interpolation

- [x] 2.1 Runtime `keyframe-eval` eases through `bezier` when set (step still snaps)
- [x] 2.2 Designer `keyframe-helpers` interpolation mirrors it (canvas / value)

## 3. Store

- [x] 3.1 `setKeyframeBezier(elementId, property, frame, bezier|null)` — set/clear,
      time components clamped to [0,1]

## 4. UI

- [x] 4.1 `EasingEditor.tsx` — preset dropdown, SVG curve graph with two draggable
      handles + connector lines, P1/P2 X/Y fields
- [x] 4.2 `KeyframeInspector` keeps element/property/frame/value; swaps the easing
      dropdown for `EasingEditor` (seeds the curve from the named easing when no
      bézier is set)

## 5. Tests + gate

- [x] 5.1 `shared-schema/tests/animation.test.ts` — solver endpoints, linear
      identity, monotonic ease-in, presets valid
- [x] 5.2 `apps/designer/tests/store-animation.test.ts` — `setKeyframeBezier`
      clamps + clears
- [x] 5.3 Green gate: typecheck + lint + test + build for `@cg/shared-schema`,
      `@cg/template-runtime`, `@cg/designer`
- [x] 5.4 `pnpm openspec validate add-bezier-easing --strict`
