import type { ConnectionHealth } from '@cg/shared-ipc';

/**
 * THE THREE REACHABILITY STATES, as a named fixture every spec can select.
 *
 * ── WHY THIS EXISTS, AND WHY IT IS NOT A PER-FILE DEFAULT ───────────────────
 *
 * The console has TWO hops — browser→bridge and bridge→CasparCG — and therefore
 * three states that all occur in the field. Until this fixture, FIVE stub files
 * had no `connections.health` at all: every spec silently exercised whichever
 * behaviour the absent stub happened to produce, and the middle state — bridge
 * up, CasparCG down — was never reached by any test.
 *
 * That middle state is where essentially every defect reported over the last
 * several rounds lives: verbs enabled that send nothing and then error, labels
 * claiming air we cannot see, `ON PVW` failing with a mute error that was really
 * a reachability error. The suite had never been there.
 *
 * SO IT IS A FIXTURE, NOT A DEFAULT. Defaulting each stub to healthy would have
 * turned the tests green and left the hole exactly where it was — the state
 * would still be untested, just no longer noisy. Selecting a state by NAME makes
 * "which of the three is this spec about?" a question the spec has to answer.
 */
export type Reachability = 'both-up' | 'caspar-down' | 'bridge-down' | 'unknown' | 'test-mode';

/**
 * The browser→bridge link, as `useLink()` reports it.
 *
 * `test-mode` is the OFFLINE MOCK, and it is a reachability state in its own
 * right rather than a variant of `caspar-down`, because the two disagree about
 * the only thing this fixture is for: in test mode a verb DOES reach an executor
 * (the mock runs it), so every AMCP-emitting control stays live. Its health is
 * honestly `disconnected` — the mock never claims a server it does not have
 * (R-006) — which is precisely why a hook that answered from health alone
 * disabled the entire console in test mode and turned 14 E2E specs red.
 */
export function linkFor(state: Reachability): 'live' | 'disconnected' | 'offline-mock' {
  if (state === 'bridge-down') return 'disconnected';
  if (state === 'test-mode') return 'offline-mock';
  return 'live';
}

/**
 * The bridge→CasparCG health, as `useConnections()` reports it.
 *
 * `null` is the UNKNOWN state and is a real one, not a placeholder: the bridge
 * has not answered yet (boot, or the window after a reconnect). Callers must be
 * able to select it, because "unknown counts as unreachable" is a rule with its
 * own failure mode and it needs its own test.
 *
 * `bridge-down` also yields `null` — with no bridge there is nothing to ask
 * about CasparCG, which is the honest answer rather than a guess in either
 * direction.
 */
export function healthFor(state: Reachability): ConnectionHealth | null {
  if (state === 'unknown' || state === 'bridge-down') return null;
  // `test-mode` reports DISCONNECTED, matching the mock's own `seedHealth`. The
  // fixture keeps that honest rather than convenient: a spec asserting that test
  // mode keeps its verbs live must prove the hook ignores health there, which it
  // cannot do against a health this fixture quietly made healthy.
  return {
    primary: {
      label: 'A',
      // `degraded` is deliberately NOT used for `caspar-down`: degraded is
      // REACHABLE (AMCP up, OSC silent). The unreachable case has to be a state
      // that genuinely cannot take a command.
      state: state === 'both-up' ? 'healthy' : 'disconnected',
      amcpAxisOk: state === 'both-up',
    },
    currentPrimary: 'A',
    strategy: 'mirror-sync',
  };
}

/** The `window.cg.connections` half of a bridge stub, for a chosen state. */
export function connectionsStub(state: Reachability): {
  health: () => Promise<ConnectionHealth | null>;
  onHealthChanged: () => () => void;
} {
  return {
    health: () => Promise.resolve(healthFor(state)),
    onHealthChanged: () => () => undefined,
  };
}

/**
 * Every state a spec should sweep when it asserts a reachability rule.
 *
 * `caspar-down` and `unknown` are listed together because they must behave
 * IDENTICALLY for any AMCP-emitting control — unknown fails closed — and a spec
 * that checks only the first would pass while the second silently enabled a verb
 * on no evidence at all.
 */
export const UNREACHABLE_STATES: readonly Reachability[] = ['caspar-down', 'unknown'];
