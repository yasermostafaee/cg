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

const NO_BANKS: FixedLayerBank[] = [];

const fetchBanks = (): Promise<FixedLayerBank[]> => window.cg.fixedLayers.banks();

const subscribeBanks = (handler: (next: FixedLayerBank[]) => void): Unsubscribe =>
  window.cg.fixedLayers.onBanksChanged(handler);

/**
 * 🔴 `MULTI-CHANNEL-01` — **EVERY DECLARED BANK, in channel order** (`[]` when none is declared).
 *
 * The console's ONE bank read. It used to read the single bank (`fixedLayers.config`); a station
 * now declares one bank per channel, and every per-channel surface takes THE SELECTED CHANNEL'S
 * bank from this list (`useChannelBankState`, beside the selection it depends on), while every
 * surface that NAMES a row takes the whole list, so a row on channel 2 is named from channel 2's
 * bank wherever it is named.
 */
export function useFixedBanks(): FixedLayerBank[] {
  return useBridgeSnapshot(fetchBanks, subscribeBanks, NO_BANKS);
}

/**
 * The banks WITH their readiness — for the panel, which must not read an empty list as an
 * ANSWER.
 *
 * `[]` means two opposite things and the plain hook cannot tell them apart: "this station has
 * declared no candidate layers" (a fact, worth a paragraph explaining where to declare them) and
 * "the bridge has not told us yet" (no fact at all). Until the link is usable,
 * `useBridgeSnapshot` does not even ASK — so a Runtime opened before the bridge is up sat on the
 * first reading, telling the operator his bank did not exist, and then filled in silently
 * seconds later.
 *
 * Same doctrine as `useStackSnapshot`, one snapshot along: `unknown` is not `empty` (B-094)
 * applied to DATA rather than to occupancy.
 */
export function useFixedBanksState(): {
  banks: FixedLayerBank[];
  ready: boolean;
  /** `DELTA A` §A2 — the bridge ANSWERED the first pull, and the answer was a refusal. */
  failed: boolean;
} {
  const { value, ready, failed } = useBridgeSnapshotState(fetchBanks, subscribeBanks, NO_BANKS);
  return { banks: value, ready, failed };
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
export function useFixedSlotsState(): {
  slots: FixedSlotState[];
  ready: boolean;
  /** `DELTA A` §A2 — the bridge ANSWERED the first pull, and the answer was a refusal. */
  failed: boolean;
} {
  const { value, ready, failed } = useBridgeSnapshotState(fetchSlots, subscribeSlots, NO_SLOTS);
  return { slots: value, ready, failed };
}
