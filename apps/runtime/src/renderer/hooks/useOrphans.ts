import type { OrphanLayer } from '@cg/shared-ipc';
import type { Unsubscribe } from '../../shared/runtime-bridge.js';
import { useBridgeSnapshot } from './useBridgeSnapshot.js';

const NONE: OrphanLayer[] = [];

const fetchOrphans = (): Promise<OrphanLayer[]> => window.cg.layers.orphans();

const subscribeOrphans = (handler: (next: OrphanLayer[]) => void): Unsubscribe =>
  window.cg.layers.onOrphansChanged(handler);

/** R-009 — the current orphan set (B-080: re-pulled whenever the link becomes usable). */
export function useOrphans(): OrphanLayer[] {
  return useBridgeSnapshot(fetchOrphans, subscribeOrphans, NONE);
}
