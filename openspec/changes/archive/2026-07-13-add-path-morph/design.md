# D-110 path morph — design

Owner decisions (2026-07-10, fixed): AE-style whole-shape snapshots, id-matched interpolation;
ONE "Path" timeline row (per-anchor rows rejected); Phase-1 scope = move anchors + handles only;
keyframing model identical to every other property (manual first keyframe, auto-record after);
Loopic reference layout (Path · Transform · Path style · Filter) with full easing on the path
track. Everything below implements those decisions — none of them is re-opened here.

## Recon facts the design builds on

- `KeyframeValueSchema = z.union([z.number(), HexColorSchema])`
  (`packages/shared-schema/src/animation.ts:99`); dispatch everywhere is `typeof`-based
  (`lerpValue` in `packages/template-runtime/src/keyframe-eval.ts:68-73`, apply-site guards in
  `animation-applier.ts`, the Designer's mirror `lerpKeyframeValue` in
  `apps/designer/src/renderer/features/timeline/keyframe-helpers.ts:180-185`). No `never`
  exhaustiveness check exists on value kinds — a new variant fails SILENTLY unless every
  dispatch site gains a branch; the tasks list enumerates all of them.
- `elements.ts` imports `animation.ts` (ElementBase carries `animation`), so `animation.ts`
  cannot import `AnchorPointSchema` from `elements.ts` — the anchor type must move to a leaf
  module both can import.
- The evaluator contract (`interpolateAtFrame`, keyframe-eval.ts:21-50): clamp before first /
  after last, per-keyframe OUTGOING easing, `step` snaps, `bezier` overrides named easing,
  zero-span segments snap to `next`. The Designer keeps a deliberate local mirror
  (`interpolateTrack`, keyframe-helpers.ts:147-172) because importing the runtime collides with
  the Designer's `Window.cg` typing.
- `buildPath` (`packages/template-runtime/src/scene-builder.ts:1084-1115`) renders
  `<div><svg viewBox=visualBBox preserveAspectRatio=none><path d=pathD(points,closed)>`;
  `pathD` (1042-1066) builds `M`/`C`/`L`/`Z` from handle deltas (`c1=a+a.out`, `c2=b+b.in`,
  both-absent ⇒ straight `L`).
- Track-aware editing: `commitAnimatable` (`state/slices/timeline.ts:324-337`) routes edits to
  `upsertKeyframe` when a track exists, else `writeStaticAnimatable`. The path edit overlay
  (`PathEditor.applyPoints`, canvas/PathEditor.tsx:158-164) currently always writes STATIC
  points via `normalizePathPoints` + `updateElement` (the bbox-reframe route).
- The D-051 registry (`inspector/field-registry.ts`) is the single source of timeline rows +
  inspector diamonds; `FIELD_REGISTRY.path = [...TRANSFORM, SHAPE_FILL, ...STROKE_DESCS,
...FILTER]`. `PropertyDescriptor.read` is typed `(el) => number | string`.
- Preview and both exports share one runtime (`createRuntime` → `applyAnimationAtFrame` →
  `interpolateAtFrame`); scenes serialize tracks verbatim (`JSON.stringify`), so a new plain-JSON
  value variant round-trips with zero exporter work.

## D1 — Snapshot representation: `{ kind: 'path', points: AnchorPoint[] }`

The keyframe value for the new `'path'` animatable property is a discriminated object holding
the ordered anchor array — each anchor exactly the element's `AnchorPoint` shape (stable `id`,
`x`/`y`, optional `in`/`out` handle DELTAS, `smooth`), in the element's local space:

```ts
export const PathKeyframeValueSchema = z.object({
  kind: z.literal('path'),
  points: z.array(AnchorPointSchema).min(2),
});
export const KeyframeValueSchema = z.union([z.number(), HexColorSchema, PathKeyframeValueSchema]);
```

- **Why an object, not a bare array:** the `kind` discriminant makes every dispatch site's new
  branch explicit (`isPathKeyframeValue(v)`), keeps the door open for Phase-2 metadata without
  another union change, and can never be confused with a future array-valued variant.
- **Why reuse `AnchorPoint` verbatim:** it is exactly the morph target D-109 designed
  (anchor-relative handle deltas survive transforms; ids are the reconciliation key). No second
  point format, no conversion layer. `smooth` rides along because edits captured from a snapshot
  must round-trip the editor's corner/smooth state; the interpolator itself ignores it for
  geometry.
- **Import-cycle resolution:** `AnchorPointSchema` (+ its doc) moves to a new leaf module
  `packages/shared-schema/src/path-points.ts` (depends only on `primitives.ts`); `elements.ts`
  and `animation.ts` both import it; `index.ts` re-exports it, so the public
  `@cg/shared-schema` surface is unchanged.
- Deep-copy on capture: the registry `read` for the path descriptor clones points, so a stored
  snapshot never shares object identity with `element.points` (undo/immutability safety).

## D2 — One shared interpolator in `@cg/shared-schema`

`lerpPathSnapshot(a, b, t)` and `pathKeyframeValuesEqual(a, b)` live in
`path-points.ts`, next to the schema — the same pattern as `cubicBezierEase` (the "single
bézier sampler" both sides already share). The runtime's `lerpValue` and the Designer's
`lerpKeyframeValue` each add one branch that delegates to it — the morph math exists ONCE, so
the canvas preview, the dock's value capture, and on-air playback cannot drift.

Interpolation rule (per owner decision 1 + the Phase-1 fallback):

- Result order = the LEADING (prev) snapshot's anchor order.
- An id in BOTH snapshots: lerp `x`, `y`; lerp `in`/`out` per-component with an ABSENT handle
  treated as the ZERO vector (a zero-length handle is geometrically the straight segment, so a
  corner↔smooth change morphs smoothly from/to straight). If both sides lack the handle it stays
  absent. `smooth` copies from the leading anchor (editor metadata, not geometry).
- An id ONLY in the leading snapshot: held at its leading value for the whole segment (it pops
  at the trailing keyframe's frame, where the trailing snapshot takes over via the evaluator's
  prev/next scan). An id ONLY in the trailing snapshot: not rendered during the segment; appears
  exactly at the trailing frame. Rationale: deterministic, crash-free, and the discontinuity
  lands ON a keyframe (where the operator made the structural change), never mid-segment.
- Easing is upstream of the lerp: the evaluator passes the EASED t (named preset / custom
  bézier / step) exactly as for numbers — path tracks get full easing for free, per owner
  decision 5.

`pathKeyframeValuesEqual` (id + coords + handles, numeric epsilon) extends the runtime's
`sameKeyframeValue` settle-scan so entrance-settle detection keeps working on path tracks.

## D3 — Runtime apply: interpolated points → `pathD`, fixed local space

`applyAnimationAtFrame` gains a `'path'` branch (path elements only): interpolate the track,
guard `isPathKeyframeValue`, write `d = pathD(value.points, source.closed)` on the inner
`<path>` — the SAME builder the static render uses, so closed/fill (`Z`, fill only when closed)
and stroke behavior hold by construction. `readAnimatedValues`' numeric collection ignores the
path track (object value fails its `typeof` guard — no change needed).

**Local space stays FIXED during the morph.** The `viewBox` remains the STATIC geometry's
`pathVisualBBox` and `transform.size` stays the static extents: snapshots are stored in the same
local space the static points live in, so a fixed viewBox renders them 1:1, and `size.w/h`
keyframes keep their render-stretch semantics (they stretch the box, morph included).
Recomputing the viewBox per frame would re-normalize every snapshot to fill the box and visually
cancel the morph. Consequence: a snapshot may exceed the static bbox, so `buildPath` sets
`overflow: visible` on the `<svg>` — unconditionally, not only when animated, because keyframe
presence must never change static rendering. Side effect (accepted, an improvement): a wide
stroke's overhang at the bbox edge is no longer clipped, matching how div-border strokes render
on every other element kind.

## D4 — Designer authoring: one descriptor, track-aware point edits

- **Registry (D-051):** one new descriptor `PATH_MORPH` — `property: 'path'`, new section
  `'Path'`, label `Path`, `read: (el) => deep-cloned snapshot of el.points`, `multiSelect:
false` (a whole-shape snapshot is not multi-editable), prepended to `FIELD_REGISTRY.path` so
  the row order matches the Loopic reference (Path · Transform · Path Style · Filter).
  `PropertyDescriptor.read`/`TimelineRow.read` widen from `number | string` to `KeyframeValue`.
  The diamond, timeline row, stopwatch parity, and keyframe capture
  (`addOrToggleKeyframeAtFrame` → `effectiveRowValue`) then work UNCHANGED — the one shared
  code path, per owner decision 4.
- **Value cells:** the timeline `ValueCell` and the Keyframe Inspector value field get a
  read-only branch for snapshot values (display `N pts`); numeric/color editing paths are
  untouched. `interpolateTrack`/`effectiveAnimatableValue` return types widen to
  `KeyframeValue`; the `effectiveNumberAt`/`effectiveColorAt` narrowings already typeof-guard.
- **Point edits route track-aware:** `PathEditor` reads the EFFECTIVE points for display and as
  the drag base — `effectivePathPoints(el, frame)` (the evaluated snapshot when a track exists,
  else static points) — so editing between keyframes starts from the interpolated shape.
  `applyPoints` branches:
  - NO path track → today's static route (`normalizePathPoints` + `updateElement`, bbox
    reframe included). Unchanged pre-D-110 behavior.
  - Track exists → `commitAnimatable(id, 'path', { kind: 'path', points })` with the RAW edited
    points — NO `normalizePathPoints`: the static base (and with it size / position / viewBox —
    the local space) must stay frozen while animated, otherwise every keyframe edit would
    re-anchor the space all other snapshots live in. `commitAnimatable` then updates-on-keyframe
    / auto-records exactly like transform (D-006 routing, owner decision 4).
  - Structural edits (insert/delete anchor, Alt-break) do NOT flow through this branch — they
    propagate to every point set per the structure lock (D9, owner reversal 2026-07-11).
- **Static writes:** `writeStaticAnimatable` gains a `case 'path'` (path elements only) that
  writes the snapshot's points through the normalize route — used when the last path keyframe
  is deleted and an edit then flows static again, keeping `commitAnimatable`'s contract total.
- **Static resize with a track:** `bakePathSize` additionally scales every path-track snapshot
  by the same per-axis factor (same map as the static points), so all keyframes stay in the one
  local space and `size==visualBBox` holds after the bake. (Without this, a static resize would
  silently shear every keyframed shape.)
- **Hit-test / overlay parity:** the canvas hit-test clone substitutes the effective points at
  the current frame for path elements with a path track (same helper), so clicking the MORPHED
  outline selects the element mid-scrub, matching what the iframe renders.

## D5 — Structure edits while keyframed (SUPERSEDED by D9)

~~Phase-1 rule: structural edits touch only the current frame's snapshot.~~ REVERSED by the
owner after verification (2026-07-11): the current-frame-only rule made keyframes drift to
different anchor sets in normal authoring, hitting the hold/pop fallback constantly. The AE-style
structure lock (D9) replaces it: insert/delete propagate to every keyframe + the static base, so
the anchor set is invariant and the fallback becomes a defensive guard only (D2/D6 keep it for
malformed external input — do not silently drop the runtime safety).

## D6 — Preflight

Ascending frames / non-empty tracks reuse the existing store + schema machinery untouched (the
path track is an ordinary `Track`). One NEW path-specific check in `Exporter.preflight`:
adjacent path keyframes whose anchor-id sets differ produce a WARNING
(`path-morph-anchor-mismatch`, per element, citing the frames) — the honest signal that the
segment will hold/pop instead of tween. Warning, not error: the fallback is defined behavior.
Post-D9 the Designer can no longer AUTHOR a mismatch, so this check is unreachable for
Designer-authored scenes — it stays as the loud defensive validation for hand-edited or legacy
`.vcg` input (owner decision 2026-07-11: keep, don't silently drop the safety).

## D7 — Export / round-trip

Nothing format-specific: the snapshot is plain Zod-validated JSON inside the existing
`Track`/`Keyframe` shape, scenes serialize verbatim into `.vcg` and single-file HTML, and both
exports execute the same runtime bundle whose evaluator gained the path branch (recon: one
runtime source, no export-time baking). Round-trip + parity are covered by tests, not new code.
`migratePathGeometry` (legacy anchors-bbox content) predates path tracks — legacy scenes cannot
contain them, and the migration is a no-op on new-convention content, so no snapshot
compensation is needed there; guarded by the existing migration idempotence tests.

## D8 — Live morph bounds for the gizmo box + Inspector W/H (owner decision 2026-07-11)

~~Phase-1 note: the gizmo/Inspector W/H reflect the static size while the shape morphs.~~
REVERSED after owner verification: for a path with a `path` track, the selection box and the
Inspector W/H follow the LIVE interpolated outline. **Why paths differ from other kinds** (and
why this stays path-specific): a rectangle/ellipse/text with animated position/scale has a
CONSTANT local box — its transform moves/stretches that box, and the gizmo already tracks the
effective transform. A morphing path is the one kind whose SHAPE (the local geometry itself)
changes over time; a static box around a mutating outline is simply wrong. Other kinds keep
their existing behavior untouched.

Mechanics:

- `effectivePathLocalRect(el, frame)` (keyframe-helpers, next to `effectivePathPoints`):
  `null` for non-paths / trackless paths; else the morphed outline's LOCAL-box-space rect —
  `pathVisualBBox(effectivePoints, closed)` mapped through the static-viewBox → evaluated-size
  stretch (`fx = sizeEff / max(staticVb, 1)`; identity under the size==visualBBox invariant with
  no size keyframes). ONE interpolation + one bbox per call; the gizmo, the Inspector, and the
  resize gesture each call it once per render/gesture tick — no per-anchor listeners, no layout
  observers, so scrubbing cost is O(anchors) per frame.
- **Gizmo:** `gizmoCornersOfRect(t, rect, zoom)` (geometry.ts; `gizmoCorners` delegates with the
  `[0,size]` rect) projects the OFFSET local rect through the SAME
  `localToScene`/Scale·Rotate-about-anchor map — the pivot stays `anchor⊙size_eff` (the true CSS
  transform-origin), which is what makes the rotated+morphing case correct (unit-tested). The
  B-042 layout quantization applies to the [0,size] path only — the live rect is a virtual
  overlay box, not an engine-laid-out edge.
- **Resize from the live box:** `computeRectResize(t, rect, handle, pointerScene)` (geometry.ts)
  generalizes `computeResize` to an offset rect: the pointer projects onto the rotated local
  axes against the FIXED rect corner → per-axis ratios r; commits `size = size_eff × r` (the
  track-aware route then either writes a size keyframe or `bakePathSize`, both of which scale
  the live extent by exactly r) plus the position compensation that keeps the fixed LIVE corner
  anchored under the post-bake pivot (`anchor⊙(size×r)`). Inspector W/H displays
  `effectivePathLocalRect.w/h` and converts a typed value the same way (`commit = size_eff ×
typed / live`), so type-in and drag agree.
- `writeStaticAnimatable`/`bakePathSize` semantics are UNCHANGED (base-size target) — the
  live→base conversion lives at the two commit sites, so every existing caller/test keeps its
  meaning.
- **Live hit-testing (same root as the live bounds):** the CanvasOverlay hit-test clone
  substitutes `effectivePathBoxPoints(el, frame)` — the evaluated anchors pre-mapped into BOX
  space (static-viewBox → evaluated-size stretch; identity for conforming content) — and
  `hitsPath` skips its own bbox re-derivation for keyframed paths (identity mapping): the
  morph renders through the FIXED static viewBox with overflow, so re-normalizing the morphed
  points' own bbox onto the box (the trackless mapping) would squeeze a grown outline back
  inside and clicks in the grown region would miss. Covers single-click selection AND
  double-click-to-enter-edit (all three `topmostHit` call sites use the clone); the
  PathEditor's segment hit-lines/affordances already run on the effective points. Audited
  remaining spatial targets: `drill.ts` (nested-composition child hits) tests children
  statically for ALL kinds/properties — a pre-existing, kind-agnostic behavior, not a D-110
  regression; snap targets and marquee stay box-based (documented in Known limits).

## D9 — Structure lock: insert/delete propagate to ALL keyframes (owner decision 2026-07-11)

A path's anchor set (ids + count) is IDENTICAL across the static base and every keyframe at all
times. What counts as STRUCTURAL (propagates) vs SHAPE (current frame only):

| Operation                              | Class      | Effect                                                                                                                  |
| -------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------- |
| Move anchor / drag handle              | shape      | current frame's snapshot only (replace-on-keyframe / auto-record) — this IS the morph                                   |
| Insert (Ctrl-click / Ctrl-drag / menu) | structural | one shared new id added to static + EVERY snapshot at the same parametric t on each set's own segment                   |
| Delete anchor                          | structural | the id removed from static + EVERY snapshot; below-2 deletes the element                                                |
| Alt-break (smooth→corner)              | structural | the `smooth` FLAG propagates (it declares handle-mirroring structure); handle VALUES stay per-keyframe (they are shape) |

Mechanics:

- Pure math in `state/path-structure.ts`: `splitSegment(points, segIndex, t, insert)` evaluates
  each set's OWN cubic at t (`c1 = a + a.out`, `c2 = b + b.in` — the same placement math the
  editor's nearest-point insert already used) and splices the new anchor; corner ⇒ no handles;
  `smooth-drag` ⇒ the shared drag-defined mirrored deltas; `smooth-tangent` (menu) ⇒
  tangent-aligned mirrored handles derived from THAT set's curve at t (direction = local
  tangent, magnitude = max(chord/6, 4) — the existing menu rule per set). Deliberately NOT a de
  Casteljau subdivision — same insert semantics the editor always had, now applied per set.
- Store actions (timeline slice, one `updateElement` each — one undo entry):
  `insertPathAnchorAll(elementId, segIndex, t, insert)`, `removePathAnchorAll(elementId, id)`,
  `setPathAnchorShapeAll(elementId, id, patch)` (the smooth-flag / insert-drag-handle
  propagation). Each applies the op to the static points and every snapshot, then RE-NORMALIZES
  the static base (`normalizePathPoints`) and shifts every snapshot by the SAME local-frame
  delta (`−vmin`): the normalize's position compensation is an affine identity of the local→
  scene map, so shifting all point sets together is render-neutral at EVERY frame while keeping
  the size==visualBBox invariant intact (bake, live bounds, and hit-test all rely on it).
- `PathEditor` routes insert/delete/Alt-break through these actions for BOTH the trackless and
  the keyframed case (trackless = static-only degenerate case, one code path); move/handle
  drags keep the D4 `commitAnimatable` route. `nearestOnSegment` now also returns the parametric
  t the split needs.
- The interactive Ctrl-drag smooth insert applies the corner insert once at pointer-down, then
  streams the drag's mirrored handles through `setPathAnchorShapeAll` per tick (history
  coalescing folds the gesture into one undo, exactly like anchor drags).

## D10 — Cross-app schema boundary (owner-reported 2026-07-11, root cause + guard)

The owner's runtime app REJECTED a Designer-exported morph `.vcg` ("Unpack failed: … received
'path'" against the pre-D-110 enum; the snapshot value failing `number|string`). Root cause —
NOT a second schema copy (audited: `AnimatablePropertySchema`/`KeyframeValueSchema` exist in
exactly one source, `animation.ts`; migrations hold no frozen snapshots; `vcg-format` does not
inline the schema): every consumer resolves `@cg/shared-schema` from its git-ignored compiled
`dist/` (package `exports` → dist; no src aliases), and the runtime APP additionally **bakes
the schema into its own built bundle** (`apps/runtime/dist/assets/index-*.js`) at build time.
The only scene validation on import is `SceneSchema.parse` inside `@cg/vcg-format`'s `unpack`
(reached via `verify`), so a runtime instance built or loaded BEFORE the schema rebuild
validates with the old enum and rejects the new track — a staleness class that recurs for
EVERY future animatable property unless guarded at the boundary.

Guards added (both drive the REAL import path, `produceTemplateDelivery` = verify → unpack →
standalone render):

- **Unit** `apps/runtime/tests/import-path-morph-vcg.test.ts` — packs a morph scene with the
  same `pack()` the Designer's Exporter uses and runs the runtime's delivery function; pins the
  dist-resolution chain (`pack()` itself parses with `SceneSchema`, so a stale dist fails on
  either side, loudly).
- **E2E** — the runtime E2E fixture scene (`tests/e2e/fixtures/runtime.ts`) now carries a path
  element WITH a morph track, so `import-vcg-template.spec.ts` pushes the newest animatable
  track through the BUILT app bundle (the baked schema) on every E2E run — the exact artifact
  class that failed for the owner.

The Designer-side round-trip tests never crossed this seam (they validated the Designer's own
parse); these two tests are the missing coverage. Operationally: a long-lived runtime dev
tab/preview predating a schema rebuild must be hard-reloaded/rebuilt — the tests make CI catch
the drift; a stale live SESSION is inherently a serve-time issue no test can reach into.

## Known limits (accepted)

- Differing anchor counts can no longer be AUTHORED (D9); external/malformed input still
  hold/pops per D2 — smooth different-count morphing stays Phase 2.
- `closed` is not animatable (not part of the snapshot).
- Snap targets, multi-select MOVE boxes, and box-marquee bounds still use the element's box
  transform (not the live morph rect) — only the single-selection gizmo and Inspector W/H are
  live per the owner decision; extend later if it grates.
