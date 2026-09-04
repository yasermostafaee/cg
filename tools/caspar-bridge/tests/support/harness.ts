import { afterEach } from 'vitest';

/**
 * B-073 — shared release + budget helpers for the socket/timer integration suites.
 *
 * Two flake families motivated this module; both are structural, not "just retry":
 *
 * 1. **Cleanup that an assertion can skip.** A test that binds a server/socket and
 *    releases it on the LAST line of the test body leaks that resource for the rest
 *    of the fork the moment an earlier `expect` throws. A leaked listener poisons
 *    every later test in the file. `track()` registers the release at CREATION time,
 *    so it runs from `afterEach` no matter how the test exits.
 *
 * 2. **Wall-clock budgets on SETUP.** `whenServerHealthy(5000)` was the single
 *    failure signature under parallel CPU load ("declared CasparCG server(s) did not
 *    reach HEALTHY in time"). Reaching HEALTHY is connect → AMCP handshake → a 150 ms
 *    resync; the handshake's own `VERSION` timeout is 1 s. On a contended box one
 *    missed round-trip costs a timeout + backoff + a whole reconnect cycle, and two
 *    of those blow a 5 s budget. Health is SETUP for these tests — none of them is
 *    asserting "the handshake completes within 5 s" — so the budget must be generous
 *    enough that only a genuinely broken health path fails. It still fails loudly:
 *    a server that never goes healthy just fails `HEALTH_MS` later.
 *
 * 3. **An ambient one-shot inside a "nothing reaches the wire" window.** R-030's
 *    channel-mode read (`INFO <channel>`, priority `low`) rides the first sweep tick
 *    after the session goes live — a TIMER, decoupled from anything the test body
 *    does. On a quiet box a whole test body completes inside one sweep interval, so
 *    the one-shot lands outside every assertion window and the suite is green for
 *    months; under full-gate CPU load the body stretches, the tick lands between a
 *    `before` baseline and its `slice(before) → []` assertion, and an ambient
 *    `INFO 1` reads as take traffic (observed twice, in live-seating's refusal
 *    cases, gate runs only). A negative observation is valid only from a
 *    PROVEN-QUIESCENT wire, so a boot whose tests baseline the wire calls
 *    `awaitChannelModeRead` first: it WAITS for the one-shot to complete instead of
 *    filtering it out of the assertion — the assertions stay exact, and if R-030's
 *    read ever stops happening, boot fails loudly rather than letting the silence
 *    pass vacuously.
 */

/**
 * Budget for `whenServerHealthy()` in tests. Deliberately far above the ~150 ms a
 * healthy handshake really takes: it is a liveness bound, NOT a performance assert.
 */
export const HEALTH_MS = 15_000;

/**
 * Upper bound for a "teardown is BOUNDED, not wedged" assertion.
 *
 * The property under test is that `stop()` completes at all — the CEF wedge it guards
 * would hang forever. The server's internal grace deadline is 500 ms, so any finite
 * ceiling proves the property; the old 1000/1500 ms ceilings additionally encoded "and
 * this box schedules promptly", which a contended fork simply does not. A real wedge
 * still fails, via the test timeout.
 */
export const BOUNDED_STOP_MS = 5_000;

/**
 * Wait until R-030's one-shot channel-mode read has COMPLETED — flake family 3's
 * quiescence control.
 *
 * The wait is on the read's own latch, not on the wire: `observed` gains its entry
 * in the same block that sets `#modeReadFrom` (the guard that stops re-sends), so
 * when this returns, every mode-read `INFO` this connection will ever send is
 * already in the trace and a baseline taken now excludes all of it. The other two
 * ambient emitters are structurally silent in these harnesses: R-022's volume
 * re-assert fires once with zero declared rows, and the `VERSION` liveness probe
 * needs OSC silence while the mock streams OSC continuously.
 */
export async function awaitChannelModeRead(runtime: {
  channelSettingsState(): { observed: readonly unknown[] };
  health(): { primary: { outputs?: readonly unknown[] | undefined } };
}): Promise<void> {
  const deadline = Date.now() + HEALTH_MS;
  while (runtime.channelSettingsState().observed.length === 0) {
    if (Date.now() >= deadline) {
      throw new Error(
        "R-030's one-shot channel-mode read never completed — the quiescent-wire " +
          'baseline cannot be established (did the sweep or the INFO reply break?)',
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  /*
    `C-029` — the SAME first tick also sends one `INFO CONFIG` (the declared-consumer half of
    the program-output check; the running half rides the mode read's own reply). Its latch
    is the `outputs` entry in health, set when both halves have landed — so this waits for
    it too, and a baseline taken afterwards excludes every ambient INFO this connection
    sends until the 60 s re-check, which no test body reaches.
  */
  while (runtime.health().primary.outputs === undefined) {
    if (Date.now() >= deadline) {
      throw new Error(
        "C-029's one-shot output check never completed — the quiescent-wire baseline " +
          'cannot be established (did INFO CONFIG stop answering, or the check stop latching?)',
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

type Release = () => Promise<void> | void;

const releases: Release[] = [];

/**
 * Register `resource` for guaranteed release and return it unchanged.
 *
 * Call at the moment the resource is BOUND, never after the assertions:
 *
 * ```ts
 * const server = track(new TemplateHttpServer(html), (s) => s.stop());
 * const sock = track(net.connect(port, '127.0.0.1'), (s) => { s.destroy(); });
 * ```
 */
export function track<T>(resource: T, release: (r: T) => Promise<void> | void): T {
  releases.push(() => release(resource));
  return resource;
}

/** Release everything `track()`ed by the current test, newest first. */
afterEach(async () => {
  const failures: unknown[] = [];
  // LIFO: sockets before the server they connect to. One failing release must
  // never strand the rest — collect and report at the end.
  for (const release of releases.splice(0).reverse()) {
    try {
      await release();
    } catch (err) {
      failures.push(err);
    }
  }
  if (failures.length > 0) {
    throw new AggregateError(failures, 'tracked test resources failed to release');
  }
});
