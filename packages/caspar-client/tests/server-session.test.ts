import { afterEach, describe, expect, it } from 'vitest';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import { ServerSession, type ServerSessionEvents, type ServerSessionState } from '../src/index.js';

/**
 * The FSM is wired against the real amcp-mock — these are integration
 * tests, not unit tests, because the state transitions are inextricable
 * from socket lifecycles.
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

function trackStates(s: ServerSession): ServerSessionState[] {
  const states: ServerSessionState[] = [s.state];
  s.on('state-change', ({ to }) => states.push(to));
  return states;
}

async function setupHealthy(opts?: { oscHz?: number }): Promise<{
  mock: MockHandle;
  session: ServerSession;
  states: ServerSessionState[];
}> {
  mock = await createMock({
    amcpPort: 0,
    oscPort: 0,
    channels: 1,
    disableOsc: opts?.oscHz === undefined,
    oscHz: opts?.oscHz ?? 0,
  });
  session = new ServerSession({
    name: 'A',
    host: mock.host,
    port: mock.amcpPort,
    oscPort: 0,
    oscBindHost: '127.0.0.1',
    resyncDurationMs: 100,
    watcherIntervalMs: 100,
    initialBackoffMs: 50,
    maxBackoffMs: 200,
  });
  const states = trackStates(session);

  // Point the mock's OSC emitter at our bound port. We need to bind first
  // by calling start(), waiting for the listener to come up, then add the
  // observer. Trick: bind OSC before start() to know the port.
  // Easier path: start() lazily binds OSC via the loop. So start, then add observer.
  session.start();

  // Wait for OSC to bind. The session's `osc.port` is populated after listen() resolves.
  while (session.osc.port === 0) {
    await delay(5);
  }
  if (opts?.oscHz !== undefined) {
    // Re-create the mock pointing OSC at the session's bound port. Stop the previous
    // (disableOsc) mock first.
    await mock.stop();
    mock = await createMock({
      amcpPort: session['port'] as number,
      oscPort: session.osc.port,
      oscHost: '127.0.0.1',
      channels: 1,
      oscHz: opts.oscHz,
    });
  }

  return { mock, session, states };
}

describe('ServerSession', () => {
  it('walks DISCONNECTED → CONNECTING → HANDSHAKING → RESYNCING → HEALTHY on a clean start', async () => {
    const { session, states } = await setupHealthy();
    await once(session, 'healthy');
    expect(states).toContain('connecting');
    expect(states).toContain('handshaking');
    expect(states).toContain('resyncing');
    expect(states).toContain('healthy');
    expect(session.state).toBe('healthy');
  });

  it('reconnects with backoff when the peer closes', async () => {
    const { mock, session } = await setupHealthy();
    await once(session, 'healthy');

    mock.closeAllAmcpConnections();
    await once(session, 'healthy');
    expect(session.state).toBe('healthy');
    // backoff should reset after a fresh healthy
    expect(session.reconnectAttempts).toBe(0);
  });

  it('emits disconnected with a backoff reason between attempts', async () => {
    mock = await createMock({ amcpPort: 0, oscPort: 0, disableOsc: true });
    const sessionPort = mock.amcpPort;
    // Stop the mock so the first connect fails — session retries.
    await mock.stop();
    mock = undefined;

    session = new ServerSession({
      name: 'A',
      host: '127.0.0.1',
      port: sessionPort,
      oscPort: 0,
      oscBindHost: '127.0.0.1',
      initialBackoffMs: 50,
      maxBackoffMs: 100,
      resyncDurationMs: 50,
    });
    const disconnects: { reason: string }[] = [];
    session.on('disconnected', (info) => disconnects.push(info));
    session.start();

    await delay(300);
    expect(disconnects.length).toBeGreaterThanOrEqual(1);
    expect(disconnects[0]?.reason).toMatch(/backoff/);
  });

  it('transitions HEALTHY → DEGRADED on prolonged OSC silence', async () => {
    const { session, states } = await setupHealthy();
    await once(session, 'healthy');

    // No OSC traffic is being emitted (disableOsc: true), so eventually
    // the watcher should flip to DEGRADED. Watcher interval = 100ms,
    // degraded threshold = default 3000ms — far too slow for a test.
    // Override via reconfiguring is awkward; tighten via direct fast-forward.
    // Trick: stash the session, reach into the timers indirectly by waiting.
    await delay(50);
    // Force a synthetic stale lastOscAt by reaching in (test-only).
    (session as unknown as { lastOscAt: number }).lastOscAt = Date.now() - 5000;
    await delay(200);
    expect(states).toContain('degraded');
  });

  it('recovers HEALTHY when OSC comes back fresh', async () => {
    const { session, states } = await setupHealthy();
    await once(session, 'healthy');
    (session as unknown as { lastOscAt: number }).lastOscAt = Date.now() - 5000;
    await delay(200);
    expect(session.state).toBe('degraded');

    // Inject a fresh OSC arrival.
    (session as unknown as { lastOscAt: number }).lastOscAt = Date.now();
    await delay(200);
    expect(states).toContain('healthy');
  });

  it('stop() ends the loop and disposes everything', async () => {
    const { session } = await setupHealthy();
    await once(session, 'healthy');
    await session.stop();
    expect(session.state).toBe('disconnected');
  });

  it('stop() before start() resolves harmlessly', async () => {
    session = new ServerSession({
      name: 'A',
      host: '127.0.0.1',
      port: 5250,
      oscPort: 0,
      oscBindHost: '127.0.0.1',
    });
    await expect(session.stop()).resolves.toBeUndefined();
  });

  it('exposes the current queue + transports through getters', async () => {
    const { session } = await setupHealthy();
    await once(session, 'healthy');
    expect(session.amcp.isConnected).toBe(true);
    expect(session.osc.port).toBeGreaterThan(0);
    expect(session.queue.depth).toBe(0);
  });
});

function once<E extends keyof ServerSessionEvents>(s: ServerSession, event: E): Promise<void> {
  return new Promise((resolve) => {
    s.once(event, () => resolve());
  });
}
