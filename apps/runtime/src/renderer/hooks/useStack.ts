import type { StackItemState } from '@cg/shared-schema';
import type { Unsubscribe } from '../../shared/runtime-bridge.js';
import { useBridgeSnapshot } from './useBridgeSnapshot.js';

const EMPTY: readonly StackItemState[] = [];

const fetchStack = (): Promise<readonly StackItemState[]> => window.cg.stack.snapshot();

const subscribeStack = (handler: (next: readonly StackItemState[]) => void): Unsubscribe =>
  window.cg.stack.onStateChanged(handler);

/**
 * The playout stack, re-rendered on every push from the bridge.
 *
 * B-080 — the snapshot is pulled whenever the link becomes usable, not once at mount. A
 * Runtime opened before the bridge is up mounts DISCONNECTED (R-006), where the pull is
 * refused; reading it once at mount left the operator looking at an EMPTY stack, on a live
 * link, while the bridge held retained items — until the next push happened to arrive.
 */
export function useStack(): readonly StackItemState[] {
  return useBridgeSnapshot(fetchStack, subscribeStack, EMPTY);
}
