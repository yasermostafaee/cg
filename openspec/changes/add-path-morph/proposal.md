# Path morphing — per-point keyframe animation (D-110, owner decisions 2026-07-10)

## Why

D-110: the headline reason for the D-109 pen tool is animating custom outlines — one shape
smoothly becoming another. D-109 deliberately prepared for this (every anchor carries a stable
nanoid; handles are stored as anchor-relative deltas) and deferred the animation itself. The
owner has now fixed the model (2026-07-10): After-Effects-style whole-shape snapshots on a
SINGLE timeline row, id-matched per-anchor interpolation, the same keyframing/easing machinery
as every other property. Per-anchor timeline rows were explicitly rejected as unusable; fancy
different-count matching is explicitly out of Phase-1 scope.

## What Changes

- **Schema (`@cg/shared-schema`)** — `KeyframeValueSchema` gains a third variant: a **path
  snapshot** (the ordered anchor array — id, x/y, in/out handle deltas, smooth). A new
  `'path'` entry joins `AnimatablePropertySchema`. Existing numeric/color tracks are
  untouched; every exhaustive switch over keyframe-value kinds is updated.
- **Runtime (`@cg/template-runtime`)** — the track evaluator learns to interpolate two path
  snapshots: anchors matched by stable id tween x/y and in/out handle deltas along the
  segment's eased t (named presets, custom cubic-bézier, and `step` all apply — the same
  easing code path as numbers). The interpolated point set feeds the existing `pathD`
  builder each frame; closed/fill semantics and the size==visualBBox render model hold while
  points animate. An id present in only one of the two surrounding keyframes does not tween
  (honest Phase-1 fallback, defined in `design.md`); differing counts never crash.
- **Designer** — path elements get a single **Path** property row in the timeline (D-051
  registry descriptor, path kind only) with the standard diamond/stopwatch, keyframe lane,
  and easing (ƒ) affordances. Adding a keyframe captures the EVALUATED point set at the
  playhead through the same `TrackRow` code path every property uses. Point edits in the
  path edit overlay route track-aware (`commitAnimatable` semantics): no track → static
  points update as today; track exists → the edit lands as a snapshot keyframe at the
  playhead (update-on-keyframe / auto-record-between-keyframes — exactly the transform
  rule). Anchor ids are preserved by the edit overlay, so morphs stay matched.
- **Structure lock (owner reversal 2026-07-11 — supersedes the current-frame-only rule):** a
  path's anchor SET (ids + count) is identical across the static base and every keyframe at
  all times. Inserting a point adds ONE shared new id to every point set at the same
  parametric t on each set's own segment; deleting removes the id everywhere (below-2 still
  deletes the element); the Alt-break `smooth` flag propagates while handle values stay
  per-keyframe. Shape edits (move anchor / drag handle) still record only the current frame.
  Designer-authored scenes therefore always morph over matching sets; the runtime hold/pop
  fallback and the preflight mismatch warning remain as DEFENSIVE guards for
  hand-edited/legacy input only.
- **Live morph bounds (owner reversal 2026-07-11 — supersedes the static-bounds Phase-1
  note):** for a keyframed path, the selection gizmo box and the Inspector W/H follow the
  LIVE interpolated outline at the playhead (curve-aware bounds of the evaluated point set,
  composed with rotation/scale); resize gestures and typed W/H operate against the live
  extent. Path-specific — other element kinds keep their existing bounds behavior.
- **Export parity** — path tracks serialize through `.vcg` and single-file HTML unchanged
  (the snapshot is plain Zod-validated JSON) and evaluate through the same runtime, so
  preview == export by construction; round-trip is tested.

## Capabilities

- **`designer-path-element`** (MODIFIED): "Transform / opacity / filter / stroke animate
  like a shape" — the point set is now keyframe-able via the single Path track (supersedes
  the D-109 deferral text). ADDED: "Path shape morphs between snapshot keyframes" (runtime
  interpolation contract: id-matching, easing, defensive fallback, export parity), "A single
  Path timeline row authors the morph" (Designer authoring contract: one row, evaluated-value
  capture, track-aware point edits), "A path's anchor set is invariant across its keyframes"
  (structure lock — structural edits propagate), and "Selection bounds follow the live
  morphed shape" (live gizmo box + Inspector W/H for keyframed paths).

## Impact

- `packages/shared-schema/src/animation.ts` — path-snapshot keyframe value + `'path'`
  animatable property; `packages/shared-schema` tests.
- `packages/template-runtime/src/` — evaluator + applier (path snapshot interpolation →
  `pathD`); runtime unit tests.
- `apps/designer/src/renderer/features/inspector/field-registry.ts` — the Path descriptor
  (path kind only).
- `apps/designer/src/renderer/features/timeline/` — TrackRow evaluated-value capture for the
  path property (shared code path).
- `apps/designer/src/renderer/state/` — track-aware routing of point edits (store).
- `apps/designer/src/renderer/features/canvas/` — path edit overlay writes through the
  track-aware route while keyframed.
- Tests: schema round-trip, runtime interpolation units (pure move, corner↔smooth, easing,
  fallback), store auto-record units, E2E morph scenario.
- Docs: `packages/template-runtime/README.md`, timeline + canvas + state READMEs,
  `docs/engines/overview.md` (doc-sync); `docs/prd/designer.md` D-110; `docs/ROADMAP.md`.
