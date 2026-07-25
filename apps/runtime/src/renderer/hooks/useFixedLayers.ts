import type { FixedLayerBank, FixedSlotState } from '@cg/shared-ipc';
import type { Unsubscribe } from '../../shared/runtime-bridge.js';
import { useBridgeSnapshot } from './useBridgeSnapshot.js';

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
