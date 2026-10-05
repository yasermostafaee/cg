import { afterEach, describe, expect, it } from 'vitest';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import {
  AmcpTransport,
  CommandQueue,
  InMemoryJournal,
  RedundancyAdapter,
  type RedundancyStrategy,
  type ServerSession,
  type ServerSessionState,
} from '../src/index.js';
import { track } from './support/harness.js';

/**
 * `B-316` — most tests here are about the fan-out's MECHANICS, on two mocks that carry the same channel
 * numbers by construction, so server B's line is server A's — SAID here, because the adapter has no
 * default: it refuses a server B without a `serverBLine`. Writing B's own number is its own subject (the
 * `B-316` block below).
 */
const SAME_NUMBERS_ON_B = (line: string): string => line;

/**
 * RedundancyAdapter integration tests against two parallel amcp-mock
 * instances representing CasparCG A + B. ServerSession's full FSM is
 * not driven here — we hand-build the minimum (transport + queue) so
 * the tests are deterministic.
 */

interface Setup {
  mocks: [MockHandle, MockHandle];
  transports: [AmcpTransport, AmcpTransport];
  queues: [CommandQueue, CommandQueue];
  sessions: { A: ServerSession; B: ServerSession };
  adapter: RedundancyAdapter;
}

let active: Setup | undefined;

afterEach(async () => {
  if (active === undefined) return;
  for (const q of active.queues) q.dispose();
  for (const t of active.transports) t.destroy();
  for (const m of active.mocks) await m.stop();
  active = undefined;
});

async function setup(
  strategy: RedundancyStrategy,
  serverBLine: (line: string) => string | null = SAME_NUMBERS_ON_B,
): Promise<Setup> {
  const mockA = await createMock({ amcpPort: 0, oscPort: 0, disableOsc: true });
  const mockB = await createMock({ amcpPort: 0, oscPort: 0, disableOsc: true });
  const transportA = new AmcpTransport();
  await transportA.connect(mockA.host, mockA.amcpPort);
  const transportB = new AmcpTransport();
  await transportB.connect(mockB.host, mockB.amcpPort);
  const queueA = new CommandQueue(transportA);
  const queueB = new CommandQueue(transportB);

  // We don't want to drive the full ServerSession FSM here; instead we
  // hand-build minimal session-like objects that satisfy the adapter's
  // contract: a `queue` getter, a `state` getter, and an EventEmitter
  // that emits `state-change`.
  const sessionA = makeFakeSession('A', queueA);
  const sessionB = makeFakeSession('B', queueB);

  const adapter = new RedundancyAdapter({
    strategy,
    sessions: { A: sessionA, B: sessionB },
    serverBLine,
    autoFailoverEnabled: true,
    commandTimeoutBudget: 2,
    fiveXxBudget: 2,
    fiveXxWindowMs: 1000,
  });

  active = {
    mocks: [mockA, mockB],
    transports: [transportA, transportB],
    queues: [queueA, queueB],
    sessions: { A: sessionA, B: sessionB },
    adapter,
  };
  return active;
}

import { EventEmitter } from 'node:events';
function makeFakeSession(
  label: 'A' | 'B',
  queue: CommandQueue,
  initialState: ServerSessionState = 'healthy',
): ServerSession {
  const holder = { state: initialState };
  const e = new EventEmitter() as unknown as ServerSession;
  Object.defineProperty(e, 'name', { value: label });
  Object.defineProperty(e, 'queue', { value: queue });
  Object.defineProperty(e, 'state', { get: () => holder.state, configurable: true });
  Object.defineProperty(e, '__stateHolder', { value: holder });
  return e;
}

/** Mutate a fake session's state and emit the real `state-change` shape. */
function setSessionState(session: ServerSession, to: ServerSessionState): void {
  const holder = (session as unknown as { __stateHolder: { state: ServerSessionState } })
    .__stateHolder;
  const from = holder.state;
  holder.state = to;
  (session as unknown as EventEmitter).emit('state-change', { from, to, reason: 'test' });
}

describe('RedundancyAdapter — mirror-sync', () => {
  it('fans out to both sessions and returns the primary ack', async () => {
    const { adapter, mocks } = await setup('mirror-sync');
    const seenA: string[] = [];
    const seenB: string[] = [];
    mocks[0].setHandler('PLAY', (req) => {
      seenA.push(req.args[0] ?? '?');
      return { kind: 'ok', code: 202, verb: 'PLAY' };
    });
    mocks[1].setHandler('PLAY', (req) => {
      seenB.push(req.args[0] ?? '?');
      return { kind: 'ok', code: 202, verb: 'PLAY' };
    });
    const result = await adapter.send('PLAY 1-10 "a" HTML');
    expect(result.winner).toBe('A');
    expect(seenA).toEqual(['1-10']);
    expect(seenB).toEqual(['1-10']);
    expect(adapter.journal.all()[0]?.outcome).toBe('ok');
  });

  it('emits mirror-divergence when ack codes differ', async () => {
    const { adapter, mocks } = await setup('mirror-sync');
    mocks[0].setHandler('PLAY', () => ({ kind: 'ok', code: 202, verb: 'PLAY' }));
    mocks[1].setHandler('PLAY', () => ({ kind: 'err', code: 404, verb: 'PLAY' }));
    const events: { seq: number; primaryCode: number; backupCode: number }[] = [];
    adapter.on('mirror-divergence', (info) => events.push(info));
    await adapter.send('PLAY 1-10 "a" HTML');
    expect(events).toHaveLength(1);
    expect(events[0]?.primaryCode).toBe(202);
    expect(events[0]?.backupCode).toBe(404);
  });
});

describe('RedundancyAdapter — mirror-async', () => {
  it('returns primary ack immediately and journals', async () => {
    const { adapter, mocks } = await setup('mirror-async');
    mocks[0].setHandler('PLAY', () => ({ kind: 'ok', code: 202, verb: 'PLAY' }));
    mocks[1].setHandler('PLAY', () => ({ kind: 'ok', code: 202, verb: 'PLAY' }));
    const result = await adapter.send('PLAY 1-10 "a" HTML');
    expect(result.response.code).toBe(202);
    expect(adapter.journal.all()).toHaveLength(1);
  });

  it('fires mirror-divergence when the async backup ack differs', async () => {
    const { adapter, mocks } = await setup('mirror-async');
    mocks[0].setHandler('PLAY', () => ({ kind: 'ok', code: 202, verb: 'PLAY' }));
    mocks[1].setHandler('PLAY', () => ({ kind: 'err', code: 500, verb: 'PLAY' }));
    const events: { primaryCode: number; backupCode: number }[] = [];
    adapter.on('mirror-divergence', (info) => events.push(info));
    await adapter.send('PLAY 1-10 "a" HTML');
    // Backup is fire-and-forget; give it a moment to settle.
    await new Promise((r) => setTimeout(r, 50));
    expect(events.length).toBeGreaterThan(0);
  });
});

describe('RedundancyAdapter — journal-replay', () => {
  it('only sends to the primary in steady state', async () => {
    const { adapter, mocks } = await setup('journal-replay');
    const seenA: string[] = [];
    const seenB: string[] = [];
    mocks[0].setHandler('PLAY', (req) => {
      seenA.push(req.args[0] ?? '?');
      return { kind: 'ok', code: 202, verb: 'PLAY' };
    });
    mocks[1].setHandler('PLAY', (req) => {
      seenB.push(req.args[0] ?? '?');
      return { kind: 'ok', code: 202, verb: 'PLAY' };
    });
    await adapter.send('PLAY 1-10 "a" HTML');
    expect(seenA).toEqual(['1-10']);
    expect(seenB).toEqual([]); // backup is cold
  });

  it('replays the journal to the backup on failover', async () => {
    const { adapter, mocks } = await setup('journal-replay');
    const seenB: string[] = [];
    mocks[0].setHandler('PLAY', () => ({ kind: 'ok', code: 202, verb: 'PLAY' }));
    mocks[1].setHandler('PLAY', (req) => {
      seenB.push(req.args[0] ?? '?');
      return { kind: 'ok', code: 202, verb: 'PLAY' };
    });
    await adapter.send('PLAY 1-10 "a" HTML');
    await adapter.send('PLAY 1-11 "b" HTML');

    await adapter.failover('manual');
    expect(adapter.currentPrimary).toBe('B');
    expect(seenB).toEqual(['1-10', '1-11']);
  });
});

describe('RedundancyAdapter — failover', () => {
  it('flips primary on manual failover', async () => {
    const { adapter } = await setup('mirror-sync');
    expect(adapter.currentPrimary).toBe('A');
    await adapter.failover('manual');
    expect(adapter.currentPrimary).toBe('B');
  });

  it('emits failover-requested then failover-complete', async () => {
    const { adapter } = await setup('mirror-sync');
    const events: string[] = [];
    adapter.on('failover-requested', () => events.push('req'));
    adapter.on('failover-complete', () => events.push('done'));
    await adapter.failover('manual');
    expect(events).toEqual(['req', 'done']);
  });

  it('does not auto-failover when autoFailoverEnabled=false', async () => {
    const mockA = track(await createMock({ amcpPort: 0, oscPort: 0, disableOsc: true }), (m) =>
      m.stop(),
    );
    const mockB = track(await createMock({ amcpPort: 0, oscPort: 0, disableOsc: true }), (m) =>
      m.stop(),
    );
    const transportA = track(new AmcpTransport(), (t) => {
      t.destroy();
    });
    await transportA.connect(mockA.host, mockA.amcpPort);
    const transportB = track(new AmcpTransport(), (t) => {
      t.destroy();
    });
    await transportB.connect(mockB.host, mockB.amcpPort);
    const queueA = track(new CommandQueue(transportA), (q) => {
      q.dispose();
    });
    const queueB = track(new CommandQueue(transportB), (q) => {
      q.dispose();
    });
    const sessionA = makeFakeSession('A', queueA);
    const sessionB = makeFakeSession('B', queueB);
    const adapter = new RedundancyAdapter({
      strategy: 'mirror-sync',
      sessions: { A: sessionA, B: sessionB },
      serverBLine: SAME_NUMBERS_ON_B,
      autoFailoverEnabled: false,
    });

    // Auto reasons should be ignored.
    await adapter.failover('osc-silence');
    expect(adapter.currentPrimary).toBe('A');
    // Manual still works.
    await adapter.failover('manual');
    expect(adapter.currentPrimary).toBe('B');
  });

  it('detectSplitBrain returns 0 when views agree', async () => {
    const { adapter } = await setup('mirror-sync');
    const a = new Map([
      ['1:10', 'html'],
      ['1:20', 'empty'],
    ]);
    const b = new Map([
      ['1:10', 'html'],
      ['1:20', 'empty'],
    ]);
    expect(adapter.detectSplitBrain(a, b)).toBe(0);
  });

  it('detectSplitBrain emits and returns the disagreement count', async () => {
    const { adapter } = await setup('mirror-sync');
    const events: { slots: number }[] = [];
    adapter.on('split-brain', (info) => events.push(info));
    const a = new Map([
      ['1:10', 'html'],
      ['1:20', 'empty'],
    ]);
    const b = new Map([
      ['1:10', 'empty'],
      ['1:20', 'empty'],
    ]);
    expect(adapter.detectSplitBrain(a, b)).toBe(1);
    expect(events).toHaveLength(1);
    expect(events[0]?.slots).toBe(1);
  });
});

describe('RedundancyAdapter — B-046 dead backup is quiet and memory-bounded', () => {
  it('a declared-but-dead backup produces no divergence/split-brain/replay; journal stays capped', async () => {
    const mockA = track(await createMock({ amcpPort: 0, oscPort: 0, disableOsc: true }), (m) =>
      m.stop(),
    );
    const transportA = track(new AmcpTransport(), (t) => {
      t.destroy();
    });
    await transportA.connect(mockA.host, mockA.amcpPort);
    const queueA = track(new CommandQueue(transportA), (q) => {
      q.dispose();
    });
    // B is declared but DOWN: an unconnected transport (every enqueue rejects
    // with "socket not writable", like the real bridge's dead 5251) and a
    // session that knows it is disconnected.
    const transportB = track(new AmcpTransport(), (t) => {
      t.destroy();
    });
    const queueB = track(new CommandQueue(transportB), (q) => {
      q.dispose();
    });
    const sessionA = makeFakeSession('A', queueA);
    const sessionB = makeFakeSession('B', queueB, 'disconnected');
    const adapter = new RedundancyAdapter({
      strategy: 'mirror-sync',
      sessions: { A: sessionA, B: sessionB },
      serverBLine: SAME_NUMBERS_ON_B,
      autoFailoverEnabled: false,
      journal: new InMemoryJournal({ maxEntries: 10 }),
      divergenceBudget: 2,
      divergenceWindowMs: 60_000,
    });
    mockA.setHandler('PLAY', () => ({ kind: 'ok', code: 202, verb: 'PLAY' }));

    const divergences: unknown[] = [];
    const persistent: unknown[] = [];
    const resends: unknown[] = [];
    adapter.on('mirror-divergence', (i) => divergences.push(i));
    adapter.on('split-brain-persistent', (i) => persistent.push(i));
    adapter.on('corrective-resend', (i) => resends.push(i));

    for (let i = 0; i < 25; i++) {
      const result = await adapter.send(`PLAY 1-${String(10 + i)} "x" HTML`);
      expect(result.winner).toBe('A');
    }
    await new Promise((r) => setTimeout(r, 50));

    expect(divergences).toHaveLength(0);
    expect(persistent).toHaveLength(0);
    expect(resends).toHaveLength(0);
    expect(adapter.journal.all().length).toBeLessThanOrEqual(10);
  });

  it('a LIVE backup that fails a send still counts as divergence', async () => {
    const mockA = track(await createMock({ amcpPort: 0, oscPort: 0, disableOsc: true }), (m) =>
      m.stop(),
    );
    const transportA = track(new AmcpTransport(), (t) => {
      t.destroy();
    });
    await transportA.connect(mockA.host, mockA.amcpPort);
    const queueA = track(new CommandQueue(transportA), (q) => {
      q.dispose();
    });
    // B claims to be healthy but its transport is gone — a live peer failing
    // a mirrored command is REAL evidence, not expected downtime.
    const transportB = track(new AmcpTransport(), (t) => {
      t.destroy();
    });
    const queueB = track(new CommandQueue(transportB), (q) => {
      q.dispose();
    });
    const sessionA = makeFakeSession('A', queueA);
    const sessionB = makeFakeSession('B', queueB, 'healthy');
    const adapter = new RedundancyAdapter({
      strategy: 'mirror-sync',
      sessions: { A: sessionA, B: sessionB },
      serverBLine: SAME_NUMBERS_ON_B,
      autoFailoverEnabled: false,
    });
    mockA.setHandler('PLAY', () => ({ kind: 'ok', code: 202, verb: 'PLAY' }));

    const divergences: { backupCode: number }[] = [];
    adapter.on('mirror-divergence', (i) => divergences.push(i));
    await adapter.send('PLAY 1-10 "x" HTML');
    expect(divergences).toHaveLength(1);
    expect(divergences[0]?.backupCode).toBe(-1);
  });
});

describe('RedundancyAdapter — B-046 single-server (no declared backup)', () => {
  it('sends primary-only, refuses failover, and has no split-brain surface', async () => {
    const mockA = track(await createMock({ amcpPort: 0, oscPort: 0, disableOsc: true }), (m) =>
      m.stop(),
    );
    const transportA = track(new AmcpTransport(), (t) => {
      t.destroy();
    });
    await transportA.connect(mockA.host, mockA.amcpPort);
    const queueA = track(new CommandQueue(transportA), (q) => {
      q.dispose();
    });
    const sessionA = makeFakeSession('A', queueA);
    const adapter = new RedundancyAdapter({
      strategy: 'mirror-sync',
      sessions: { A: sessionA },
      autoFailoverEnabled: true,
    });
    const seenA: string[] = [];
    mockA.setHandler('PLAY', (req) => {
      seenA.push(req.args[0] ?? '?');
      return { kind: 'ok', code: 202, verb: 'PLAY' };
    });

    const events: string[] = [];
    adapter.on('mirror-divergence', () => events.push('divergence'));
    adapter.on('split-brain', () => events.push('split-brain'));
    adapter.on('split-brain-persistent', () => events.push('persistent'));
    adapter.on('corrective-resend', () => events.push('resend'));

    const result = await adapter.send('PLAY 1-10 "a" HTML');
    expect(result.winner).toBe('A');
    expect(seenA).toEqual(['1-10']);
    expect(adapter.backupSession).toBeNull();
    expect(adapter.journal.all()[0]?.target).toBe('primary');

    // Failover has nothing to switch to — refused, manual or auto.
    expect(await adapter.failover('manual')).toBe(false);
    expect(await adapter.failover('osc-silence')).toBe(false);
    expect(adapter.currentPrimary).toBe('A');

    // No second brain to split.
    expect(adapter.detectSplitBrain(new Map([['1:10', 'html']]), new Map())).toBe(0);
    expect(events).toEqual([]);
  });
});

describe('RedundancyAdapter — B-046 health dedupe', () => {
  it('a reconnect-flapping backup publishes "down" once, not per micro-transition', async () => {
    const { adapter, sessions } = await setup('mirror-sync');
    const healths: { backup?: { state: string } }[] = [];
    adapter.on('health', (h) => healths.push(h));

    setSessionState(sessions.B, 'disconnected');
    setSessionState(sessions.B, 'connecting');
    setSessionState(sessions.B, 'disconnected');
    setSessionState(sessions.B, 'connecting');
    expect(healths).toHaveLength(1);
    expect(healths[0]?.backup?.state).toBe('disconnected');

    setSessionState(sessions.B, 'healthy');
    expect(healths).toHaveLength(2);
    expect(healths[1]?.backup?.state).toBe('healthy');
  });
});

describe('RedundancyAdapter — B-047 failover triggers follow the CURRENT primary', () => {
  it('after failover A→B, killing B fires the auto trigger; the demoted A cannot ping-pong it back', async () => {
    const { adapter, sessions } = await setup('mirror-sync');
    await adapter.failover('manual');
    expect(adapter.currentPrimary).toBe('B');

    const requested: { reason: string; from: 'A' | 'B'; to: 'A' | 'B' }[] = [];
    adapter.on('failover-requested', (e) => requested.push(e));

    // The demoted A keeps reconnect-looping (the phantom/dead-server churn) —
    // its state changes must NOT trigger a failover back onto a corpse.
    (sessions.A as unknown as EventEmitter).emit('state-change', {
      from: 'healthy',
      to: 'disconnected',
      reason: 'amcp peer closed',
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(requested).toHaveLength(0);
    expect(adapter.currentPrimary).toBe('B');

    // The CURRENT primary (B) dies — the auto trigger MUST fire off B.
    (sessions.B as unknown as EventEmitter).emit('state-change', {
      from: 'healthy',
      to: 'disconnected',
      reason: 'amcp peer closed',
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(requested.length).toBeGreaterThan(0);
    expect(requested[0]?.from).toBe('B');
    expect(requested[0]?.to).toBe('A');
  });
});

describe('RedundancyAdapter — M9.1 persistent divergence + corrective resend', () => {
  async function setupWithDivergenceBudget(budget: number): Promise<Setup> {
    const mockA = await createMock({ amcpPort: 0, oscPort: 0, disableOsc: true });
    const mockB = await createMock({ amcpPort: 0, oscPort: 0, disableOsc: true });
    const transportA = new AmcpTransport();
    await transportA.connect(mockA.host, mockA.amcpPort);
    const transportB = new AmcpTransport();
    await transportB.connect(mockB.host, mockB.amcpPort);
    const queueA = new CommandQueue(transportA);
    const queueB = new CommandQueue(transportB);
    const sessionA = makeFakeSession('A', queueA);
    const sessionB = makeFakeSession('B', queueB);
    const adapter = new RedundancyAdapter({
      strategy: 'mirror-sync',
      sessions: { A: sessionA, B: sessionB },
      serverBLine: SAME_NUMBERS_ON_B,
      autoFailoverEnabled: true,
      divergenceBudget: budget,
      divergenceWindowMs: 60_000,
    });
    active = {
      mocks: [mockA, mockB],
      transports: [transportA, transportB],
      queues: [queueA, queueB],
      sessions: { A: sessionA, B: sessionB },
      adapter,
    };
    return active;
  }

  it('does NOT escalate when divergences stay under the budget', async () => {
    const { adapter, mocks } = await setupWithDivergenceBudget(3);
    mocks[0].setHandler('PLAY', () => ({ kind: 'ok', code: 202, verb: 'PLAY' }));
    mocks[1].setHandler('PLAY', () => ({ kind: 'err', code: 404, verb: 'PLAY' }));
    const persistent: unknown[] = [];
    adapter.on('split-brain-persistent', (info) => persistent.push(info));
    await adapter.send('PLAY 1-10 "a" HTML');
    await adapter.send('PLAY 1-11 "b" HTML');
    expect(persistent).toHaveLength(0);
  });

  it('emits split-brain-persistent + corrective-resend when divergences cross budget', async () => {
    const { adapter, mocks } = await setupWithDivergenceBudget(2);
    mocks[0].setHandler('PLAY', () => ({ kind: 'ok', code: 202, verb: 'PLAY' }));
    mocks[1].setHandler('PLAY', () => ({ kind: 'err', code: 404, verb: 'PLAY' }));
    const persistent: { divergencesInWindow: number }[] = [];
    const resends: { seq: number; line: string; target: 'A' | 'B' }[] = [];
    adapter.on('split-brain-persistent', (info) => persistent.push(info));
    adapter.on('corrective-resend', (info) => resends.push(info));
    await adapter.send('PLAY 1-10 "a" HTML');
    await adapter.send('PLAY 1-11 "b" HTML');
    // Give the async corrective resend a moment to enqueue.
    await new Promise((r) => setTimeout(r, 50));
    expect(persistent).toHaveLength(1);
    expect(persistent[0]?.divergencesInWindow).toBeGreaterThanOrEqual(2);
    expect(resends.length).toBeGreaterThan(0);
    expect(resends.every((r) => r.target === 'B')).toBe(true);
  });

  it('replays the RIGHT entries: every retained ok line, in order, to the live backup', async () => {
    const mockA = track(await createMock({ amcpPort: 0, oscPort: 0, disableOsc: true }), (m) =>
      m.stop(),
    );
    const mockB = track(await createMock({ amcpPort: 0, oscPort: 0, disableOsc: true }), (m) =>
      m.stop(),
    );
    const transportA = track(new AmcpTransport(), (t) => {
      t.destroy();
    });
    await transportA.connect(mockA.host, mockA.amcpPort);
    const transportB = track(new AmcpTransport(), (t) => {
      t.destroy();
    });
    await transportB.connect(mockB.host, mockB.amcpPort);
    const queueA = track(new CommandQueue(transportA), (q) => {
      q.dispose();
    });
    const queueB = track(new CommandQueue(transportB), (q) => {
      q.dispose();
    });
    const adapter = new RedundancyAdapter({
      strategy: 'mirror-sync',
      sessions: { A: makeFakeSession('A', queueA), B: makeFakeSession('B', queueB) },
      serverBLine: SAME_NUMBERS_ON_B,
      autoFailoverEnabled: false,
      divergenceBudget: 3,
      divergenceWindowMs: 60_000,
    });
    mockA.setHandler('PLAY', () => ({ kind: 'ok', code: 202, verb: 'PLAY' }));
    mockB.setHandler('PLAY', () => ({ kind: 'err', code: 404, verb: 'PLAY' }));

    const resends: { line: string; target: 'A' | 'B' }[] = [];
    adapter.on('corrective-resend', (info) => resends.push(info));

    const lines = ['PLAY 1-10 "a" HTML', 'PLAY 1-11 "b" HTML', 'PLAY 1-12 "c" HTML'];
    for (const line of lines) await adapter.send(line);
    await new Promise((r) => setTimeout(r, 50));

    // The 3rd divergence crossed the budget — the resend replays every
    // ok-resolved journal entry, in order, and only at the backup.
    expect(resends.map((r) => r.line)).toEqual(lines);
    expect(resends.every((r) => r.target === 'B')).toBe(true);
  });

  it('with a capped journal, the resend replays exactly the retained tail', async () => {
    const mockA = track(await createMock({ amcpPort: 0, oscPort: 0, disableOsc: true }), (m) =>
      m.stop(),
    );
    const mockB = track(await createMock({ amcpPort: 0, oscPort: 0, disableOsc: true }), (m) =>
      m.stop(),
    );
    const transportA = track(new AmcpTransport(), (t) => {
      t.destroy();
    });
    await transportA.connect(mockA.host, mockA.amcpPort);
    const transportB = track(new AmcpTransport(), (t) => {
      t.destroy();
    });
    await transportB.connect(mockB.host, mockB.amcpPort);
    const queueA = track(new CommandQueue(transportA), (q) => {
      q.dispose();
    });
    const queueB = track(new CommandQueue(transportB), (q) => {
      q.dispose();
    });
    const adapter = new RedundancyAdapter({
      strategy: 'mirror-sync',
      sessions: { A: makeFakeSession('A', queueA), B: makeFakeSession('B', queueB) },
      serverBLine: SAME_NUMBERS_ON_B,
      autoFailoverEnabled: false,
      journal: new InMemoryJournal({ maxEntries: 2 }),
      divergenceBudget: 3,
      divergenceWindowMs: 60_000,
    });
    mockA.setHandler('PLAY', () => ({ kind: 'ok', code: 202, verb: 'PLAY' }));
    mockB.setHandler('PLAY', () => ({ kind: 'err', code: 404, verb: 'PLAY' }));

    const resends: { line: string }[] = [];
    adapter.on('corrective-resend', (info) => resends.push(info));

    const lines = ['PLAY 1-10 "a" HTML', 'PLAY 1-11 "b" HTML', 'PLAY 1-12 "c" HTML'];
    for (const line of lines) await adapter.send(line);
    await new Promise((r) => setTimeout(r, 50));

    // maxEntries=2 evicted the first line — the replay is the retained tail.
    expect(resends.map((r) => r.line)).toEqual(['PLAY 1-11 "b" HTML', 'PLAY 1-12 "c" HTML']);
  });

  it('correctiveResendEnabled=false leaves the journal alone', async () => {
    const mockA = track(await createMock({ amcpPort: 0, oscPort: 0, disableOsc: true }), (m) =>
      m.stop(),
    );
    const mockB = track(await createMock({ amcpPort: 0, oscPort: 0, disableOsc: true }), (m) =>
      m.stop(),
    );
    const transportA = track(new AmcpTransport(), (t) => {
      t.destroy();
    });
    await transportA.connect(mockA.host, mockA.amcpPort);
    const transportB = track(new AmcpTransport(), (t) => {
      t.destroy();
    });
    await transportB.connect(mockB.host, mockB.amcpPort);
    const queueA = track(new CommandQueue(transportA), (q) => {
      q.dispose();
    });
    const queueB = track(new CommandQueue(transportB), (q) => {
      q.dispose();
    });
    const adapter = new RedundancyAdapter({
      strategy: 'mirror-sync',
      sessions: { A: makeFakeSession('A', queueA), B: makeFakeSession('B', queueB) },
      serverBLine: SAME_NUMBERS_ON_B,
      autoFailoverEnabled: true,
      divergenceBudget: 1,
      correctiveResendEnabled: false,
    });
    mockA.setHandler('PLAY', () => ({ kind: 'ok', code: 202, verb: 'PLAY' }));
    mockB.setHandler('PLAY', () => ({ kind: 'err', code: 404, verb: 'PLAY' }));
    const persistent: unknown[] = [];
    const resends: unknown[] = [];
    adapter.on('split-brain-persistent', (info) => persistent.push(info));
    adapter.on('corrective-resend', (info) => resends.push(info));
    await adapter.send('PLAY 1-10 "a" HTML');
    await new Promise((r) => setTimeout(r, 50));
    expect(persistent).toHaveLength(1);
    expect(resends).toHaveLength(0);
  });
});

describe('RedundancyAdapter — ROUTE-PLATES-01 a line with `mirror: false`', () => {
  const route = 'PLAY 1-60 "route://9-12"';

  it.each(['mirror-sync', 'mirror-async', 'journal-replay'] as const)(
    '%s: reaches the primary only, is never journaled, and no failover replays it',
    async (strategy) => {
      const { adapter, mocks } = await setup(strategy);
      const seenA: string[] = [];
      const seenB: string[] = [];
      mocks[0].setHandler('PLAY', (req) => {
        seenA.push(req.args[1] ?? '?');
        return { kind: 'ok', code: 202, verb: 'PLAY' };
      });
      mocks[1].setHandler('PLAY', (req) => {
        seenB.push(req.args[1] ?? '?');
        return { kind: 'ok', code: 202, verb: 'PLAY' };
      });
      const result = await adapter.send(route, { mirror: false });
      expect(result.winner).toBe('A');
      expect(result.response.code).toBe(202);
      // Let a fire-and-forget backup send (mirror-async) land if one had been made.
      await new Promise((r) => setTimeout(r, 50));
      expect(seenA).toEqual(['route://9-12']);
      expect(seenB).toEqual([]);
      expect(adapter.journal.all()).toEqual([]);

      await adapter.failover('manual');
      expect(adapter.currentPrimary).toBe('B');
      expect(seenB, 'nothing replayed the route to the backup').toEqual([]);
    },
  );

  it('the same line without the option is mirrored (the control)', async () => {
    const { adapter, mocks } = await setup('mirror-sync');
    const seenB: string[] = [];
    mocks[0].setHandler('PLAY', () => ({ kind: 'ok', code: 202, verb: 'PLAY' }));
    mocks[1].setHandler('PLAY', (req) => {
      seenB.push(req.args[1] ?? '?');
      return { kind: 'ok', code: 202, verb: 'PLAY' };
    });
    await adapter.send(route);
    expect(seenB).toEqual(['route://9-12']);
    expect(adapter.journal.all()).toHaveLength(1);
  });
});

/**
 * 🔴 `PLAYOUT-FEATURES-01` A (`B-286`) — **SERVER B GETS ITS OWN LINE** (`SendOptions.serverB`): a media
 * `PLAY` carrying the clip B's own Playout lists. Every path that reaches B — the live fan-out, a failover
 * catch-up — sends B's line and never A's; `null` sends B nothing. Keyed to SERVER B, not the role: after a
 * failover B is the primary and still gets its own.
 */
describe('RedundancyAdapter — B-286 a per-server line (`serverB`)', () => {
  const lineA = 'PLAY 1-60 "C:/Apasai CIaB/Promo/Studio 1.mov"';
  const lineB = 'PLAY 1-60 "E:/Backup Library/Promo/Studio 1.mov"';

  function record(mocks: [MockHandle, MockHandle]): { seenA: string[]; seenB: string[] } {
    const seenA: string[] = [];
    const seenB: string[] = [];
    mocks[0].setHandler('PLAY', (req) => {
      seenA.push(req.args[1] ?? '?');
      return { kind: 'ok', code: 202, verb: 'PLAY' };
    });
    mocks[1].setHandler('PLAY', (req) => {
      seenB.push(req.args[1] ?? '?');
      return { kind: 'ok', code: 202, verb: 'PLAY' };
    });
    return { seenA, seenB };
  }

  it.each(['mirror-sync', 'mirror-async', 'journal-replay'] as const)(
    '🔴 %s: A gets its line, B gets ITS OWN — live or by the failover catch-up — and never A’s',
    async (strategy) => {
      const { adapter, mocks } = await setup(strategy);
      const { seenA, seenB } = record(mocks);
      const result = await adapter.send(lineA, { serverB: lineB });
      expect(result.winner).toBe('A');
      await new Promise((r) => setTimeout(r, 50));
      expect(seenA).toEqual(['C:/Apasai CIaB/Promo/Studio 1.mov']);
      await adapter.failover('manual');
      // Mirrored live (sync/async), replayed at the failover (journal-replay) — or both (mirror-async's
      // catch-up re-sends what B may have missed): B's own path every time, and never A's.
      expect(seenB.length).toBeGreaterThan(0);
      expect(new Set(seenB)).toEqual(new Set(['E:/Backup Library/Promo/Studio 1.mov']));
    },
  );

  it.each(['mirror-sync', 'mirror-async', 'journal-replay'] as const)(
    '🔴 %s: `serverB: null` — B has no copy — sends B nothing, live or at a failover; A airs it',
    async (strategy) => {
      const { adapter, mocks } = await setup(strategy);
      const { seenA, seenB } = record(mocks);
      await adapter.send(lineA, { serverB: null });
      await new Promise((r) => setTimeout(r, 50));
      expect(seenA).toEqual(['C:/Apasai CIaB/Promo/Studio 1.mov']);
      await adapter.failover('manual');
      expect(seenB).toEqual([]);
    },
  );

  it('🔴 after a failover B is the PRIMARY and still gets its own line; A — the backup now — gets A’s', async () => {
    const { adapter, mocks } = await setup('mirror-sync');
    await adapter.failover('manual');
    const { seenA, seenB } = record(mocks);
    const result = await adapter.send(lineA, { serverB: lineB });
    expect(result.winner).toBe('B');
    expect(seenB).toEqual(['E:/Backup Library/Promo/Studio 1.mov']);
    expect(seenA).toEqual(['C:/Apasai CIaB/Promo/Studio 1.mov']);
    // …and with no copy on B, nothing is sent while B is the primary.
    await expect(adapter.send(lineA, { serverB: null })).rejects.toThrow(/no copy/);
    expect(seenB).toHaveLength(1);
  });

  it('control: without the option both servers get the same line, as always', async () => {
    const { adapter, mocks } = await setup('mirror-sync');
    const { seenA, seenB } = record(mocks);
    await adapter.send(lineA);
    expect(seenA).toEqual(seenB);
  });
});

/**
 * 🔴 `B-316` (`RELEASE-0113-01`) — **SERVER B GETS ITS OWN CHANNEL NUMBER, ON EVERY ROAD, or nothing.**
 * A stand-in for the bridge's translation: station channel 1 is mirrored at B's channel 2; channel 3 has
 * no mirror (`null`). The adapter must ask it for every line bound for B — live, primary-only after a
 * failover, the failover catch-up, the corrective resend — and never for a line bound for A.
 */
describe('RedundancyAdapter — B-316 server B’s own channel (`serverBLine`)', () => {
  const ONE_AT_TWO = (line: string): string | null => {
    const [verb, target, ...rest] = line.split(' ');
    const m = /^(\d+)(-\d+)?$/.exec(target ?? '');
    if (verb === undefined || m === null) return line;
    if (m[1] === '3') return null;
    return [verb, `${m[1] === '1' ? '2' : (m[1] ?? '')}${m[2] ?? ''}`, ...rest].join(' ');
  };
  const linesOf = (mock: MockHandle): string[] => mock.receivedCommands().map((c) => c.line);
  const ok = (mock: MockHandle): void => {
    for (const verb of ['PLAY', 'CLEAR', 'INFO', 'MIXER']) {
      mock.setHandler(verb, () => ({ kind: 'ok', code: 202, verb }));
    }
  };

  it('a construction with a server B and no `serverBLine` throws — no road to B without it', async () => {
    const mockA = track(await createMock({ amcpPort: 0, oscPort: 0, disableOsc: true }), (m) =>
      m.stop(),
    );
    const transport = track(new AmcpTransport(), (t) => {
      t.destroy();
    });
    await transport.connect(mockA.host, mockA.amcpPort);
    const queue = track(new CommandQueue(transport), (q) => {
      q.dispose();
    });
    expect(
      () =>
        new RedundancyAdapter({
          strategy: 'mirror-sync',
          sessions: { A: makeFakeSession('A', queue), B: makeFakeSession('B', queue) },
        }),
    ).toThrow(/serverBLine \(B-316\)/);
    // CONTROL: a single server needs none.
    expect(
      () =>
        new RedundancyAdapter({
          strategy: 'mirror-sync',
          sessions: { A: makeFakeSession('A', queue) },
        }),
    ).not.toThrow();
  });

  it.each(['mirror-sync', 'mirror-async'] as const)(
    '🔴 %s: A gets its line byte for byte; B gets `2-…`; an unmapped channel reaches A alone',
    async (strategy) => {
      const { adapter, mocks } = await setup(strategy, ONE_AT_TWO);
      ok(mocks[0]);
      ok(mocks[1]);
      const divergences: unknown[] = [];
      adapter.on('mirror-divergence', (d) => divergences.push(d));
      await adapter.send('PLAY 1-60 "clip"');
      await adapter.send('MIXER 1 COMMIT');
      await adapter.send('CLEAR 3-80');
      await new Promise((r) => setTimeout(r, 50));
      expect(linesOf(mocks[0])).toEqual(['PLAY 1-60 "clip"', 'MIXER 1 COMMIT', 'CLEAR 3-80']);
      expect(linesOf(mocks[1])).toEqual(['PLAY 2-60 "clip"', 'MIXER 2 COMMIT']);
      expect(divergences, 'a line B is not sent is no divergence').toEqual([]);
    },
  );

  it('🔴 journal-replay: the failover catch-up replays `2-…` to B, never `1-…`, and nothing for channel 3', async () => {
    const { adapter, mocks } = await setup('journal-replay', ONE_AT_TWO);
    ok(mocks[0]);
    ok(mocks[1]);
    await adapter.send('PLAY 1-60 "clip"');
    await adapter.send('CLEAR 3-80');
    expect(linesOf(mocks[1])).toEqual([]);
    await adapter.failover('manual');
    expect(linesOf(mocks[1])).toEqual(['PLAY 2-60 "clip"']);
  });

  it('🔴 the corrective resend replays `2-…` to B', async () => {
    const { adapter, mocks } = await setup('mirror-sync', ONE_AT_TWO);
    ok(mocks[0]);
    mocks[1].setHandler('PLAY', () => ({ kind: 'err', code: 404, verb: 'PLAY' }));
    const resends: string[] = [];
    adapter.on('corrective-resend', (info) => resends.push(info.line));
    for (let i = 0; i < 3; i += 1) await adapter.send('PLAY 1-60 "clip"');
    await new Promise((r) => setTimeout(r, 100));
    expect(resends.length).toBeGreaterThan(0);
    expect(new Set(resends)).toEqual(new Set(['PLAY 2-60 "clip"']));
    expect(linesOf(mocks[1]).every((l) => l.startsWith('PLAY 2-'))).toBe(true);
  });

  it('🔴 after a failover B is the primary: every send — mirrored or primary-only — uses B’s number; an unmapped one is refused and nothing is sent', async () => {
    const { adapter, mocks } = await setup('mirror-sync', ONE_AT_TWO);
    ok(mocks[0]);
    ok(mocks[1]);
    await adapter.failover('manual');
    expect(adapter.currentPrimary).toBe('B');
    await adapter.send('PLAY 1-60 "clip"');
    await adapter.send('INFO 1', { mirror: false });
    await expect(adapter.send('CLEAR 3-80')).rejects.toThrow(/no channel/);
    await expect(adapter.send('INFO 3', { mirror: false })).rejects.toThrow(/no channel/);
    expect(linesOf(mocks[1])).toEqual(['PLAY 2-60 "clip"', 'INFO 2']);
    // A, the backup now, gets the station's line as it is — and nothing for the refused ones.
    expect(linesOf(mocks[0])).toEqual(['PLAY 1-60 "clip"']);
  });
});
