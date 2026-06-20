# Design — selection overlay under scale + rotation (B-022)

## The one true transform

The renderer (`packages/template-runtime/src/scene-builder.ts`) lays each element out with
its border box at `position`, size `W×H` (unscaled), and
`transform: scale(sx,sy) rotate(deg)` about `transform-origin: anchor%`. CSS applies the
rightmost function first, so a local point maps as **Rotate first, then Scale**, both about
the anchor pivot. The hit-test (`hit-test.ts` `inverseToLocal`) inverts exactly this.

Forward map of a local point `p` (in the unscaled box, origin at `position`):

```
pivotLocal = (anchor.x*W, anchor.y*H)
pivot      = position + pivotLocal                 // scene
rel        = Rotate(deg) · (p - pivotLocal)         // rotate about anchor
scene      = pivot + (scale.x * rel.x, scale.y * rel.y)   // THEN scale, in scene axes
```

Because scale is applied **after** rotation in scene axes, a non-uniform scale of a rotated
rectangle is a **parallelogram**, not a rotated rectangle. Any overlay that bakes scale into
the box size and then rotates (a rectangle) cannot match it once `scaleX ≠ scaleY`. They
also disagree at rotation 0 whenever the anchor is not top-left.

## Resize under scale

`F(p) − F(q) = Scale · Rotate · (p − q)` (the pivot terms cancel). So to recover the new
size from the dragged-pointer vector `v = pointer − fixedCorner` (both scene):

```
v'    = (v.x / scale.x, v.y / scale.y)              // undo scale (scene axes)
Δlocal = Rotate(-deg) · v'                          // project onto local axes
Wn = |Δlocal.x| (freeW),  Hn = |Δlocal.y| (freeH)
```

Re-anchor so the fixed corner stays put: `position = fixedScene − pivotLocalNew −
(scale.x·ro.x, scale.y·ro.y)` where `ro = Rotate(deg)·(qf − pivotLocalNew)`. This is the
existing `computeResize` with two scale factors threaded in; at `scale = 1` it is identical
to today (all existing tests stay green).

## Rotate pivot

`pivotClientFromGrab` recovers the anchor's client position from the grabbed corner. The
corner's screen offset from the pivot is `zoom · Scale · Rotate · offLocal`, so the element
scale must multiply the rotated offset (it was missing). `scaleX`/`scaleY` default to 1 to
preserve the existing call sites/tests.

## Rendering the gizmo

Handles must stay **screen-sized** while sitting on the parallelogram's corners, so a single
CSS-transformed box won't do (it would shear/scale the handles). Instead `gizmoCorners`
projects the four corners + centre to screen space and the component positions each piece
independently:

- **Frame** — an SVG `<polygon>` through `tl → tr → br → bl` (the honest parallelogram
  outline). SVG is `position:absolute; overflow:visible` in the overlay's existing
  scene×zoom coordinate space.
- **Corner squares / hit areas, edge strips, rotate zones, centre pivot** — absolutely
  positioned at the projected points, centred via `translate(-50%,-50%)`; edge strips rotate
  to the edge direction (corner→corner); cursor angles derive from each piece's screen
  direction relative to the centre (replacing the rectangle-only `RESIZE_ANGLE` /
  `ROTATE_ANGLE` tables in the render path).

## Scope / non-goals

- `MultiGizmo` stays as-is: it is move-only and intentionally draws each member's axis-aligned
  box (no resize/rotate handles), so the parallelogram fidelity does not apply.
- No schema/runtime/export change; scale remains a separate animatable transform axis.
