import type { PlayoutLayerState } from '@cg/shared-ipc';
import type { Unsubscribe } from '../../shared/runtime-bridge.js';
import { useBridgeSnapshot } from './useBridgeSnapshot.js';

const EMPTY: PlayoutLayerState[] = [];

const fetchPlayout = (): Promise<PlayoutLayerState[]> => window.cg.playoutLayers.state();

const subscribePlayout = (handler: (next: PlayoutLayerState[]) => void): Unsubscribe =>
  window.cg.playoutLayers.onStateChanged(handler);

/**
 * R-028 part B — the declared playout layers and what is on them.
 *
 * Bridge-owned, so it keeps the DEFAULT `pullWhileDisconnected: false`: with
 * the link down the snapshot freezes at its last value and the tab masks it as
 * unknown (B-087) rather than asking for a round-trip that would be refused.
 * A frozen "something is on layer 61" is not a claim the wire can back, and the
 * clear gate must never act on one.
 */
export function usePlayoutLayers(): PlayoutLayerState[] {
  return useBridgeSnapshot(fetchPlayout, subscribePlayout, EMPTY);
}
