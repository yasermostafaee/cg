import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import {
  AmcpTransport,
  CommandQueue,
  LayerManager,
  OscTransport,
  Reconciler,
  RedundancyAdapter,
  type ServerSession,
} from '@cg/caspar-client';
import { StackService } from '../../src/main/services/StackService.js';
import { TemplateRegistry } from '../../src/main/services/TemplateRegistry.js';
import type { ConnectionService } from '../../src/main/services/ConnectionService.js';

/**
 * Phase 8 §13 / M10.1 — Runtime perf budgets.
 *
 * Exit criteria measured here:
 *   - AMCP ack p50 < 50 ms (under load from amcp-mock)
 *   - stack-row click → take request dispatched in < 16 ms
 *
 * The p50 is measured at the QueueResult level — the latency from
 * adapter.send() invocation to the parsed AMCP response. Anything
 * slower than that points to either a transport regression or a queue
 * scheduling regression.
 *
 * The "take dispatch < 16 ms" budget covers the *synchronous* work
 * StackService.take performs before awaiting the AMCP round-trip —
 * the Reconciler intent, slot lookup, command builder, and adapter
 * dispatch. The mock acks immediately for this test, so a slow take
 * here is a code-path regression, not a wire latency one.
 */

const ACK_P50_BUDGET_MS = 50;
const TAKE_DISPATCH_BUDGET_MS = 16;

let mocks: MockHandle[] = [];
let transports: AmcpTransport[] = [];
let queues: CommandQueue[] = [];

afterEach(async () => {
  for (const q of queues) q.dispose();
  for (const t of transports) t.destroy();
  for (const m of mocks) await m.stop();
  queues = [];
  transports = [];
  mocks = [];
});

function makeFakeSession(label: 'A' | 'B', queue: CommandQueue): ServerSession {
  const e = new EventEmitter() as unknown as ServerSession;
  Object.defineProperty(e, 'name', { value: label });
  Object.defineProperty(e, 'queue', { value: queue });
  Object.defineProperty(e, 'state', { get: () => 'healthy', configurable: true });
  Object.defineProperty(e, 'osc', { value: new OscTransport() });
  return e;
}

async function buildAdapter(): Promise<RedundancyAdapter> {
  const mockA = await createMock({ amcpPort: 0, oscPort: 0, disableOsc: true });
  const mockB = await createMock({ amcpPort: 0, oscPort: 0, disableOsc: true });
  mocks.push(mockA, mockB);
  const transportA = new AmcpTransport();
  const transportB = new AmcpTransport();
  await transportA.connect(mockA.host, mockA.amcpPort);
  await transportB.connect(mockB.host, mockB.amcpPort);
  transports.push(transportA, transportB);
  const queueA = new CommandQueue(transportA);
  const queueB = new CommandQueue(transportB);
  queues.push(queueA, queueB);

  mockA.setHandler('PLAY', () => ({ kind: 'ok', code: 202, verb: 'PLAY' }));
  mockB.setHandler('PLAY', () => ({ kind: 'ok', code: 202, verb: 'PLAY' }));
  mockA.setHandler('CG', () => ({ kind: 'ok', code: 202, verb: 'CG' }));
  mockB.setHandler('CG', () => ({ kind: 'ok', code: 202, verb: 'CG' }));
  mockA.setHandler('VERSION', () => ({
    kind: 'ok-line',
    code: 201,
    verb: 'VERSION',
    data: '2.3.2',
  }));
  mockB.setHandler('VERSION', () => ({
    kind: 'ok-line',
    code: 201,
    verb: 'VERSION',
    data: '2.3.2',
  }));

  return new RedundancyAdapter({
    strategy: 'mirror-sync',
    sessions: { A: makeFakeSession('A', queueA), B: makeFakeSession('B', queueB) },
    autoFailoverEnabled: false,
  });
}

function percentile(samples: readonly number[], p: number): number {
  if (samples.length === 0) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((sorted.length * p) / 100));
  return sorted[idx] ?? 0;
}

describe('M10.1 — runtime perf budgets', () => {
  it(`AMCP ack p50 stays under ${String(ACK_P50_BUDGET_MS)}ms`, async () => {
    const adapter = await buildAdapter();
    // Warm both queues — first command pays connection + JIT overhead.
    for (let i = 0; i < 5; i++) {
      await adapter.send(`PLAY 1-${String(10 + i)} "u" HTML`);
    }
    const samples: number[] = [];
    for (let i = 0; i < 30; i++) {
      const start = performance.now();
      await adapter.send(`PLAY 1-${String(50 + i)} "u" HTML`);
      samples.push(performance.now() - start);
    }
    const p50 = percentile(samples, 50);
    const p95 = percentile(samples, 95);
    expect(
      p50,
      `ack p50 ${p50.toFixed(2)}ms; p95 ${p95.toFixed(2)}ms; samples min ${Math.min(...samples).toFixed(2)} / max ${Math.max(...samples).toFixed(2)}`,
    ).toBeLessThan(ACK_P50_BUDGET_MS);
  });

  it(`StackService.take dispatches in under ${String(TAKE_DISPATCH_BUDGET_MS)}ms (sync work only)`, async () => {
    const adapter = await buildAdapter();
    const templates = new TemplateRegistry();
    templates.register({
      templateId: 'tpl-perf',
      url: 'file:///C:/x.html',
      templateType: 'lower-third',
      fields: [],
    });
    const connections = {
      sessionA: makeFakeSession('A', queues[0]!),
      sessionB: makeFakeSession('B', queues[1]!),
      adapter,
      on: vi.fn(),
      off: vi.fn(),
      getHealth: vi.fn(),
      getConfig: vi.fn(),
      failover: vi.fn(),
    } as unknown as ConnectionService;

    const stack = new StackService({
      connections,
      templates,
      reconciler: new Reconciler(),
      layerManager: new LayerManager(),
    });

    // Warm: load + take + remove to free the slot.
    stack.load({ itemId: 'warm', templateId: 'tpl-perf', fields: {} });
    await stack.take('warm');
    await stack.remove('warm');

    const samples: number[] = [];
    for (let i = 0; i < 20; i++) {
      const itemId = `i-${String(i)}`;
      stack.load({ itemId, templateId: 'tpl-perf', fields: {} });
      // Measure the *synchronous* dispatch work — fire-and-forget the
      // promise so the timer doesn't include the AMCP round-trip.
      const start = performance.now();
      const pending = stack.take(itemId);
      const dispatchMs = performance.now() - start;
      samples.push(dispatchMs);
      // Drain the in-flight take so the next iteration starts clean.
      await pending;
      // Free the slot so we don't exhaust the LayerManager's pool.
      await stack.remove(itemId);
    }
    const p50 = percentile(samples, 50);
    const max = Math.max(...samples);
    expect(p50, `take dispatch p50 ${p50.toFixed(2)}ms; max ${max.toFixed(2)}ms`).toBeLessThan(
      TAKE_DISPATCH_BUDGET_MS,
    );
  });
});
