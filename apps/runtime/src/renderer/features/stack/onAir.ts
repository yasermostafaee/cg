import type { StackItemState } from '@cg/shared-schema';

/**
 * Does this item have something on air that a GRACEFUL verb can act on?
 *
 * `idle` has nothing on air. `loaded` has been `CG ADD`-ed but never PLAYed, so it has no
 * authored outro to run. Everything else — on-air, playing, updating, exiting, unconfirmed,
 * error — may be showing something.
 *
 * ⭐ **B-122 — THIS IS NO LONGER CLEAR-ALL'S PREDICATE, AND MUST NOT BE MADE ONE AGAIN.**
 *
 * It used to be, and the bridge's `clearAll` mirrored it deliberately, so that "Clear All"
 * meant exactly "press Clear on every row where Clear is enabled". That symmetry was the
 * defect: it gated the EMERGENCY control on the believed status — precisely the value that
 * may be wrong in the emergency — so a stack of wrongly-`idle` rows produced a success report
 * and no commands. Clear-All (both halves) now addresses every row that HOLDS A LAYER,
 * whatever the status claims, and the row's own CLEAR was never status-gated either.
 *
 * What this still legitimately answers:
 *
 *   - **STOP / STOP ALL** — `CG STOP` asks a template to run its own outro, which is
 *     meaningless for a row that never played. The status is the right question here because
 *     it is not the axis under suspicion: a wrong `idle` costs a graceful exit, never a
 *     stranded graphic, and CLEAR ALL sits beside it as the remedy that ignores it.
 *   - **counts and badges** that describe what the console BELIEVES is on air.
 *
 * ⚠ It must never gate a clear path again, on either side of the bridge seam.
 *
 * Kept React-free so it is unit testable on its own.
 */
export function isOnAir(item: StackItemState): boolean {
  return item.status !== 'idle' && item.status !== 'loaded';
}
