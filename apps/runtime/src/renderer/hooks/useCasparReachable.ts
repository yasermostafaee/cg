import { isServerReachable } from '@cg/shared-ipc';
import { useConnections } from './useConnections.js';
import { useLink } from './useLink.js';

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
 *
 * TEST MODE IS REACHABLE, AND THIS IS NOT AN EXCEPTION TO THE RULE — IT IS THE
 * RULE. The question is "will this command be executed?", not "is a real
 * CasparCG healthy?". In test mode the offline mock IS the executor: it runs
 * every verb, simulates the take and moves the row to SIM ON AIR. So a command
 * does arrive, and disabling the verb refuses one that would have succeeded —
 * exactly the failure this direction of the gate is supposed to prevent.
 *
 * WHY IT IS NOT FIXED IN THE MOCK. The obvious alternative — have the mock
 * report a `healthy` primary — is an R-006 violation: `seedHealth` reports
 * `disconnected` DELIBERATELY, so test mode never wears a signal that means a
 * real server said something, and `test-mode-honesty.spec.ts` pins exactly that.
 * The mock is not lying about health; the hook was reading health to answer a
 * question health does not answer. `offline-mock` is already the honest wire
 * signal for "the simulator is the far end", so the branch reads it directly.
 * The status surface is untouched: test mode still shows SIM and still claims
 * no healthy server.
 */
export function useCasparReachable(): boolean {
  // Both hooks run unconditionally — the branch below is on their values, never
  // on whether they are called.
  const link = useLink();
  const health = useConnections();
  if (link === 'offline-mock') return true;
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
