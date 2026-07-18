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
 *
 * B-092 — and it is pulled while DISCONNECTED too, which no other snapshot does. The stack
 * is now backed by persistent browser-local intent, so `stack.snapshot()` always has an
 * answer: with the bridge down it serves the retained rows (honest `unverified`/`loaded`,
 * never a confident red) instead of refusing. Without this a hard refresh during a bridge
 * outage showed the operator an EMPTY stack — the list vanishing, which is exactly what
 * B-092 exists to prevent. Health/lock/config keep the default and stay unasked.
 */
export function useStack(): readonly StackItemState[] {
  return useBridgeSnapshot(fetchStack, subscribeStack, EMPTY, true);
}
