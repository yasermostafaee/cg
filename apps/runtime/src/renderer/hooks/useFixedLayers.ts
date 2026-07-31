import type { FixedLayerBank, FixedSlotState } from '@cg/shared-ipc';
import type { Unsubscribe } from '../../shared/runtime-bridge.js';
import { useBridgeSnapshot, useBridgeSnapshotState } from './useBridgeSnapshot.js';

/**
 * R-021 stage 2b — the renderer's view of the fixed bank: the declared CONFIG
 * (null when no bank) and the per-slot STATE (facts only — observation +
 * binding; verb derivation happens once, in `fixedRowActions`, per design
 * (f)/(g)). Both ride `useBridgeSnapshot` (B-080: re-pulled whenever the link
 * becomes usable, pushes win over pulls), with module-level fetch/subscribe
 * functions because the hook takes them as effect dependencies.
 */

const NO_BANK = null;

const fetchBank = (): Promise<FixedLayerBank | null> => window.cg.fixedLayers.config();

const subscribeBank = (handler: (next: FixedLayerBank | null) => void): Unsubscribe =>
  window.cg.fixedLayers.onConfigChanged(handler);

/** The declared fixed bank, or null when none is configured (panel renders nothing). */
export function useFixedBank(): FixedLayerBank | null {
  return useBridgeSnapshot(fetchBank, subscribeBank, NO_BANK);
}

/**
 * The bank WITH its readiness — for the panel, which must not read `null` as an
 * ANSWER.
 *
 * `null` means two opposite things and the plain hook cannot tell them apart:
 * "this station has declared no candidate layers" (a fact, worth a paragraph
 * explaining where to declare them) and "the bridge has not told us yet" (no fact
 * at all). Until the link is usable, `useBridgeSnapshot` does not even ASK — so a
 * Runtime opened before the bridge is up sat on the first reading, telling the
 * operator his bank did not exist, and then filled in silently seconds later.
 *
 * Same doctrine as `useStackSnapshot`, one snapshot along: `unknown` is not
 * `empty` (B-094) applied to DATA rather than to occupancy.
 */
export function useFixedBankState(): { bank: FixedLayerBank | null; ready: boolean } {
  const { value, ready } = useBridgeSnapshotState(fetchBank, subscribeBank, NO_BANK);
  return { bank: value, ready };
}

const NO_SLOTS: FixedSlotState[] = [];

const fetchSlots = (): Promise<FixedSlotState[]> => window.cg.fixedLayers.state();

const subscribeSlots = (handler: (next: FixedSlotState[]) => void): Unsubscribe =>
  window.cg.fixedLayers.onStateChanged(handler);

/**
 * The current per-slot state ([] when no bank is declared). NOTE: on a dead
 * link this snapshot FREEZES at its last value — the row must mask a frozen
 * occupancy claim to unknown (the D8 / B-087 display rule), never render it
 * as if the wire could still back it.
 */
export function useFixedSlots(): FixedSlotState[] {
  return useBridgeSnapshot(fetchSlots, subscribeSlots, NO_SLOTS);
}

/**
 * The slots WITH their readiness — the other half of "an unready list must not be
 * able to render as an empty list".
 *
 * `[]` before the first answer is not "no rows"; it is no answer. The bank and the
 * slots arrive as two independent snapshots, so BOTH have to be ready before the
 * table is honest — a ready bank over unready slots renders the declared range as
 * a list with nothing in it, which is the same lie one snapshot along.
 *
 * `ready` LATCHES on first arrival and never clears (see `useBridgeSnapshotState`),
 * which is what keeps this from re-opening the window on every blip: once the
 * bridge has told us what the rows are, a later disconnect does not un-tell us —
 * the rows stay, masked to unverifiable by the row's own display rules.
 */
export function useFixedSlotsState(): { slots: FixedSlotState[]; ready: boolean } {
  const { value, ready } = useBridgeSnapshotState(fetchSlots, subscribeSlots, NO_SLOTS);
  return { slots: value, ready };
}
