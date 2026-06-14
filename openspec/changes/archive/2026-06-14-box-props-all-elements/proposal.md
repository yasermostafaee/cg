# Per-Corner Border Radius + Stroke for All Background-Capable Elements (D-042)

## Why

The owner's rule: anything that can have a background can have a border and a
radius. Today only **shapes** have a stroke and (a half-done) per-corner radius;
**text, ticker, clock, sequence** have a background but neither a stroke section
nor per-corner radius, and per-corner radius has no UI at all. The schema is also
half-done: `ShapeElement.cornerRadius` is `number | [tl,tr,br,bl]` but the other
kinds are `number`, the runtime only renders the tuple for shapes, and the
ANIMATED tuple path is broken for every kind (it serialises an array into one
`px` value). This change makes stroke + per-corner radius first-class box styling
on every background-capable kind and fixes the broken animated-tuple path.

## What Changes

- **Schema** (`@cg/shared-schema`): a shared `BoxStyleSchema` mixin (`stroke?` +
  `cornerRadius?: number | [tl,tr,br,bl]`) extended by text/ticker/clock/sequence
  (shape already has both). Background stays per-kind (`fill` for shape;
  `backgroundColor`/`backgroundFill` for the rest) — NOT unified. The per-corner
  toggle is the VALUE SHAPE itself (a `number` is uniform; a 4-tuple is
  per-corner) — no extra flag. `AnimatablePropertySchema` gains
  `cornerRadius.tl/tr/br/bl`. Existing `number` cornerRadius stays valid (union),
  so old scenes load unchanged.
- **Runtime** (`@cg/template-runtime`): `scene-builder` renders a 4-tuple
  border-radius and a static stroke border for the non-shape kinds (mirroring
  shape). `animation-applier` makes the cornerRadius path tuple-aware for ALL
  kinds via the four `cornerRadius.tl/tr/br/bl` sub-tracks, recomposed each frame
  (fixing the latent broken-tuple bug, shape included). `applyStroke` is NOT
  ungated for non-shape kinds — stroke animation stays shape-only (Option A;
  time-driven stroke/background animation remains D-052).
- **Registry + UI**: the `stroke.*` + `cornerRadius` descriptors (+ four
  `cornerRadius.tl/tr/br/bl` sub-descriptors) move into a shared "box" set
  included by all five kinds, so the right inspector, timeline-left, and
  multi-select all pick them up registry-driven. `StyleSection` adds the stroke
  section to the non-shape kinds and a per-corner toggle on the border-radius
  control (uniform input ↔ four side-by-side inputs, tl/tr/br/bl, each with its
  own keyframe diamond). Collapsing per-corner back to uniform drops the
  tl/tr/br/bl keyframe tracks in ONE undo (the B-014 orphan-track approach).

## Capabilities

### Added Capabilities

- `designer-box-styling` (NEW): the cross-cutting box-style behavior — the five
  background-capable kinds have stroke + per-corner radius; static border /
  four-corner render; the per-element per-corner toggle (value-shape); per-corner
  keyframing via sub-tracks; toggle→uniform track-drop; and the Option-A boundary
  that stroke animation stays shape-only.

### Modified Capabilities

- `designer-inspector-registry` (D-051): the "Keyframe-able styling for
  time-driven elements is deferred" requirement is carved out — ticker/clock/
  sequence now EXPOSE stroke (static) + cornerRadius, and cornerRadius (incl. the
  per-corner sub-tracks) is KEYFRAME-ABLE there; stroke ANIMATION and
  text/shadow/padding/background animation stay deferred to D-052. Repeater (no
  background) is unchanged (transform/opacity/filter only).

`designer-shapes` (the shape-tool spec) and `designer-animation-timeline` (the
keyframe model) are NOT touched.

## Impact

- **Schema:** `elements.ts` (BoxStyleSchema mixin on 4 kinds), `primitives.ts`
  (StrokeSchema reuse), `animation.ts` (4 sub-keys). `.vcg` carries the tuple via
  the existing schema-driven pack/unpack.
- **Runtime:** `scene-builder.ts` (non-shape tuple radius + border),
  `animation-applier.ts` (tuple-aware cornerRadius via sub-tracks).
- **Designer:** `field-registry.ts` (shared box descriptors + 4 sub-descriptors),
  `StyleSection.tsx` (stroke on non-shape + the per-corner toggle + track-drop on
  collapse). Timeline-left + multi-select inherit via the registry.
- **Tests:** schema/migration, runtime (static tuple + non-shape stroke +
  animated per-corner incl. the fixed shape case), toggle→uniform track-drop
  (B-014 class), registry presence across the five kinds (repeater none), E2E,
  and a `.vcg` round-trip carrying the tuple + non-shape stroke.
- **Docs:** `template-runtime/README.md`, the inspector/timeline READMEs, with
  the Option-A D-052 deferral noted.

## Out of scope (Option A — deferred to D-052)

Animating stroke or background on the time-driven kinds (ticker/clock/sequence) —
`applyStroke` is NOT ungated here. Adding background/stroke to repeater (it has no
background). Unifying the background field across kinds.
