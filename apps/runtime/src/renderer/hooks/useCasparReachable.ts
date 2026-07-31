import { isServerReachable } from '@cg/shared-ipc';
import { useConnections } from './useConnections.js';

/**
 * Can a command reach CasparCG right now?
 *
 * THE SECOND HOP. `useLink()` answers whether the browser can reach the BRIDGE;
 * this answers whether the bridge can reach CASPARCG. They are different
 * questions with different answers, and the whole offline surface turns on not
 * confusing them: the bridge is ours and local and is usually up, while the
 * playout machine is remote and may be off for hours. A verb that only touches
 * our list needs the first; a verb that emits AMCP needs both. Conflate them and
 * you either block list editing for no reason or promise a command that cannot
 * arrive.
 *
 * IT CALLS THE ONE SHARED PREDICATE. `isServerReachable` lives in
 * `@cg/shared-ipc` beside the wire enum, and `@cg/caspar-client`'s `isLiveState`
 * calls it too — one implementation, so the renderer and the session FSM cannot
 * come to disagree about which states count as live. That matters most for
 * `degraded`, which is REACHABLE (AMCP up, OSC silent): a local re-derivation
 * that dropped it would disable the console on every OSC-less install, which is
 * the B-101 class one layer up.
 *
 * UNKNOWN COUNTS AS UNREACHABLE, deliberately, and it is the case most likely to
 * be got wrong. `useConnections()` answers `null` until the bridge has replied
 * once — during boot, and after a reconnect until health arrives. Nothing is
 * known then, so this fails closed: a verb enabled on no evidence reports an
 * error at the moment air needs it, while one briefly disabled costs a second of
 * waiting. This is B-094's rule pointed at controls rather than labels — silence
 * is not evidence of a working link.
 */
export function useCasparReachable(): boolean {
  const health = useConnections();
  if (health === null) return false;
  return isServerReachable(health.primary.state);
}

/**
 * Why a CasparCG-bound verb is refused, for the control's tooltip.
 *
 * It names the RIGHT HOP. "Bridge disconnected" while the bridge is fine would
 * send the operator to the wrong machine, so the two states get two sentences.
 */
export const CASPAR_UNREACHABLE_REASON =
  'CasparCG cannot be reached — this command would not arrive. It returns as soon as the playout server is back.';
