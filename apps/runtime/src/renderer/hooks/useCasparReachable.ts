import { isServerReachable, type ConnectionHealth } from '@cg/shared-ipc';
import type { BridgeLinkStatus } from '../../shared/runtime-bridge.js';
import type { CasparReach } from '../ui/reachWording.js';
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
 * …BUT IT MUST NOT BE *DESCRIBED* AS UNREACHABLE. The boolean is the permission
 * answer and it is right; it is not the wording answer. See {@link useCasparReach}
 * — during that window the console used to name a fault ("CasparCG cannot be
 * reached") that nothing had yet reported, on every load and every reconnect.
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
  return useCasparReach() === 'reachable';
}

/**
 * The same question, THREE-VALUED — for anything that has to say WHY.
 *
 * `connecting` is the boot/reconnect window: the bridge has not answered yet, so
 * nothing is known. It is separated from `unreachable` for one reason only, and it
 * is a wording reason — see `reachWording.ts`. Both still refuse the command;
 * `useCasparReachable` above folds them together precisely so no caller can
 * accidentally treat "we have not been told yet" as permission.
 *
 * WHY `connecting` IS NOT REPORTED WHILE THE BRIDGE IS DOWN. With the link down
 * there is no round trip in flight and nothing to wait for, so "connecting…" would
 * be a promise nobody is keeping. That case is `unreachable`, and its caller
 * reports the NEARER hop instead (`casparRefusalReason` puts `linkDown` first).
 */
export function useCasparReach(): CasparReach {
  // Both hooks run unconditionally — the resolver below is on their values,
  // never on whether they are called.
  return resolveCasparReach(useLink(), useConnections());
}

/**
 * The same answer as a PURE function, for a caller that already holds both
 * inputs.
 *
 * `StatusBar` is the one: it reads health for its own pills, and having its link
 * indicator take the hook as well would open a SECOND `useConnections`
 * subscription in the same component — a duplicate pull on every reconnect, and,
 * worse, two independent readings of one fact in one footer, which is the shape
 * this whole surface exists to stop. It passes the resolved value down instead,
 * so the pill and the pills cannot come to disagree.
 */
export function resolveCasparReach(
  link: BridgeLinkStatus,
  health: ConnectionHealth | null,
): CasparReach {
  if (link === 'offline-mock') return 'reachable';
  if (health === null) return link === 'disconnected' ? 'unreachable' : 'connecting';
  return isServerReachable(health.primary.state) ? 'reachable' : 'unreachable';
}
