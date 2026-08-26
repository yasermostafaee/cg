# Fix the Live Source overlap rule firing on floating-point residue (`B-180`)

## Why

Two Live Source plates can overlap by an amount the author **cannot see, cannot read and cannot drag
away** — and the Export is refused for it. `B-180` measures the class: the overlap predicate is a
strict `<` over pure floating-point rects with no epsilon anywhere, and ordinary authoring actions
manufacture residue nobody typed. A composition instance's `preScale = size.w / comp.resolution.width`
is a division; the arrangement flattener's `fitAffine` is a division; and, until this change, every
drag committed `startPos + clientDelta / scale` — a third one.

The Inspector rounds the result to 2 dp, so the only numeric surface the author has agrees with them
that the box is where they put it. `D-157`'s new canvas mark then draws a red outline around geometry
the author cannot fault. **A refusal nobody can act on is worse than a silent one.**

## What Changes

The owner chose candidate **(a)** from `B-180`, then — on being shown that (a) alone cannot work —
**(a) plus a comparison-side guard**. Both halves ship here.

### Half 1 — a drag or resize commits whole scene pixels at EVERY zoom

`D-122` snapped a move to whole pixels only when the pixel grid was visible (zoom ≥ 800%). That scope
is superseded: the quantise now applies at every zoom, on both the drag and the resize commit paths.

- The **`Alt` bypass is preserved** and now matters everywhere — it is the only way to place
  sub-pixel by drag. (The resize gesture's bypass is `Shift`, which that gesture already owns.)
- **Inspector-typed values stay free**, exactly as `D-122` decided; they never route through the move
  path.
- Only the axes a **smart guide did not claim** are quantised. A guide snap has landed the box on a
  REAL target — a neighbour's edge, the frame centre, a ruler guide — and rounding after it would pull
  the box back off by up to half a pixel, breaking the flush abutment the author just made.

### Half 2 — a ULP-relative noise guard at the comparison, shared by all three predicate copies

🔴 **Half 1 cannot remove the residue on its own, and this is why the owner changed his mind.** Two of
`B-180`'s three named generators are divisions that happen AFTER the author's value is stored, inside
the flattener. A perfectly integer authored rect times `1234 / 1920` still carries residue. The number
reaching the predicate is the product of a division, so no amount of upstream rounding cleans it.

The comparison therefore ignores differences below the floating-point format's **own noise floor**,
via one `lessThanBeyondNoise` in `@cg/shared-schema` used by all three copies of the predicate.

## Impact

- Affected specs: `designer-canvas-view` (MODIFIED — the pixel-snap requirement's threshold),
  `designer-live-source` (ADDED — the noise guard).
- Affected code: `packages/shared-schema/src/float-noise.ts` (new),
  `packages/shared-schema/src/scene-flatten.ts`,
  `apps/designer/src/renderer/state/live-source-preflight.ts`,
  `apps/designer/src/renderer/features/canvas/{geometry,CanvasOverlay,Gizmo}.{ts,tsx}`.
- Affected PRD items: `B-180` (fixed here), `D-122` (its threshold scope superseded; entry amended in
  place, archived change directory untouched).

### 🔴 What is deliberately NOT changed

- **The strict `<` stays.** `B-180` says plainly the strict inequality is _correct_ and is not the
  defect: edge-touching must not be an overlap, or flush abutment becomes unbuildable. The inputs are
  guarded; the operator is not loosened.
- **This is a noise filter, NOT a product tolerance.** The guard is expressed in ULPs relative to the
  magnitudes compared — never as an absolute pixel figure — so **no on-air decision about how close
  two holes may sit is being made here.** A genuine 0.01 px overlap is ten orders of magnitude above
  the floor and still fires, and that is asserted by test.
- **`pixelSnapActive` is untouched**, and widening it would have been the obvious wrong move: it also
  gates the arrow-nudge's first-snap, and it sits in an `else if` chain where it SUPERSEDES smart-guide
  snapping. Relaxing it to all zooms would have deleted guide snapping from the Designer, silently,
  with every test of that function still green.
- **The Inspector display keeps rounding to 2 dp** — see `design.md` for the decision and its
  evidence.
