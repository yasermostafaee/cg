import { afterEach, describe, expect, it } from 'vitest';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import {
  AmcpTransport,
  ServerSession,
  type ServerSessionOptions,
  type ServerSessionState,
} from '../src/index.js';

/**
 * B-101 — AMCP liveness is measured ON AMCP, never inferred from OSC silence.
 *
 * OSC is the CONFIRMATION channel; AMCP is the COMMAND channel. The watcher used
 * to read `oscDownAfterMs` of silence as proof the SOCKET was dead and force
 * `transitionTo('disconnected')`, which made the loop `destroy()` a perfectly
 * working TCP connection and reconnect — forever, on any install that never
 * sends OSC (B-094's condition, the install C-014 designs for). B-100 had just
 * made a `degraded` server accept every on-air verb; this loop is what limited
 * the operator to INTERMITTENT command capability rather than restored
 * capability.
 *
 * The fix asks the axis it intends to judge: when the degraded window expires the
 * session issues a bounded `VERSION` on the CURRENT queue. Answered → stay
 * `degraded`, keep the socket, re-arm. Failed → disconnect, for a reason AMCP
 * actually reported.
 *
 * These run against the real amcp-mock — the transitions are inextricable from
 * socket lifecycles, so they are integration tests like `server-session.test.ts`.
 */

let mock: MockHandle | undefined;
let session: ServerSession | undefined;

afterEach(async () => {
  if (session) {
    await session.stop();
    session = undefined;
  }
  if (mock) {
    await mock.stop();
    mock = undefined;
  }
});

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Poll rather than sleep a fixed budget: CI hosts vary widely and a wall-clock
 * `delay()` before an assertion is how these suites go flaky.
 */
async function waitUntil(pred: () => boolean, label: string, timeoutMs = 6000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!pred()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}`);
    await delay(5);
  }
}

/**
 * Tight timings so a test spends milliseconds where production spends seconds.
 * `oscDownAfterMs` is the probe window: how long OSC may be silent before we ask
 * AMCP whether it is alive, and the cadence of every re-ask after an answer.
 */
const TUNING = {
  oscDegradedAfterMs: 60,
  oscDownAfterMs: 120,
  watcherIntervalMs: 20,
  versionTimeoutMs: 150,
  resyncDurationMs: 40,
  initialBackoffMs: 25,
  maxBackoffMs: 50,
} as const;

interface Harness {
  mock: MockHandle;
  session: ServerSession;
  /** Every state transition with its reason, in order, from `start()`. */
  transitions: { to: ServerSessionState; reason: string }[];
  /** One entry per AMCP transport the session constructed — >1 means a reconnect. */
  amcpCreated: AmcpTransport[];
  /** VERSIONs the PEER actually saw: the handshake's, then each liveness probe. */
  versionCount: () => number;
}

/**
 * Boot a session against a mock that never sends OSC (`disableOsc`) — the
 * permanently-blind install, reproduced. The session reaches `healthy` over AMCP,
 * demotes on silence, and is then the fix's subject.
 */
async function boot(
  opts: { session?: Partial<ServerSessionOptions>; versionDelayMs?: number } = {},
): Promise<Harness> {
  const m = await createMock({ amcpPort: 0, oscPort: 0, channels: 1, disableOsc: true });
  mock = m;

  let versions = 0;
  m.setHandler('VERSION', async () => {
    versions++;
    if (opts.versionDelayMs !== undefined) await delay(opts.versionDelayMs);
    return { kind: 'ok-line', code: 201, verb: 'VERSION', data: '2.3.2 Stable' };
  });

  const amcpCreated: AmcpTransport[] = [];
  const s = new ServerSession({
    name: 'A',
    host: m.host,
    port: m.amcpPort,
    oscPort: 0,
    oscBindHost: '127.0.0.1',
    ...TUNING,
    createAmcp: (): AmcpTransport => {
      const t = new AmcpTransport();
      amcpCreated.push(t);
      return t;
    },
    ...opts.session,
  });
  session = s;

  const transitions: { to: ServerSessionState; reason: string }[] = [];
  s.on('state-change', ({ to, reason }) => transitions.push({ to, reason }));
  s.start();

  return { mock: m, session: s, transitions, amcpCreated, versionCount: (): number => versions };
}

/**
 * The peer stops answering while holding the TCP socket open — a half-open link.
 * The mock's dispatcher awaits the handler before writing, so a handler that never
 * settles produces exactly that: socket up, nothing coming back, no close emitted.
 */
const goMute = (m: MockHandle): void => {
  m.setHandler(
    'VERSION',
    () =>
      new Promise<never>(() => {
        /* the peer never replies */
      }),
  );
};

const degraded = (h: Harness): boolean => h.session.state === 'degraded';
const disconnected = (h: Harness): boolean => h.session.state === 'disconnected';
const dropReason = (h: Harness): string | undefined =>
  h.transitions.find((t) => t.to === 'disconnected')?.reason;

describe('B-101 — AMCP-probed liveness', () => {
  // The regression named in B-101's entry.
  it('an install that never delivers OSC HOLDS its AMCP link: degraded, socket never torn down', async () => {
    const h = await boot();
    await waitUntil(() => degraded(h), 'the demote to degraded');

    const transport = h.session.amcp;
    let peerClose = false;
    transport.on('close', () => {
      peerClose = true;
    });

    // Sit through at least three full probe windows. Pre-fix each one force-
    // disconnects and reconnects (its handshake VERSION is what advances the
    // count); post-fix each one is a probe the peer answers.
    await waitUntil(() => h.versionCount() >= 4, 'three liveness probes past the handshake');

    expect(h.session.state).toBe('degraded');
    // The SAME transport, the SAME TCP connection — never destroyed, never rotated.
    expect(h.session.amcp).toBe(transport);
    expect(transport.isConnected).toBe(true);
    expect(peerClose).toBe(false);
    expect(h.amcpCreated).toHaveLength(1);
    expect(h.mock.amcpClientCount).toBe(1);
    // No reconnect was attempted: no drop, and only the initial connect.
    expect(h.session.reconnectAttempts).toBe(0);
    expect(h.transitions.filter((t) => t.to === 'disconnected')).toEqual([]);
    expect(h.transitions.filter((t) => t.to === 'connecting')).toHaveLength(1);
  });

  // The safety net: the escalation was REPLACED, not deleted.
  it('OSC silent AND the peer stops answering: the probe fails and the reconnect loop runs', async () => {
    const h = await boot();
    await waitUntil(() => degraded(h), 'the demote to degraded');

    goMute(h.mock);

    await waitUntil(() => disconnected(h), 'the probe-driven disconnect');
    expect(dropReason(h)).toMatch(/amcp probe/);

    // The existing teardown/backoff/reconnect loop still runs — this time for a
    // reason AMCP reported rather than one OSC was blamed for.
    // Wait for the reconnect itself, not for `reconnectAttempts` — the loop
    // increments that when it computes the backoff, one delay BEFORE it reconnects.
    await waitUntil(
      () => h.transitions.filter((t) => t.to === 'connecting').length >= 2,
      'a second connect attempt',
    );
    expect(h.session.reconnectAttempts).toBeGreaterThanOrEqual(1);
    expect(h.amcpCreated.length).toBeGreaterThanOrEqual(2);
  });

  // The case `onAmcpClose` structurally cannot catch.
  it('a HALF-OPEN peer (socket up, answering nothing) is caught by the probe, not by a close', async () => {
    const h = await boot();
    await waitUntil(() => degraded(h), 'the demote to degraded');

    const transport = h.session.amcp;
    let peerClose = false;
    transport.on('close', () => {
      peerClose = true;
    });

    goMute(h.mock);
    // Both ends still hold the socket: the peer has simply stopped answering.
    expect(h.mock.amcpClientCount).toBe(1);
    expect(transport.isConnected).toBe(true);

    await waitUntil(() => disconnected(h), 'the probe-driven disconnect');
    // No FIN, no RST, so `onAmcpClose` never fired — the probe is the ONLY thing
    // that could have reached this verdict.
    expect(peerClose).toBe(false);
    expect(dropReason(h)).toMatch(/amcp probe/);
  });

  it('a peer that answers VERSION with an error code fails the probe too', async () => {
    const h = await boot();
    await waitUntil(() => degraded(h), 'the demote to degraded');

    h.mock.setHandler('VERSION', () => ({ kind: 'err', code: 500, verb: 'VERSION' }));

    await waitUntil(() => disconnected(h), 'the probe-driven disconnect');
    expect(dropReason(h)).toMatch(/amcp probe failed: code=500/);
  });

  it('probes never overlap: a probe slower than the watcher interval is not re-issued each tick', async () => {
    const h = await boot({
      versionDelayMs: 200,
      session: { versionTimeoutMs: 3000, oscDownAfterMs: 40, watcherIntervalMs: 10 },
    });
    await waitUntil(() => degraded(h), 'the demote to degraded');

    const atDegraded = h.versionCount();
    await delay(900);
    const probes = h.versionCount() - atDegraded;

    // 900 ms of 10 ms ticks past a 40 ms window is ~20 probe opportunities, but
    // each probe occupies 200 ms, so a guarded prober issues ~4. A count near the
    // tick count means the in-flight guard is missing.
    expect(probes).toBeGreaterThanOrEqual(1);
    expect(probes).toBeLessThanOrEqual(8);
    expect(h.session.state).toBe('degraded');
    expect(h.session.reconnectAttempts).toBe(0);
  });

  // NOT a frozen guard: pre-fix the session cannot even reach this state, because
  // the escalation has already destroyed the link by the time a second VERSION is
  // seen. What it pins is that the prober leaves the recovery path intact.
  it('OSC returning while degraded still recovers to healthy after a probe has answered', async () => {
    const h = await boot();
    await waitUntil(() => degraded(h), 'the demote to degraded');
    const transport = h.session.amcp;

    // Recover only AFTER a probe has answered, so recovery is tested on a session
    // the prober has actually touched.
    await waitUntil(() => h.versionCount() >= 2, 'one liveness probe past the handshake');

    (h.session as unknown as { lastOscAt: number }).lastOscAt = Date.now();

    await waitUntil(
      () => h.transitions.some((t) => t.to === 'healthy' && t.reason === 'osc recovered'),
      'the recovery to healthy',
    );
    expect(h.session.amcp).toBe(transport);
    expect(h.session.reconnectAttempts).toBe(0);
    expect(h.transitions.filter((t) => t.to === 'disconnected')).toEqual([]);
  });

  it('FROZEN: a genuine AMCP peer close still disconnects immediately from healthy', async () => {
    const h = await boot({ session: { oscDegradedAfterMs: 5000, oscDownAfterMs: 5000 } });
    await waitUntil(() => h.session.state === 'healthy', 'healthy');

    h.mock.closeAllAmcpConnections();

    await waitUntil(() => disconnected(h), 'the disconnect on peer close');
    expect(dropReason(h)).toBe('amcp peer closed');
  });

  it('FROZEN: a genuine AMCP peer close still disconnects immediately from degraded', async () => {
    // A long probe window so the session sits in `degraded` with no probe due —
    // the close, and only the close, is what disconnects it.
    const h = await boot({ session: { oscDownAfterMs: 5000 } });
    await waitUntil(() => degraded(h), 'the demote to degraded');

    h.mock.closeAllAmcpConnections();

    await waitUntil(() => disconnected(h), 'the disconnect on peer close');
    expect(dropReason(h)).toBe('amcp peer closed');
  });
});
