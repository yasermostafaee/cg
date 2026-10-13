import type { EmptiedAirNotice } from '@cg/shared-ipc';
import type { Unsubscribe } from '../../shared/runtime-bridge.js';
import { useBridgeSnapshot } from './useBridgeSnapshot.js';

const NONE = null;

const fetchNotice = (): Promise<EmptiedAirNotice | null> => window.cg.emptiedAir.notice();

const subscribeNotice = (handler: (next: EmptiedAirNotice | null) => void): Unsubscribe =>
  window.cg.emptiedAir.onNoticeChanged(handler);

/**
 * `B-225` — the standing "the playout server stopped carrying what you put up" notice, or
 * `null`.
 *
 * ⚠ **READ-ONLY, and this hook is the whole of the automatic behaviour.** It pulls and it
 * subscribes; it never restores. The owner's decision (2026-09-05) was detect-and-say over
 * restoring automatically — *an unattended machine must not put a graphic on air* — so
 * `window.cg.emptiedAir.restore` must be reached from an operator's press and from nothing
 * else. Do not add an effect here that calls it, however small the set looks.
 *
 * The plain `useBridgeSnapshot` (not the `ready`-carrying form) is right: `null` is rendered
 * as "nothing to report", and the bootstrap window rendering nothing for a frame costs
 * nothing. Nothing here ACTS on the absence of a notice — the rule that would demand `ready`.
 */
export function useEmptiedAir(): EmptiedAirNotice | null {
  return useBridgeSnapshot(fetchNotice, subscribeNotice, NONE);
}
