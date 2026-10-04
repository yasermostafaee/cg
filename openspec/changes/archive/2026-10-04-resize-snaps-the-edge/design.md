# Design — `B-181`: snapping in edge space, and the corner decision

## 1. The algebra, and why the bug is exactly the lock

`computeRectResize` maps the pointer to extents by projecting onto the element's local axes after
undoing the element scale, then rebuilds the rect around the fixed corner. At `rotation === 0` —
the only case snapping runs in — that reduces to:

```
rawW        = |p.x − fixed.x| / scale.x
movingEdge.x = fixed.x + sgn · scale.x · wNew
```

**Unlocked**, `wNew = rawW`, so the two `scale.x` factors cancel and `movingEdge.x ≡ p.x`
identically — even under a non-uniform element scale. Snapping the pointer therefore _was_ snapping
the edge, and the defect could not be seen. That identity is asserted by test, because the claim
"this change cannot disturb the unlocked path" rests entirely on it.

**Locked**, `wNew` comes from `lockExtents`, and the two cases behave differently:

| handle                 | `lockExtents` branch                        | does the driven edge stay under the pointer?         |
| ---------------------- | ------------------------------------------- | ---------------------------------------------------- |
| edge (`r`/`l`/`t`/`b`) | `lw = w`, `lh = w / lockRatio`              | **yes** — the driven extent passes through unchanged |
| corner                 | orthogonal projection onto `(lockRatio, 1)` | **no** — separated by construction off the diagonal  |

⚠ **So an aspect-locked EDGE handle cannot see this bug**, and it is the fixture anyone will reach
for first. Measured, plate `(100, 100, 640, 360)` at 16:9, handle `r`, pointer `x ∈ {900, 1000,
300}` ⇒ committed right edge `900, 1000, 300`. The discriminating fixture has to be a **corner**:
same plate, handle `br`, pointer `(900, 300)` ⇒ moving corner `(793.18, 489.91)`, 106.8 px away in
`x` and 189.9 px in `y`.

⚠ The owner's _"the pointer drifts away from the box"_ is real for edge handles too, but it is a
different thing and not a defect: the DERIVED axis changes, which moves the handle's own midpoint
out from under the cursor. The lock cannot avoid that. What was a defect is the next clause —
_"it is the POINTER that … snaps, not the box"_ — and that is the corner case.

## 2. The inverse, and why the snap is expressed as one

The requirement is "re-solve the rect so the edge lands exactly on the target, with the lock still
satisfied — not by nudging the pointer and hoping". The constraint is that `computeRectResize` /
`lockExtents` stay the ONE place the geometry is solved.

Those two pull in opposite directions unless the snap is phrased as a question about the _input_:
**which pointer would have produced the rect I want?** Then the answer goes back through the same
solver and every invariant it holds — the `B-175` fixed-corner pin, the `MIN_SIZE` clamp, the lock
itself — keeps working because none of them is bypassed.

`pointerForMovingEdge` answers it:

- the target fixes the driven extent: `wNew = (T − fixed.x) / (scale.x · sgn)`;
- an **edge handle** passes its driven extent straight through `lockExtents`, so aim `rawW = wNew`
  and leave the other axis exactly where the author is holding it;
- a **locked corner** has infinitely many pointers giving the same projection, so the one chosen is
  the point ON the locked diagonal, `(wNew, wNew / lockRatio)` — both the nearest such pointer and
  the corner of the very rect being committed, so the cursor ends up back on the handle rather than
  drifting further from it;
- **unlocked, it returns `T` itself**, which is what makes the positive control byte-identical.

It returns `null` — never an approximation — for a rotated element, an axis the handle does not
drive, or a target on the wrong side of the fixed corner (which would need a negative extent, and
`Math.abs` inside the solver would silently mirror it onto the wrong side instead).

🔴 **It deliberately does NOT re-implement `lockExtents`'s `MIN_SIZE` up-scale.** A locked pair
whose derived axis falls under the floor is scaled back up, which moves the driven axis with it and
can override any target. A second copy of that clamp here is exactly how the two would drift, so
the contract is "the pointer that solves the algebra" and the caller measures the result.

## 3. The guide: measured, not intended

The old code set `guideX` to the snapped pointer. The new code publishes guides only after the
final rect exists, from `movingCornerScene(…, solved)`, and only where the edge is within
`noiseFloor` of a target — `B-180`'s own floor, reused.

**This is stronger than "draw the guide at the edge's final coordinate", and deliberately so.** It
makes the false guide structurally impossible rather than merely fixed: a guide cannot be emitted
for a snap that the `MIN_SIZE` clamp, the lock, or a wrong-side target prevented, because nothing
about the intent survives into the emission path.

Measured with the OLD code and a ruler guide at `y = 600`: one corner drag published guides on
**both** axes (`x: [1000]`, `y: [600]`) while the box sat on neither.

## 4. The corner decision — nearest wins, `x` on a tie

A real design choice, not a spelling. Under a lock, satisfying one axis forces the other.

**Why nearest:**

- It is the same currency the threshold already uses. `thr = SNAP_PX / scale`, and both axes are
  tested against that one value, so a scene-px distance is a screen-px distance times the same
  constant on both axes. "Nearest" therefore means nearest **on screen** — what the author sees.
- The obvious alternative, "the axis with the larger pointer delta drives", is actively wrong here:
  `lockExtents` projects a corner pointer onto the diagonal, so the larger delta is an artefact of
  the projection rather than a statement of intent, and it would routinely snap the axis the author
  was not aiming at.
- The tie-break is fixed rather than "keep whichever axis led last". A stateful tie-break makes the
  same pointer position mean two different things depending on how it was reached, which is how a
  box starts to feel like it is fighting back.

**The forced axis gets no guide** unless its committed edge lands genuinely on a target, which the
noise-floor test above decides. Answering the brief's three sub-questions directly: the nearer
target wins; a forced axis merely _inside_ another target's threshold draws nothing; and both lines
are drawn when both are genuinely satisfied.

## 5. Composing with `B-180`

Both now live in one handler. The order is **snap, then quantise**, and:

- an axis a snap claimed is **never** quantised — rounding it would pull the edge off the target,
  destroying the exact abutment this change exists to deliver;
- under a lock, a corner snap claims **both** axes, because the lock ties them and quantising the
  "free" one would drag the snapped edge straight back off;
- `Shift` bypasses both, unchanged.

⭐ **`B-180`'s lesson carries: quantise the INPUT of a solver that maintains an invariant, never its
output.** That session rounded `next.position` / `next.size` first and broke the fixed-corner pin by
0.108 px. This change obeys the same rule for the same reason — the snap is applied by choosing a
pointer, not by editing a rect.

## 6. What the audit of `B-180`'s guarantee found

`B-180` shipped the claim _"a drag/resize now commits whole scene pixels at EVERY zoom"_. The owner
reported it was not quite true. It is not: what was built is a quantised **pointer**.

⚠ Note what the owner is NOT seeing: `formatNumberDisplay` prints through `toFixed(2)`, so a
sub-ULP residue displays as a clean integer. Every fraction he can read is ≥ 0.005 — a real number,
not dust — which rules the whole sub-ULP class out of his report.

Five paths are **deliberate** and stay (a snapped axis takes its target verbatim; the aspect lock's
derived axis; a rotated element; the `Alt`/`Shift` bypasses; a fraction inherited through the
fixed-corner pin). The most likely thing the owner is actually reading is the second: a 16:9 lock on
an integer width is almost never an integer height — width `900` ⇒ height `506.25`.

Eight further paths are genuine gaps and are filed as **`B-182`** rather than grown into this
session. One of them falsified a shipped comment — `sizeNew.w = size.w * (wNew / rect.w)` is not an
IEEE754 identity, so even the plainest unrotated resize can commit `62.00000000000001` — and that
comment is corrected here, in the file it lives in.
