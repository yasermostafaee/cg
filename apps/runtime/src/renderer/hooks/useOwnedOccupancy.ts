import type { OwnedOccupancyWarning } from '@cg/shared-ipc';
import type { Unsubscribe } from '../../shared/runtime-bridge.js';
import { useBridgeSnapshot } from './useBridgeSnapshot.js';

const NONE: OwnedOccupancyWarning[] = [];

const fetchOwnedOccupancy = (): Promise<OwnedOccupancyWarning[]> =>
  window.cg.layers.ownedOccupancy();

const subscribeOwnedOccupancy = (handler: (next: OwnedOccupancyWarning[]) => void): Unsubscribe =>
  window.cg.layers.onOwnedOccupancyChanged(handler);

/** B-056 — the current owned-slot occupancy warnings (B-080: re-pulled on a usable link). */
export function useOwnedOccupancy(): OwnedOccupancyWarning[] {
  return useBridgeSnapshot(fetchOwnedOccupancy, subscribeOwnedOccupancy, NONE);
}
