import type { Rehearsal } from '@cg/shared-ipc';
import type { Unsubscribe } from '../../shared/runtime-bridge.js';
import { useBridgeSnapshot } from './useBridgeSnapshot.js';

/**
 * R-022 — the rows currently in REHEARSE, from the BRIDGE.
 *
 * Read from the bridge and not from local state, and that is the load-bearing
 * part: several browsers share one bridge, so a rehearse flag held in this
 * browser would leave the second operator seeing the row as an ordinary loaded
 * one and loading onto it — a collision on a real layer.
 */
const NONE: Rehearsal[] = [];

const fetchState = (): Promise<Rehearsal[]> => window.cg.rehearse.state();

const subscribe = (handler: (next: Rehearsal[]) => void): Unsubscribe =>
  window.cg.rehearse.onStateChanged(handler);

/** B-080 — re-pulled whenever the link becomes usable, like every other snapshot. */
export function useRehearse(): Rehearsal[] {
  return useBridgeSnapshot(fetchState, subscribe, NONE);
}
