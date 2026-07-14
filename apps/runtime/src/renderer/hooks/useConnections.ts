import type { ConnectionHealth } from '@cg/shared-ipc';
import type { Unsubscribe } from '../../shared/runtime-bridge.js';
import { useBridgeSnapshot } from './useBridgeSnapshot.js';

const fetchHealth = (): Promise<ConnectionHealth | null> => window.cg.connections.health();

const subscribeHealth = (handler: (next: ConnectionHealth | null) => void): Unsubscribe =>
  window.cg.connections.onHealthChanged(handler);

/**
 * The current connection health, or `null` until the bridge has answered once.
 *
 * B-080 — pulled on every transition into a usable link, not once at mount: a Runtime that
 * boots before the bridge is up mounts DISCONNECTED (R-006), where the pull is refused, and
 * the bridge publishes health only when it CHANGES. Reading it once at mount left the
 * StatusBar's "Loading…" pill stuck for the life of the page.
 */
export function useConnections(): ConnectionHealth | null {
  return useBridgeSnapshot(fetchHealth, subscribeHealth, null);
}
