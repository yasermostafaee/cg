import type { StackItemState } from '@cg/shared-schema';

/**
 * Does this item have something on air to CLEAR?
 *
 * ONE definition, shared by the row's Clear gating and by the Clear-All count — and mirrored
 * by the bridge's `clearAll` predicate. "Clear All" has to mean exactly "press Clear on every
 * row where Clear is enabled", and it can only keep meaning that if the predicate is not
 * spelled out separately in three places.
 *
 * `idle` has nothing on air. `loaded` has been `CG ADD`-ed but never PLAYed, so there is
 * nothing to clear there either. Everything else — on-air, playing, updating, exiting,
 * unconfirmed, error — may be showing something, and an item whose true state is UNKNOWN
 * (B-044 `unconfirmed`) is precisely the one an operator most needs to be able to clear.
 *
 * Kept React-free so it is unit testable on its own.
 */
export function isOnAir(item: StackItemState): boolean {
  return item.status !== 'idle' && item.status !== 'loaded';
}
