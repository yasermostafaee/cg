# Design — box-props-all-elements

## Spec home (decided)

`designer-shapes` is the shape-TOOL spec (add/move/resize/change-kind) — it does
NOT own stroke/cornerRadius, so there was nothing to "generalise" there. Box
styling lived scattered (the D-051 registry owns presence/keyframe-ability; the
element specs mention their own styling). So D-042 ADDS a new cross-cutting
capability `designer-box-styling` and MODIFIES `designer-inspector-registry`'s
time-driven deferral. `designer-shapes` and `designer-animation-timeline` are
untouched.

## BoxStyleSchema mixin

A shared `BoxStyleSchema = { stroke?: StrokeSchema, cornerRadius?: number |
[tl,tr,br,bl] }` is `.extend()`-ed onto text/ticker/clock/sequence (shape already
declares both with the same types). Background is NOT unified — shape keeps
`fill`, the others keep `backgroundColor`/`backgroundFill`. The set of
background-capable kinds is exactly {shape, text, ticker, clock, sequence};
repeater has no background and gets nothing.

### The toggle is the value shape — no extra flag

Uniform vs per-corner is represented by the cornerRadius VALUE: a `number` is
uniform, a `[tl,tr,br,bl]` tuple is per-corner. This is enough for persistence
(it's on the element) and round-trips through `.vcg` for free. The inspector
derives the toggle state from `Array.isArray(cornerRadius)`. The one edge —
"per-corner mode while all four values are equal" — is preserved because the
value stays a tuple until the operator collapses it; we do NOT auto-collapse a
tuple whose values happen to match. No `ui` hint field is added (confirmed
sufficient).

### Migration

`cornerRadius` becomes the union on the four kinds; an existing `number` is still
valid (the union accepts it), and kinds gaining `stroke` default to absent. Old
scenes load and render unchanged.

## Runtime

- **Static (scene-builder):** for the non-shape kinds, replace
  `border-radius: ${cornerRadius}px` with the tuple-aware branch shape already
  uses (`${tl}px ${tr}px ${br}px ${bl}px` for an array, scalar otherwise), and
  add the shape `border` CSS (`${width}px ${dashOn?'dashed':'solid'} ${color}`)
  for the non-shape kinds.
- **Animated (animation-applier):** today `cornerRadius` flows through
  `applyNumeric` (number-only → a tuple serialises to broken CSS, for every
  kind). D-042 replaces that with a recompose: read the four sub-tracks
  `cornerRadius.tl/tr/br/bl` (falling back to the static per-corner value, or the
  scalar, per corner) and write `border-radius: tl tr br bl` each frame. A
  uniform animated `cornerRadius` keeps working (all four corners read the single
  track). This path is ungated (cornerRadius animation already applied to all
  kinds), so it fixes shape's broken tuple AND enables per-corner on every kind.
- **Stroke animation:** `applyStroke` keeps its `if (src.type !== 'shape')
return` — NOT ungated. Time-driven stroke/background animation stays D-052.

## Registry + keyframing model

The `stroke.*` + `cornerRadius` descriptors move into a shared box descriptor set
included by the five kinds. Four new sub-descriptors `cornerRadius.tl/tr/br/bl`
(keyframe-able) drive the per-corner diamonds; they are present only while the
element is in per-corner mode (the registry `keyframeable`/presence predicate
reads the value shape). Stroke descriptors are marked keyframe-able ONLY for
shape (a `keyframeable: (el) => el.type === 'shape'` predicate) so the diamond is
hidden on the non-shape kinds (Option A — the runtime won't apply it). All three
consumers (right inspector, timeline-left, multi-select) follow from the registry
with no per-surface edits.

### Per-corner sub-track keyframing

`cornerRadius.tl/tr/br/bl` are added to `AnimatablePropertySchema`. A per-corner
keyframe writes the sub-track; the applier recomposes the tuple each frame. The
uniform `cornerRadius` track stays the single-value path.

### Toggle → uniform track-drop (B-014 class)

Collapsing per-corner → uniform must not leave orphaned, still-applied sub-tracks.
On collapse the inspector runs the existing keyframe-track clearing (the B-014
`clearOrphanColourTrack`/`clearKeyframeTrack` approach) for `cornerRadius.tl/tr/
br/bl` in the SAME store transaction as the value change, so one undo restores
both the per-corner value and its tracks.

## Risks / where it can go wrong

- The cornerRadius-union widening ripples through scene-builder, animation-applier,
  the registry `read`/`multiRead`, the inspector, and `.vcg` — all covered by
  tests incl. a round-trip.
- The animated-tuple recompose must fall back correctly per corner (sub-track →
  static per-corner value → scalar) so a partially-keyframed per-corner radius
  still renders the un-keyframed corners statically.
- Toggle/track-drop is the B-014 orphan-track failure mode; the regression test
  asserts one-undo restoration.
- Repeater must stay excluded (no background) — the registry must not gain box
  descriptors for it.

## Option A boundary (explicit)

`applyStroke` is NOT ungated for non-shape kinds in this change. Only cornerRadius
keyframing is carved out of the D-051 time-driven deferral; stroke animation +
text/shadow/padding/background animation on ticker/clock/sequence remain D-052.
