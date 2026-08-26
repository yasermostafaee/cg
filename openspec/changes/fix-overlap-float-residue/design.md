# Design — `B-180`, the two halves and the three things deliberately not done

## 1. Why half 1 alone cannot work, and why the owner changed his mind

`B-180` offered three candidates and the owner first chose **(a) quantise at the source**. That
choice is right and it ships here, but on its own it does not close the bug, and the reason is worth
stating once so nobody re-derives it:

**All three generators `B-180` names are DIVISIONS, and two of them happen after the author's value is
stored.**

| generator                                                   | when it runs | reachable by rounding a drag? |
| ----------------------------------------------------------- | ------------ | ----------------------------- |
| `startPos + clientDelta / scale` (the drag commit)          | at commit    | **yes — half 1 fixes this**   |
| `preScale = size.w / comp.resolution.width` (the flattener) | every read   | no                            |
| `fitAffine`'s `sx = to.width / from.width` (arrangements)   | every read   | no                            |

A perfectly integer authored rect, flattened through an instance 1234 px wide of a 1920-wide
composition, still carries residue. The number that reaches the predicate is always the product of a
division, so no amount of upstream rounding cleans it. Hence half 2.

**Measured, from the real flattener** (`packages/shared-schema/tests/overlap-residue.test.ts` pins
these exact values): two plates abutting at exactly `x = 350` in composition units, inside an instance
1234 wide, flatten to

```
a.maxX = 224.94791666666669
b.minX = 224.94791666666666
        ↑ a 2.842170943040401e-14 px "overlap" nobody authored
```

That is 13 orders of magnitude below one pixel.

## 2. Why the guard is in ULPs and never in pixels

An epsilon on a rule whose justification is _"two live sources over the same pixels and which one
shows is a z-order accident"_ is a decision with on-air consequences. Choosing a pixel figure would be
making that decision — pick it wrong and either flush abutment becomes an overlap, or a genuine
collision stops being one.

A guard scaled to the double's own epsilon makes no such choice. It says only: _these two numbers are
closer together than this arithmetic can represent a difference, so their inequality is not evidence
of anything._ `noiseFloor(a, b) = EPSILON · 8 · max(1, |a|, |b|)` — around `2.2e-15` at a magnitude of
1, `4.3e-13` at 1920. A genuine 0.01 px overlap is ten orders of magnitude above that at any scene
coordinate, and is asserted to still fire.

`8` ULPs, not 1: a coordinate arrives through a chain of three or four multiply-adds
(`composeAffine` twice, `transformToParent`, then the corner map), each of which can round. One ULP
would guard only the last operation.

## 3. Why `pixelSnapActive` was NOT widened

The obvious spelling of half 1 is "relax `pixelSnapActive` to all zooms". It is wrong twice over, and
a test in `canvas-geometry.test.ts` now pins it so the next reader does not try:

1. **It would silently delete smart-guide snapping.** `pixelSnapActive` sits in an `else if` chain
   where it SUPERSEDES the element/canvas/ruler guide branch — correctly, at 800%, where a
   6-screen-px guide threshold is under a tenth of a scene pixel. True at every zoom, it would
   supersede guides everywhere. Every unit test of `pixelSnapActive` would still pass.
2. **It would change the arrow NUDGE.** `snapNudgeToPixel`'s first-nudge-to-the-next-integer rule is
   gated on the same predicate, and `D-122` deliberately kept the nudge relative below the threshold.

So half 1 is a SECOND gate — `quantiseDragCommit(alt)` — applied after the guides have had their say,
to the axes no guide claimed.

**Why only the unclaimed axes.** A guide snap has already landed the box exactly on a real target.
Rounding after it would pull the box off by up to half a pixel, which is worst precisely where it
matters: inside a scaled composition instance every flattened edge is `size.w / comp.resolution.width`
times something, so the guides an author snaps to there are almost never integers. Quantising a
guide-snapped axis would break the flush abutment the author had just made — and this bug is about
flush abutment.

## 4. The Inspector question — DECIDED: leave the display alone

`B-180`'s fourth acceptance bullet is _"WHEN the Inspector prints a geometry value THEN it does not
disagree with what is stored, or it is honest that it is rounding"_. `formatNumberDisplay`
(`controls.tsx:449`, verified) is `Number.isInteger(v) ? String(v) : Number(v.toFixed(2)).toString()`,
so a stored `124.00000000000001` prints `124`.

**Decision: no change.** Three reasons:

1. **Half 1 stops the display ever having to lie about a new drag.** A drag now commits an integer,
   and `formatNumberDisplay` prints an integer exactly.
2. **Half 2 removes the CONSEQUENCE for residue already stored** in a project saved before this
   change. `B-180`'s complaint is that the display _contradicted a refusal_; with the refusal gone the
   rounded reading describes a box that behaves exactly as it reads.
3. **An honest display would be a regression in `B-180`'s own scenario.** Printing
   `124.00000000000001` in a narrow Inspector cell, for a box that is correct and now exports fine,
   turns invisible dust into visible alarm and invites the author to "fix" a number that is not wrong.

🔴 **The claim that decision rests on was verified, not assumed.** A rounded display is only harmless
while the rounded TEXT cannot become the value. It cannot: `onChange` — which fires solely on real
typing — is the only path that commits from the buffer; `onBlur` merely resyncs it; Arrow up/down
computes from `props.value` and never from the displayed text. This session came close to filing a
second defect for a round-trip that does not happen. `apps/designer/tests/inspector-residue-display.dom.test.ts`
pins all of it, including a focus-then-blur that must commit nothing — the assertion that turns red if
a later refactor makes blur commit.

**Nothing is filed separately**, because there is no residual defect once that round-trip is ruled out.

## 5. Where each of the three predicate copies is proved

`B-180` requires one guard used by all three. Each is proved END TO END by a test that was measured to
FAIL with that copy's guard reverted to a bare `<` — not merely to exist:

| copy                                        | reached through                                   | proving test                                                      |
| ------------------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------- |
| `intersects` (`scene-flatten.ts`)           | `sceneMaskHoles` — mask-hole membership           | `packages/shared-schema/tests/overlap-residue.test.ts`            |
| `rectsOverlap` (`live-source-preflight.ts`) | the per-ARRANGEMENT flattened overlap pass        | `apps/designer/tests/overlap-residue.test.ts` (scaled instance)   |
| `overlaps` (`live-source-preflight.ts`)     | the per-document `collectFlat` / `frameAabb` pass | same file — the pre-fix drag-committed value `123.99999999999999` |

⚠ **Finding fixtures that actually reach them took measuring, and the first two attempts did not.**
Recorded because they are the traps here:

- A fixture asserting that a backdrop under both plates is punched twice passes with the guard
  DISABLED — the backdrop lies under each plate independently, so the residue between the two plates
  cannot change that. The assertion has to be plate-vs-plate.
- `collectFlat` descends into `container` and **never into a `composition` instance**, so a plate
  nested in a scaled instance is invisible to the `overlaps` copy. The copy a scaled instance reaches
  is `rectsOverlap`, in the per-arrangement loop — which is why those fixtures carry an `arrangements`
  entry that looks decorative and is not.
- With both edges reached by the same expression (`124 · preScale`) the two doubles come out
  bit-identical and nothing drifts. Residue needs the two edges computed by DIFFERENT routes through
  `composeAffine`.

## 6. The resize quantise goes on the POINTER, not on the solved rect

The first implementation rounded `next.position` and `next.size` after `computeRectResize`, with a
comment asserting that "a resize is not a promise about the opposite edge the way a snap is".

**That assertion was wrong, and `B-175` is the promise it denied:** the corner OPPOSITE the grabbed
handle stays glued while the grabbed one moves. `position` and `size` are not independent of where
that corner lands — under rotation, a non-uniform `scale` or a centred anchor, the solver derives
`position` precisely so the pin holds. Rounding the two separately walks the pin off by up to half a
pixel.

It was caught by the gate, not by reasoning: `arrangement-gizmo-read.dom.test.ts`'s rotated +
non-uniformly-scaled case failed by **0.108 px** against a `5e-7` tolerance.

**The fix is a different insertion point, not a weaker rule.** `computeRectResize` pins the fixed
corner for ANY pointer position, so quantising `pScene` — the pointer, before the solve — lands the
grabbed edge on the integer lattice and leaves the pin exactly where it was. For an unrotated element
the committed position and size come out whole anyway; for a rotated one they cannot (a rotated box's
axis-aligned numbers are not all integers), and there the pin is the invariant that matters. The spec
scenario says so explicitly rather than promising integers it cannot deliver.

⚠ **The general shape, worth carrying:** when a value is produced by a solver that maintains an
invariant, quantise the solver's INPUT. Rounding its output silently re-opens whatever the solver was
holding closed.
