/**
 * ⭐ **`B-180` — THE FLOATING-POINT NOISE FLOOR, and the ONE comparison that respects it.**
 *
 * ── WHAT THIS IS FOR ────────────────────────────────────────────────────────
 *
 * Two Live Source plates could overlap by an amount the author cannot see, cannot read and
 * cannot drag away — and the export was blocked for it. The overlap predicate is a strict `<`
 * over floating-point rects, and three ordinary authoring actions manufacture residue nobody
 * typed: a composition instance's `preScale = size.w / comp.resolution.width`, the flattener's
 * `fitAffine`, and the Inspector's `n / 100`. `0.1 + 0.2 === 0.30000000000000004`, so a box
 * whose edge lands there "overlaps" a neighbour starting at `0.3` by 5.55e-17 px.
 *
 * ── 🔴 THIS IS A NOISE FILTER, NOT A PRODUCT TOLERANCE ──────────────────────
 *
 * **The distinction is the whole reason the guard is expressed in ULPs and never in pixels, and
 * it must survive every future edit.** A guard written as "ignore overlaps below 0.5 px" would be
 * a decision about HOW CLOSE TWO HOLES MAY SIT — an on-air judgement with real consequences,
 * because `D-137`'s rule exists to stop two live sources landing on the same pixels. Nobody is
 * entitled to make that call in a helper.
 *
 * A guard scaled to `Number.EPSILON` makes no such claim. It says only: *these two doubles are
 * the same number, and the difference is an artefact of having divided.* The rule's meaning is
 * untouched — what changes is that it stops reacting to arithmetic dust.
 *
 * 🔴 **The strict `<` STAYS, everywhere.** Edge-touching must NOT be an overlap or flush
 * abutment becomes unbuildable, which is the layout authors actually want. This guards the
 * INPUTS to that comparison; it does not loosen the operator.
 *
 * ⚠ **If you are ever tempted to raise this to a pixel figure, you are no longer fixing
 * `B-180`** — you are making the product decision `B-180` explicitly left to the owner, and it
 * belongs in an item with its own reasoning, not in a constant here.
 */

/**
 * How many ULPs of slack the comparison allows.
 *
 * Not 1. The residue `B-180` measured is ~1 ULP at the magnitude involved
 * (`124.00000000000001`), but it arrives through a CHAIN — `composeAffine` multiplies several
 * affines, each accumulating its own — so a handful of ULPs is the honest floor rather than the
 * single-operation one. 8 is comfortably above any chain this codebase composes and still
 * astronomically below anything visible: at a scene magnitude of 2000 px it is ~3.6e-12 px,
 * **nine orders of magnitude below** the 0.01 px overlap the tests require to still fire.
 */
export const NOISE_ULPS = 8;

/**
 * The absolute size of "the same number" at these magnitudes.
 *
 * RELATIVE, because a double's precision is relative: one ULP at 4 px is ~8.9e-16 while at
 * 4000 px it is ~9.1e-13. A fixed absolute floor would be far too tight at the top of a 4K
 * frame and needlessly loose at the origin. Scaled by the LARGER operand, with a floor of 1 so
 * that comparisons near zero still get a sane epsilon rather than collapsing to nothing.
 */
export function noiseFloor(a: number, b: number): number {
  return Number.EPSILON * NOISE_ULPS * Math.max(1, Math.abs(a), Math.abs(b));
}

/**
 * **`a < b`, ignoring floating-point dust** — true only when `a` is below `b` by more than the
 * two values' shared noise floor.
 *
 * The three consequences, which are the contract:
 *
 *  - **exactly equal ⇒ false**, exactly as `<` gives. Flush abutment stays a non-overlap.
 *  - **different by dust ⇒ false.** This is `B-180`: `599.9999999999999 < 600` is arithmetic
 *    noise, not a 1e-13 px gap anyone can act on.
 *  - **different by anything real ⇒ true.** A 0.01 px difference is ten orders of magnitude
 *    above the floor and is reported unchanged.
 */
export function lessThanBeyondNoise(a: number, b: number): boolean {
  return b - a > noiseFloor(a, b);
}
