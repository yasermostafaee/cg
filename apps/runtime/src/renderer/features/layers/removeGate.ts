import { isOnAirStatus, type StackItemState } from '@cg/shared-schema';

/**
 * 🔴 **`B-228` — IS REMOVE REFUSED FOR THIS ROW RIGHT NOW? THE ONE RENDERER-SIDE SPELLING.**
 *
 * ── THE DEFECT THIS EXISTS TO CLOSE ─────────────────────────────────────────
 *
 * `R-017` made {@link isOnAirStatus} the single predicate both sides of the bridge seam read,
 * and pinned that identity with an agreement test. It shipped `B-228` underneath it, because
 * **the bridge's answer was never the predicate**: `#removeRefusal` is `isOnAirStatus` PLUS two
 * exemptions, and the two renderer surfaces spelled the rest of the answer separately —
 *
 * - the ROW's REMOVE: `isOnAirStatus(item) && !deps.restoreBlocked` (one exemption, and the
 *   only one it could see);
 * - REMOVE ALL: `items.filter(isOnAirStatus).length` (neither).
 *
 * So the bulk button sat disabled for a press `stack.remove-all` would have accepted — the
 * exact UI↔wire disagreement `#removeRefusal`'s own header forbids, and it held `dev`'s Linux
 * `e2e` red until it was traced.
 *
 * ⭐ **THE SHAPE TO REMEMBER: getting the shared FUNCTION right is not getting the shared
 * ANSWER right.** `LayersPanel`'s comment above the old count reasoned carefully and correctly
 * about which predicate to use — rejecting `isOnAir` on `B-122` grounds, choosing
 * `isOnAirStatus` precisely so the UI and the wire could not "disagree about the same press" —
 * and then disagreed about the same press, because only the predicate was carried across. A
 * decision is the predicate plus everything else the decision consults.
 *
 * ── WHY IT READS A PUBLISHED FACT AND DOES NOT RE-DERIVE ────────────────────
 *
 * `removeExempt` is the BRIDGE's own answer, joined onto the item at the one publication seam
 * (`#published`). The renderer could have been handed the two inputs instead and asked to
 * recompute the rule — and that would have rebuilt, one level up, the mirrored-copies problem
 * `R-017` had just spent a commit deleting. It is also not possible for the second exemption:
 * "is this item on a declared operator row" is `#declaredLayerClass`, which is bridge
 * knowledge. One question, answered once, by the side that can answer it.
 *
 * ⚠ **ABSENT MEANS NOT EXEMPT.** A publisher that omits the field leaves REMOVE refused on a
 * live row rather than enabling it — the fail-safe direction, pinned by a test so it cannot be
 * inverted by a later "tidy" default.
 *
 * ⚠ **DO NOT add a second entry point** — no `canRemove`, no `removeBlockedCount(items)`
 * convenience, no `(status, pending, exempt)` scalar overload. Each becomes the name a later
 * reader gates on, and then the answer has two spellings again, which is this file's entire
 * subject. Callers filter with this predicate directly.
 */
export function removeIsRefused(
  item: Pick<StackItemState, 'status' | 'pending' | 'removeExempt'>,
): boolean {
  return isOnAirStatus(item) && item.removeExempt !== true;
}
