# Design — Cubic-bézier keyframe easing

## Decisions

### 1. Additive optional `Keyframe.bezier`, runtime prefers it
Rather than replace the `easing` enum (which would break existing scenes and the
useful `step`), add an optional `bezier: [x1,y1,x2,y2]`. Interpolation order:
`step` snaps; else if `bezier` is set, ease through it; else use the named
`easing`. Absent ⇒ identical to before, so old `.vcg`/scenes are unaffected and
no `schemaVersion` bump is needed.

### 2. One shared solver in `@cg/shared-schema`
The Designer's keyframe-helpers deliberately don't import from
`@cg/template-runtime` (an ambient `Window.cg` typing clash). Both, however,
depend on `@cg/shared-schema`, so the bézier solver and presets live there —
single source of truth, no duplication. `cubicBezierEase` solves x(u)=t with
Newton-Raphson and a bisection fallback (the WebKit/CSS approach), clamping the
endpoints.

### 3. Editor works in bézier space; presets are named curves
The inspector always shows a bézier. When a keyframe has no `bezier`, the editor
seeds from the preset matching its named easing (`step` → linear visual). Editing
anything writes `keyframe.bezier`, after which the runtime uses the curve. The
Preset dropdown shows the matching preset name or "Custom" when the curve matches
none. Time components (x1, x2) clamp to [0, 1]; y is free within the [0,1] plot
for this pass (no overshoot handles yet).

## Risks
- **`.vcg` round-trip:** `bezier` is an optional tuple serialized by
  `@cg/vcg-format` automatically.
- **`step` in the new editor:** `step` isn't a bézier; it's dropped from the
  editor's presets (still valid in the schema/runtime for existing data). A
  step keyframe opened in the editor shows the linear curve until edited.
