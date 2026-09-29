import type { ClearedOutsideLayer } from '@cg/shared-ipc';
import type { Unsubscribe } from '../../shared/runtime-bridge.js';
import { useBridgeSnapshot } from './useBridgeSnapshot.js';

const NONE: ClearedOutsideLayer[] = [];

const fetchClearedOutside = (): Promise<ClearedOutsideLayer[]> => window.cg.layers.clearedOutside();

const subscribeClearedOutside = (handler: (next: ClearedOutsideLayer[]) => void): Unsubscribe =>
  window.cg.layers.onClearedOutsideChanged(handler);

/**
 * `B-292` — the layers of ours cleared outside CG Control, still to be said (re-pulled whenever the
 * link becomes usable, like every bridge snapshot).
 */
export function useClearedOutside(): ClearedOutsideLayer[] {
  return useBridgeSnapshot(fetchClearedOutside, subscribeClearedOutside, NONE);
}
