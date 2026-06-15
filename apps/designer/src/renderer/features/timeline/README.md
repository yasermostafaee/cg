# Animation timeline — the model + the authoring surface

How keyframe animation is **modelled** (`@cg/shared-schema`) and **authored** (the
Designer's timeline dock + keyframe inspector) — how they're **built** and the
**extension points** for adding an easing or a new animatable property. For the
platform-wide picture see
[`docs/engines/overview.md`](../../../../../../docs/engines/overview.md); for the
canvas it sits beneath, see
[`../canvas/README.md`](../canvas/README.md).

- **This doc = _how it's built_ (model + authoring).** The runtime side — how a
  keyframe track is **evaluated** per frame (interpolation, easing sampling, the
  FrameDriver/PlayoutController) — is the
  [`@cg/template-runtime` deep-dive](../../../../../../packages/template-runtime/README.md);
  don't duplicate it here.
- **The behavioural contract (WHEN/THEN)** lives in the OpenSpec specs/changes
  (`designer-animation-timeline`, `animation-lifecycle-timing`, the D-007/D-010 and
  B-00x change folders) — don't duplicate it.
- **Pure math is unit-tested; the React layer is E2E-tested** (see
  [Testing](#testing)).

## The animation model (`@cg/shared-schema/animation.ts`)

The data model is keyframe-based (Phase 9 / M12), replacing the v1 preset model.
Every animatable property carries its own ordered keyframe list; the runtime
interpolates between adjacent keyframes at the playhead frame.

```
ElementAnimation
  └─ tracks: Partial<Record<AnimatableProperty, Track>>   // property → its keyframes
                                   │
                                   ▼
        Track = { keyframes: Keyframe[] }                  // .min(1) — non-empty
                                   │
                                   ▼
        Keyframe = { id?, frame, value, easing, bezier? }
```

| Type                 | Shape / contract                                                                                                                                                          |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Keyframe`           | `frame` (int ≥ 0), `value` (number **or** `#RRGGBB[AA]`), `easing`, optional custom `bezier`, optional stable `id`.                                                       |
| `Easing`             | `linear · step · ease-in · ease-out · ease-in-out` — the keyframe's **outgoing** curve (per-keyframe, so adjacent points can differ).                                     |
| `BezierEasing`       | `[x1,y1,x2,y2]` CSS `cubic-bezier()` form (P0=(0,0), P3=(1,1)). When present it **overrides** the named `easing` (except `step`, which snaps).                            |
| `Track`              | `keyframes: Keyframe[]` (`.min(1)`); frames are kept **strictly ascending** by the editor (the runtime stable-sorts and Designer's preflight surfaces violations).        |
| `AnimatableProperty` | The enum of property paths the runtime can write (transform/opacity + D-010 numeric styles + colours). **The contract between schema, timeline UI, and runtime applier.** |
| `FrameRange`         | Scene-level `{ in, out }` — the playhead loops `in → out`; the dock sizes its ruler from it.                                                                              |

**Value space is deliberately narrow** — numbers and hex colours only. Booleans,
asset ids and select-strings don't interpolate (a toggle is a `step`-eased 0/1
track). Two keyframes may share a `frame` (an instant "step"): the stable `id`
lets the editor track and stack them; the runtime sorts by frame and jumps from
the first value to the second.

`animation.ts` also exports `cubicBezierEase(p, t)` — the Newton-Raphson +
bisection solver browsers use for CSS `cubic-bezier()`. It is the **single bézier
sampler** shared by the runtime evaluator and the Designer's display-time
interpolation ([`keyframe-helpers.ts`](keyframe-helpers.ts)); the timeline's curve
_editor_ only positions handles (see below), it does not re-implement the solver.

## The authoring surface

```
TimelineDock ── element tree · ruler · zoom · scene/out markers ───────────┐
  ├─ FrameRuler        tick labels + draggable playhead (scrub)            │
  ├─ ElementRow        per-layer lifespan bar                              │
  └─ TrackRow (×N)     one animatable property:                           │ math →
        [ label │ live value │ ◆ indicator ] │ lane with keyframe diamonds │ timeline-
            │ add/toggle/drag/select/stack/context-menu                    │ geometry.ts
            ▼                                                              │ (pure,
        designerStore  (upsert/move/remove/select keyframe)               │  unit-tested)
                                                                          ┘
KeyframeInspector ── selected point(s): frame · value · EasingEditor ──────┐ math →
  └─ EasingEditor      bézier curve + draggable P1/P2 handles + presets     │ easing-
                                                                           ┘ geometry.ts
```

Layout mirrors the Loopic reference: a left **label column** (element tree →
property groups → rows) and a right **lane area**, kept in vertical lockstep by a
single `translateY` (see `TimelineDock.syncScroll`). The per-kind property groups
(`timelineGroupsFor` in `keyframe-helpers.ts`) are **generated from the central
field registry** (D-051) — the same source the right inspector and the multi-select
editor read — so the timeline shows a diamond for exactly the keyframe-able set and
right/left stays in parity by construction (see
[`inspector/field-registry.ts`](../inspector/field-registry.ts)). D-054 — the
multi-select editor now renders the SAME `KeyframeIndicator` for each property
keyframe-able across the whole selection, with a third **`partial`** variant (some
selected keyframed, some not) on top of `empty` / `at-frame`; clicking it toggles
keyframes across the selection in one undo (`MultiKeyframeDot` in
[`inspector/keyframe-diamond.tsx`](../inspector/keyframe-diamond.tsx)). D-042 — the
shared box descriptors (stroke + border radius) are declared once and included by
the five background-capable kinds (shape/text/ticker/clock/sequence), so each gets
the rows automatically; the uniform `cornerRadius` row shows in uniform mode and
the four `cornerRadius.tl/tr/br/bl` rows in per-corner mode (the registry's
`keyframeable` predicate reads the value shape), while stroke is keyframe-able only
on shapes (Option A). The dock deliberately does
**not** subscribe to `currentFrame` — the playhead, the frame readout and each
row's live value are **self-subscribing leaves** (`RulerPlayhead`,
`BodyPlayhead`, `FrameReadout`, `TrackRowLabel`), so a playback tick re-renders
only the moving parts, not the whole tree.

### Time ↔ pixel — the crux of every gesture

Two pixel spaces meet on the lane, and the conversions are all pure in
[`timeline-geometry.ts`](timeline-geometry.ts):

| From → to                  | Function                           | Used by                                                                 |
| -------------------------- | ---------------------------------- | ----------------------------------------------------------------------- |
| pointer `clientX` → frame  | `frameFromClientX` (clamp + round) | ruler scrub, keyframe drag — **snap-to-frame is the `Math.round`**      |
| frame → left offset %      | `frameToPct` / `frameToPctClamped` | diamonds, ticks, playhead / draggable markers                           |
| pixel delta → frame delta  | `deltaFramesFromPx`                | Scene-active-region + out-point marker drags (continuous, store clamps) |
| visible frames → tick step | `pickStride` (1/2/5/10/25 ladder)  | ruler labels **and** body gridlines (one stride keeps them aligned)     |

Position is a **percent of span** because the lane/ruler inner wrappers are
`width: zoom × 100%`, so a percent left-offset stays correct at every zoom
without re-measuring. `frameSpan` floors the range at 1 so a zero-length scene
never divides by zero.

### Keyframe authoring — diamond, drag, stack, select

- **Add via the diamond** (`addOrToggleKeyframeAtFrame` in `TrackRow.tsx`) — the
  single path for every property kind. Adding **captures the evaluated value at
  the playhead** (`effectiveRowValue`, exactly what the row readout shows and the
  canvas renders), **not** the element's static base. Reading the static base is
  the root cause of the diamond-reverts-position jump (B-005/B-007) — keep this
  invariant. Clicking an existing diamond's frame toggles it off.
- **Drag** a lane diamond → `frameFromClientX` gives the new (snapped) frame; the
  point moves by `id` (`moveKeyframeById`, stacking-aware) or by frame for legacy
  id-less points. Listeners live on `window`, not the diamond, because React
  unmounts it mid-drag as the lane re-renders.
- **Stack** — points sharing a frame are fanned vertically so each stays grabbable:
  `buildKeyframeStacks` counts per frame + indexes each id; `stackOffsetPx` centres
  the fan.
- **Select** — single-click selects + opens the Keyframe Inspector and scrubs to
  the point; shift/ctrl-click multi-selects (`isKeyframeSelected` drives the lane
  highlight); the segment line between two points uses `segmentPct`.

All edits go through the **store** (`upsertKeyframe` / `moveKeyframe[ById]` /
`removeKeyframe` / `commitAnimatable` / selection) — the components never mutate
the scene. Those mutations (insert-sorted, move-with-collision, stacking, the
track-aware `commitAnimatable` routing, selection follow/clear) are unit-tested in
[`tests/store-animation.test.ts`](../../../../tests/store-animation.test.ts); this
doc doesn't restate them.

### Easing curves / bézier handles (`EasingEditor`)

The Keyframe Inspector edits a point's outgoing curve. `EasingEditor.tsx` renders
a cubic bézier in **curve space** (both axes 0→1; x = normalized time, y = eased
progress) inside a padded SVG; the handle/preset math is pure in
[`../inspector/easing-geometry.ts`](../inspector/easing-geometry.ts):

- `curveToScreenX/Y` map curve→screen (**y flips** — SVG y grows down, progress
  grows up); `screenToCurve` inverts a handle drag back, clamping into the plot.
- `bezierPathD` builds the SVG path; `presetKeyFor` / `bezierApproxEqual` match the
  current curve against `EASING_PRESETS` for the dropdown; `effectiveBezier` picks
  the curve to _show_ for a keyframe (custom → named preset → linear for `step`).

The editor writes `bezier` to the keyframe via `setKeyframeBezier`; the runtime
then samples it with the schema's `cubicBezierEase`. **The editor positions the
curve; the schema solves it** — one solver, no drift.

## Contracts / invariants

- A track's keyframes are **strictly frame-ascending**; the store keeps them
  sorted on insert/move.
- The diamond/value-cell **captures and displays the evaluated value at the
  playhead**, never the static base (B-005/B-006/B-007).
- `bezier`, when set, **overrides** the named `easing` everywhere except `step`.
- `timeline-geometry.ts` and `easing-geometry.ts` are **pure** (no React, no store,
  no DOM) — that's what makes them unit-testable and keeps this doc honest. The
  React layer only wires pointer events to these functions and to store mutations.

## Extension points

> Adding user-facing timeline behaviour? Add/extend an E2E test (see the rule in
> [`CLAUDE.md`](../../../../../../CLAUDE.md)) and put any new math in
> `timeline-geometry.ts` / `easing-geometry.ts` with a unit test. Update this doc
> when structure/contracts change (doc-sync rule).

### Add a new easing

1. Add the key to `EasingSchema` in
   [`animation.ts`](../../../../../../packages/shared-schema/src/animation.ts) **iff**
   it's a _named_ curve (most new curves are just a preset and need no enum change).
2. Add its control points to `EASING_PRESETS` — this surfaces it in the
   `EasingEditor` dropdown (via `presetKeyFor`) automatically.
3. Teach the **runtime applier** to honour it if it's a new _named_ easing (a pure
   preset is already handled by `cubicBezierEase`). See the
   [template-runtime deep-dive](../../../../../../packages/template-runtime/README.md).

### Add a new animatable property

This spans three layers (schema → field registry → runtime applier) — see the
"Where features go" map in [`CLAUDE.md`](../../../../../../CLAUDE.md):

1. **Schema** — add the path to `AnimatablePropertySchema` in `animation.ts`.
2. **Field registry (D-051)** — add ONE `PropertyDescriptor` to the right kind(s)
   in
   [`inspector/field-registry.ts`](../inspector/field-registry.ts) with its
   `section`, `label`/`timelineLabel`, `read`, `keyframeable?` predicate, and
   `multiSelect?`/`unit`/`factor`. This is the **single source** for keyframe-ability
   - inspector-field presence: `timelineGroupsFor`/`TIMELINE_ROWS` here, the right
     inspector's `KeyframeDot`, and the multi-select editor all read from it — so the
     diamond, label, lane, and right/left parity follow automatically. No `TrackRow`
     or per-file list change is needed.
3. **Runtime applier** — teach the apply-step to write the interpolated value back
   to the DOM (the runtime side, **not** this package). See the
   [template-runtime deep-dive](../../../../../../packages/template-runtime/README.md).

A property declared in the schema + registry but not the applier will animate in the
dock's value readout but not on air — all three steps are required. (D-052 closed this
for the time-driven kinds: ticker/clock/sequence now keyframe stroke / text colour /
background / shadow — and clock/sequence padding — via the registry + the un-gated
appliers. Ticker padding stays deferred, and repeater has no background.)

## Testing

- **Unit (pure logic):** `timeline-geometry.ts` and `inspector/easing-geometry.ts`
  are in the Vitest coverage scope (`apps/designer/vitest.config.ts`). See
  [`tests/timeline-geometry.test.ts`](../../../../tests/timeline-geometry.test.ts)
  and [`tests/easing-geometry.test.ts`](../../../../tests/easing-geometry.test.ts).
  Store-level keyframe mutations are covered by
  [`tests/store-animation.test.ts`](../../../../tests/store-animation.test.ts); the
  bézier **solver** by `@cg/shared-schema`'s tests.
- **E2E (the React/interaction layer):** the Playwright suite drives the real dock —
  the keyframe diamond (`addKeyframeViaDiamond`), drag, scrub, easing — so the
  components themselves aren't chased for unit coverage.
