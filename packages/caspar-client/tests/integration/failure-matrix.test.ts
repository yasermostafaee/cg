import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it } from 'vitest';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import {
  AmcpTransport,
  CommandQueue,
  HeartbeatService,
  LayerManager,
  RedundancyAdapter,
  Reconciler,
  type RedundancyStrategy,
  type ServerSession,
} from '../../src/index.js';

/**
 * Integration tests that exercise the failure rows of Phase 5 §10.
 *
 * Each scenario boots two fresh amcp-mocks (A + B), hand-builds a
 * minimal client stack (two transports + queues, a RedundancyAdapter,
 * a LayerManager, a Reconciler), then drives the failure and asserts
 * the visible behavior.
 *
 * The full ServerSession FSM is unit-tested in M4.4; here we focus on
 * the composition — does the stack as a whole react correctly?
 */

interface Stack {
  mocks: [MockHandle, MockHandle];
  transports: [AmcpTransport, AmcpTransport];
  queues: [CommandQueue, CommandQueue];
  sessions: { A: ServerSession; B: ServerSession };
  layerManager: LayerManager;
  reconciler: Reconciler;
  adapter: RedundancyAdapter;
}

let active: Stack | undefined;

afterEach(async () => {
  if (active === undefined) return;
  for (const q of active.queues) q.dispose();
  for (const t of active.transports) t.destroy();
  for (const m of active.mocks) await m.stop();
  active = undefined;
});

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function buildStack(strategy: RedundancyStrategy = 'mirror-sync'): Promise<Stack> {
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

  const layerManager = new LayerManager();
  const reconciler = new Reconciler({ divergentAfterMs: 100 });
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
    layerManager,
    reconciler,
    adapter,
  };
  return active;
}

function makeFakeSession(label: 'A' | 'B', queue: CommandQueue): ServerSession {
  const e = new EventEmitter() as unknown as ServerSession;
  Object.defineProperty(e, 'name', { value: label });
  Object.defineProperty(e, 'queue', { value: queue });
  Object.defineProperty(e, 'state', { get: () => 'healthy', configurable: true });
  return e;
}

// ──────────────────────────────────────────────────────────────────────
// §10 — Failure Matrix integration scenarios
// ──────────────────────────────────────────────────────────────────────

describe('§10.1 — happy-path composition', () => {
  it('LOAD → TAKE flows through adapter and reaches Reconciler "playing" then "on-air"', async () => {
    const { adapter, reconciler, layerManager } = await buildStack();

    const slot = layerManager.allocate('lower-third', 1);
    reconciler.applyIntent(
      { kind: 'load', itemId: 'i1', templateId: 't1', fields: { title: 'hello' } },
      1,
    );
    reconciler.assignSlot('i1', { ...slot, server: 'primary' });

    reconciler.applyIntent({ kind: 'take', itemId: 'i1' }, 2);
    expect(reconciler.get('i1')).toMatchObject({ status: 'playing', pending: true });

    const result = await adapter.send(
      `PLAY ${String(slot.channel)}-${String(slot.layer)} "x" HTML`,
    );
    expect(result.response.kind).toBe('ok');
    reconciler.applyAck(2, true);
    expect(reconciler.get('i1')).toMatchObject({ status: 'playing', pending: false });

    reconciler.applyOsc({
      kind: 'osc.layer.foreground.producer',
      channel: slot.channel,
      layer: slot.layer,
      producer: 'html',
    });
    expect(reconciler.get('i1')).toMatchObject({ status: 'on-air' });
  });
});

describe('§10 row: AMCP code 500 burst → escalate to failover', () => {
  it('auto-failovers after 5xxBudget+1 consecutive 500s', async () => {
    const { adapter, mocks } = await buildStack();
    mocks[0].setHandler('PLAY', () => ({ kind: 'err', code: 500, verb: 'PLAY' }));
    mocks[1].setHandler('PLAY', () => ({ kind: 'ok', code: 202, verb: 'PLAY' }));

    let failedOver = false;
    adapter.on('failover-complete', () => (failedOver = true));

    // commandTimeoutBudget=2, fiveXxBudget=2 in the test stack. Each send
    // returns a 500 from A; mirror-sync also fires it at B (ok). Adapter
    // increments the 5xx counter on the primary path.
    for (let i = 0; i < 5; i++) {
      await adapter.send('PLAY 1-10 "x" HTML');
      if (failedOver) break;
    }
    expect(failedOver).toBe(true);
    expect(adapter.currentPrimary).toBe('B');
  });
});

describe('§10 row: AMCP timeout burst → escalate to failover', () => {
  it('auto-failovers after commandTimeoutBudget+1 consecutive timeouts on primary', async () => {
    const { adapter, mocks } = await buildStack('mirror-async');
    mocks[0].setHandler('SLOW', async () => {
      await delay(200);
      return { kind: 'ok', code: 202, verb: 'SLOW' };
    });
    mocks[1].setHandler('SLOW', () => ({ kind: 'ok', code: 202, verb: 'SLOW' }));

    let failedOver = false;
    adapter.on('failover-complete', () => (failedOver = true));

    for (let i = 0; i < 5; i++) {
      try {
        await adapter.send('SLOW 1-10 "x" HTML', { timeoutMs: 30 });
      } catch {
        // expected — timeouts
      }
      if (failedOver) break;
    }
    expect(failedOver).toBe(true);
  });
});

describe('§10 row: mirror divergence detection', () => {
  it('emits mirror-divergence when A and B return different codes', async () => {
    const { adapter, mocks } = await buildStack('mirror-sync');
    mocks[0].setHandler('PLAY', () => ({ kind: 'ok', code: 202, verb: 'PLAY' }));
    mocks[1].setHandler('PLAY', () => ({ kind: 'err', code: 404, verb: 'PLAY' }));

    const events: { primaryCode: number; backupCode: number }[] = [];
    adapter.on('mirror-divergence', (info) => events.push(info));
    await adapter.send('PLAY 1-10 "x" HTML');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ primaryCode: 202, backupCode: 404 });
  });
});

describe('§10 row: split-brain detection on recovery', () => {
  it('detectSplitBrain reports the (channel,layer) slots that disagree', async () => {
    const { adapter } = await buildStack();
    const primaryView = new Map([
      ['1:10', 'html'],
      ['1:20', 'empty'],
      ['1:30', 'html'],
    ]);
    const backupView = new Map([
      ['1:10', 'html'],
      ['1:20', 'html'], // disagrees
      ['1:30', 'empty'], // disagrees
    ]);
    let event: { slots: number } | null = null;
    adapter.on('split-brain', (info) => (event = info));
    expect(adapter.detectSplitBrain(primaryView, backupView)).toBe(2);
    expect(event).toMatchObject({ slots: 2 });
  });
});

describe('§10 row: layer collision', () => {
  it('LayerManager quarantines a slot OSC reports occupied that we thought free', async () => {
    const { layerManager } = await buildStack();
    let collision: { slot: { channel: number; layer: number }; producer: string } | null = null;
    layerManager.on('collision', (slot, producer) => (collision = { slot, producer }));

    // We never allocated 1:11; OSC pretends it's occupied with 'html'.
    const ok = layerManager.observe({ channel: 1, layer: 11 }, 'html');
    expect(ok).toBe(false);
    expect(collision).toMatchObject({ slot: { channel: 1, layer: 11 }, producer: 'html' });
    // Subsequent allocation should skip layer 11.
    expect(layerManager.allocate('lower-third', 1)).toMatchObject({ channel: 1, layer: 10 });
    expect(layerManager.allocate('lower-third', 1)).toMatchObject({ channel: 1, layer: 12 });
  });
});

describe('§10 row: backpressure → failover trigger', () => {
  it('emits backpressure and failover-suggested as queue depth crosses thresholds', async () => {
    const { transports, mocks } = await buildStack();
    mocks[0].setHandler('SLOW', async () => {
      await delay(1000);
      return { kind: 'ok', code: 202, verb: 'SLOW' };
    });

    const queueA = new CommandQueue(transports[0], {
      backpressureThreshold: 3,
      failoverSuggestedThreshold: 5,
    });
    const events: string[] = [];
    queueA.on('backpressure', () => events.push('bp'));
    queueA.on('failover-suggested', () => events.push('fs'));

    const pending: Promise<unknown>[] = [];
    for (let i = 0; i < 6; i++) pending.push(queueA.enqueue('SLOW 1-10').catch(() => undefined));
    expect(events).toContain('bp');
    expect(events).toContain('fs');

    queueA.dispose();
    for (const p of pending) await p;
  });
});

describe('§10 row: both servers down → adapter is unable to send', () => {
  it('rejects send when both primary and backup transports are destroyed', async () => {
    const { adapter, transports, mocks } = await buildStack('mirror-sync');
    // Tear down both peers; queues will reject everything.
    mocks[0].closeAllAmcpConnections();
    mocks[1].closeAllAmcpConnections();
    await delay(50);
    transports[0].destroy();
    transports[1].destroy();

    await expect(adapter.send('PLAY 1-10 "x" HTML')).rejects.toThrow();
  });
});

describe('§10 row: command-channel reachable but OSC silent → Reconciler divergence', () => {
  it("emits 'item-divergent' when intent goes unconfirmed past the threshold", async () => {
    let now = 1000;
    const { reconciler } = await buildStack();
    // Wrap the reconciler we already built with a clock override is awkward;
    // build a fresh one with control over time for this scenario.
    const r = new Reconciler({ divergentAfterMs: 50, now: () => now });
    const events: { itemId: string }[] = [];
    r.on('item-divergent', (info) => events.push(info));

    r.applyIntent({ kind: 'load', itemId: 'i1', templateId: 't1', fields: {} }, 1);
    r.applyIntent({ kind: 'take', itemId: 'i1' }, 2);
    now += 200;
    // Trigger a re-evaluation by applying any change.
    r.applyAck(2, false);
    expect(events.length).toBeGreaterThan(0);

    void reconciler; // satisfy unused-binding lint on the stack reconciler
  });
});

describe('§10 row: failover-then-resync sequence', () => {
  it('journal-replay drains pending commands to backup on failover', async () => {
    const { adapter, mocks } = await buildStack('journal-replay');
    const seenB: string[] = [];
    mocks[0].setHandler('PLAY', () => ({ kind: 'ok', code: 202, verb: 'PLAY' }));
    mocks[1].setHandler('PLAY', (req) => {
      seenB.push(req.args[0] ?? '?');
      return { kind: 'ok', code: 202, verb: 'PLAY' };
    });

    await adapter.send('PLAY 1-10 "a" HTML');
    await adapter.send('PLAY 1-11 "b" HTML');
    expect(seenB).toEqual([]); // backup cold

    await adapter.failover('manual');
    expect(seenB).toEqual(['1-10', '1-11']);
    expect(adapter.currentPrimary).toBe('B');

    // Post-failover, new sends go to B (formerly backup).
    await adapter.send('PLAY 1-12 "c" HTML');
    expect(seenB).toEqual(['1-10', '1-11', '1-12']);
  });
});

describe('§10 row: heartbeat → AMCP axis failure', () => {
  it('axis-failed fires after consecutive ping misses', async () => {
    const { queues, mocks } = await buildStack();
    mocks[0].setHandler('VERSION', async () => {
      await delay(200);
      return { kind: 'ok-line', code: 201, verb: 'VERSION', data: '2.3.2 Stable' };
    });
    const hb = new HeartbeatService(queues[0], {
      intervalMs: 50,
      timeoutMs: 30,
      missBudget: 2,
    });
    const failed = new Promise<void>((resolve) => hb.once('amcp-axis-failed', () => resolve()));
    hb.start();
    await failed;
    expect(hb.status.axisFailed).toBe(true);
    hb.stop();
  });
});
