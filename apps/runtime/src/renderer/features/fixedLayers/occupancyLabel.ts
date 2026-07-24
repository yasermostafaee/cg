import type { FixedSlotObservation } from '@cg/shared-ipc';

/**
 * R-021 stage 2b — what the operator reads for a fixed slot's occupancy.
 * Kept React-free so it is unit testable on its own (the `layerLabel.ts`
 * precedent).
 *
 * The honesty rules this wording carries (design (b), the B-094 class):
 *
 *  - `unknown` is an EXPLICIT state — "no signal — occupancy unknown". It is
 *    never rendered as "empty": silence is not emptiness, and an operator who
 *    reads "empty" on a silent install will load onto a layer that may be
 *    carrying someone's graphic.
 *  - A DEAD SPA↔bridge link masks EVERY observation to unknown (`linkDown`),
 *    regardless of what the frozen snapshot last said — `useBridgeSnapshot`
 *    freezes the last value on `disconnected`, and a frozen `producer`/`empty`
 *    claim is one the wire can no longer back. Same display mask B-087 applies
 *    to the on-air badge; the wording names the LINK so the operator fixes the
 *    right thing (reconnect, not the OSC feed).
 *  - `producer` names the kind verbatim — the wire carries facts, and the kind
 *    is the fact the operator quotes when asking "what is on my layer 72?".
 */
export function occupancyLabel(observed: FixedSlotObservation, linkDown: boolean): string {
  if (linkDown) return 'not connected — occupancy unknown';
  switch (observed.kind) {
    case 'unknown':
      return 'no signal — occupancy unknown';
    case 'empty':
      return 'empty';
    case 'producer':
      return `occupied — ${observed.producer} producer`;
  }
}
