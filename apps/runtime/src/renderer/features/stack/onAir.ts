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
 *
 * ⚠ It must never gate a clear path again, on either side of the bridge seam.
 *
 * ⚠ **`B-213` — and it is NO LONGER THE HEADER'S TALLY EITHER.** It counts `error`, because
 * an errored row MAY be showing something and STOP must be offered to it. A tally wearing the
 * air colour cannot afford that "may": on 2026-09-04 the header read `State (2)` in green over
 * two rows whose takes had been REFUSED — nothing on air at all. The header now reads
 * {@link airTally}, which keeps the believed-on-air count and the error count APART.
 *
 * Kept React-free so it is unit testable on its own.
 */
export function isOnAir(item: StackItemState): boolean {
  return item.status !== 'idle' && item.status !== 'loaded';
}

/**
 * THE on-air-or-unsettled predicate for a stack item, renderer side — the mirror of the
 * bridge's `isOnAirStatus` (R-010's `setConfig` gate, R-030's raster gate, the rehearse
 * guards). `updating` / `exiting` ride an on-air producer; `unconfirmed` and `pending` mean
 * the on-air result is UNKNOWN, and unknown counts as on air in every gate whose failure
 * mode is acting on a live graphic.
 *
 * `error` is deliberately NOT here: it says a command was refused, and says nothing about
 * whether the layer is showing anything. `unverified` is not here either — the link is
 * down, and the header greys itself for that case as a whole.
 *
 * ONE spelling, in this file, read by the Server settings panel's apply gate and by the
 * header's tally (golden rule 6). The panel used to carry its own copy.
 */
export function isOnAirOrUnsettled(item: StackItemState): boolean {
  return (
    item.pending ||
    item.status === 'playing' ||
    item.status === 'on-air' ||
    item.status === 'updating' ||
    item.status === 'exiting' ||
    item.status === 'unconfirmed'
  );
}

/**
 * `B-213` — what the layer table's header SAYS about the list, as two numbers that mean
 * two different things and are never added together.
 *
 * `onAir` is what this console believes is on air (or is unsettled), derived from each
 * item's reconciled status — the bridge's ack, refined by OSC when there is any — never
 * from raw intent: a refused take settles to `error`, not to `playing`. `inError` is how
 * many rows' last command was REFUSED, which is a fact about the console's ability to
 * reach air, not a claim about air.
 *
 * The old `State (n)` counted both as one number in the air colour, so two refused takes
 * read as two graphics on air, and an operator who had just been refused twice was
 * looking at a green 2.
 */
export interface AirTally {
  readonly onAir: number;
  readonly inError: number;
}

export function airTally(items: readonly StackItemState[]): AirTally {
  let onAir = 0;
  let inError = 0;
  for (const item of items) {
    if (isOnAirOrUnsettled(item)) onAir += 1;
    else if (item.status === 'error') inError += 1;
  }
  return { onAir, inError };
}
