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

async function setup(strategy: RedundancyStrategy): Promise<Setup> {
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
