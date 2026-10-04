# Resize snapping is decided on the box edge, not on the pointer (`B-181`)

## Why

The owner reported two things separately; they are one defect:

> _"When a live box is aspect-locked and you grab an edge and drag, the mouse pointer drifts away
> from the box, and it is the POINTER that reacts to the guides and the canvas corners and snaps —
> not the box."_

> _"Making the boxes touch each other is very hard — you have to zoom in a lot so the edges do not
> overlap or leave the frame."_

The aspect lock (`D-155`) applies to exactly one kind of element — a `video-placeholder` with an
`expectedAspect` — so the broken gesture is the one an author uses to build a multibox layout.

`beginResize` snapped `pScene` (the pointer) and applied the lock **afterwards**, inside
`computeRectResize`. Unlocked that is exactly right — the solver puts the grabbed edge at the
pointer, so snapping one IS snapping the other — which is why the defect went unseen. Under the
lock the solver returns a rect satisfying the ratio, so the edge is not under the pointer at all.

🔴 **And the guide was set to the snapped POINTER coordinate, so the canvas drew a line announcing a
snap the geometry had refused.** That is the repo's named pattern — _the system knows something and
does not say it_ (`B-141`, `B-143`, `B-144`) — inverted: the system saying something it does not
know.

## What Changes

The snap decision moves into **box-edge space**, evaluated on the rect that will be committed:

1. solve from the raw pointer with the lock applied → a candidate rect;
2. read that candidate's moving edge (`movingCornerScene`);
3. test those coordinates against the existing `targets` at the existing `thr`;
4. re-solve through the **same** `computeRectResize`, via an inverse (`pointerForMovingEdge`) that
   answers _"which pointer would have produced the rect I want"_;
5. publish the guide from the **final** rect, and only where the edge is genuinely on a target.

Step 5 is what makes the lie structurally impossible: the guide becomes a function of committed
geometry rather than of intent.

### The corner decision (a real choice, recorded as one)

Under a lock the two extents are tied, so a corner drag generally cannot satisfy targets on both
axes. **The nearer target wins; a tie goes to `x`.** The forced axis gets no guide unless the
committed edge lands genuinely on a target — measured with `B-180`'s `noiseFloor`, not merely
"within threshold".

## Impact

- Affected specs: `designer-canvas-view` (MODIFIED — the snap-while-dragging requirement gains the
  resize gesture's edge-space rule).
- Affected code: `apps/designer/src/renderer/features/canvas/geometry.ts` (three new exported
  helpers beside the solver), `apps/designer/src/renderer/features/canvas/Gizmo.tsx`.
- Affected PRD items: `B-181` (fixed here), `B-180` (its overstated whole-pixel claim corrected in
  place), `B-182` (filed here for the genuine remaining gaps), `D-122` (same correction).

### 🔴 What is deliberately NOT changed — each verified before the work started

- **`SNAP_PX = 7`** and **`thr = SNAP_PX / scale`** — the catch radius is already a constant 7
  SCREEN px at every zoom. (Precisely: the CONSTANT is screen px, `thr` is scene units, and the
  division is what makes the radius zoom-independent.)
- **`buildSnapTargets`** — already canvas edges + centre, every other element's edges + centre, and
  the ruler guides. A neighbour's opposite edge was always a target; no new target set was needed.
- **`B-175`'s rule inside it** — targets read from `renderedTransformAt`, where a box IS DRAWN.
- **`lockRatio` resolved once at press.**
- **The `t0.rotation === 0` gate** on snapping.
- **`Shift` as this gesture's bypass** — no second modifier was invented.
- **`computeRectResize` / `lockExtents` remain the ONE solver.** The inverse lives beside them and
  feeds them; it does not replace them.

### How this composes with `B-180`

`B-180` quantises the resize POINTER; this change snaps the resize EDGE. They meet in one handler
and the order is: **snap first, quantise second, and a snapped axis is never quantised.** Under a
lock a corner snap claims BOTH axes, because the lock ties them and rounding the "free" one would
drag the snapped edge straight back off its target. `Shift` bypasses both, exactly as before.
