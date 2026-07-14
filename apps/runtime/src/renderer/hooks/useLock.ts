import type { LockState } from '@cg/shared-ipc';
import type { Unsubscribe } from '../../shared/runtime-bridge.js';
import { useBridgeSnapshot } from './useBridgeSnapshot.js';

const RELEASED: LockState = { engaged: false };

const fetchLock = (): Promise<LockState> => window.cg.lock.state();

const subscribeLock = (handler: (next: LockState) => void): Unsubscribe =>
  window.cg.lock.onStateChanged(handler);

/** The current lock state (B-080 — re-pulled whenever the link becomes usable). */
export function useLock(): LockState {
  return useBridgeSnapshot(fetchLock, subscribeLock, RELEASED);
}
