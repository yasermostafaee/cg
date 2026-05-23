import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import {
  AmcpTransport,
  CommandQueue,
  LayerManager,
  Reconciler,
  RedundancyAdapter,
  type ServerSession,
} from '@cg/caspar-client';
import { StackService } from '../src/main/services/StackService.js';
import { TemplateRegistry } from '../src/main/services/TemplateRegistry.js';
import type { ConnectionService } from '../src/main/services/ConnectionService.js';

let mocks: [MockHandle, MockHandle] | undefined;
let transports: [AmcpTransport, AmcpTransport] | undefined;
let queues: [CommandQueue, CommandQueue] | undefined;

afterEach(async () => {
  if (queues) for (const q of queues) q.dispose();
  if (transports) for (const t of transports) t.destroy();
  if (mocks) for (const m of mocks) await m.stop();
  queues = undefined;
  transports = undefined;
  mocks = undefined;
});

async function setup(): Promise<{
  service: StackService;
  mock: MockHandle;
  connections: ConnectionService;
}> {
  const mockA = await createMock({ amcpPort: 0, oscPort: 0, disableOsc: true });
  const mockB = await createMock({ amcpPort: 0, oscPort: 0, disableOsc: true });
  mocks = [mockA, mockB];

  const transportA = new AmcpTransport();
  await transportA.connect(mockA.host, mockA.amcpPort);
  const transportB = new AmcpTransport();
  await transportB.connect(mockB.host, mockB.amcpPort);
  transports = [transportA, transportB];

  const queueA = new CommandQueue(transportA);
  const queueB = new CommandQueue(transportB);
  queues = [queueA, queueB];

  const sessionA = makeFakeSession('A', queueA);
  const sessionB = makeFakeSession('B', queueB);
  const adapter = new RedundancyAdapter({
    strategy: 'mirror-sync',
    sessions: { A: sessionA, B: sessionB },
  });

  // Hand-build a stand-in ConnectionService so the StackService composes the same way
  // as in production but without driving the full FSM.
  const connections = {
    sessionA,
    sessionB,
    adapter,
    getHealth: vi.fn(),
    getConfig: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    failover: vi.fn(),
  } as unknown as ConnectionService;

  const templates = new TemplateRegistry();
  templates.register({
    templateId: 'lt-1',
    url: 'file:///C:/templates/lt-1.html',
    templateType: 'lower-third',
  });

  const service = new StackService({
    connections,
    templates,
    reconciler: new Reconciler(),
    layerManager: new LayerManager(),
  });

  return { service, mock: mockA, connections };
}

function makeFakeSession(label: 'A' | 'B', queue: CommandQueue): ServerSession {
  const e = new EventEmitter() as unknown as ServerSession;
  Object.defineProperty(e, 'name', { value: label });
  Object.defineProperty(e, 'queue', { value: queue });
  Object.defineProperty(e, 'state', { get: () => 'healthy', configurable: true });
  // osc is read by StackService at construction time; provide a minimal EventEmitter.
  const osc = new EventEmitter() as unknown as ServerSession['osc'];
  Object.defineProperty(e, 'osc', { value: osc });
  return e;
}

describe('StackService', () => {
  it('load() allocates a slot and adds the item to the Reconciler', async () => {
    const { service } = await setup();
    const accepted = service.load({ itemId: 'i1', templateId: 'lt-1', fields: { title: 'hi' } });
    expect(accepted).toBe(true);
    const snap = service.snapshot();
    expect(snap[0]).toMatchObject({ itemId: 'i1', status: 'loaded' });
    expect(snap[0]?.slot).toMatchObject({ channel: 1, layer: 10, server: 'primary' });
  });

  it('load() rejects an unknown templateId', async () => {
    const { service } = await setup();
    expect(service.load({ itemId: 'i1', templateId: 'ghost', fields: {} })).toBe(false);
    expect(service.snapshot()).toEqual([]);
  });

  it('take() issues PLAY and marks the item playing/pending after ack', async () => {
    const { service, mock } = await setup();
    let lastLine: string | null = null;
    mock.setHandler('PLAY', (req) => {
      lastLine = req.raw;
      return { kind: 'ok', code: 202, verb: 'PLAY' };
    });
    service.load({ itemId: 'i1', templateId: 'lt-1', fields: {} });
    const result = await service.take('i1');
    expect(result.accepted).toBe(true);
    expect(lastLine).toContain('PLAY 1-10');
    expect(lastLine).toContain('HTML');
    expect(service.snapshot()[0]).toMatchObject({ status: 'playing', pending: false });
  });

  it('take() returns errorCode on a 4xx response', async () => {
    const { service, mock } = await setup();
    mock.setHandler('PLAY', () => ({ kind: 'err', code: 404, verb: 'PLAY' }));
    service.load({ itemId: 'i1', templateId: 'lt-1', fields: {} });
    const result = await service.take('i1');
    expect(result.accepted).toBe(false);
    expect(result.errorCode).toBe('amcp-404');
  });

  it("take() rejects when item doesn't exist", async () => {
    const { service } = await setup();
    expect(await service.take('ghost')).toEqual({
      accepted: false,
      errorCode: 'unknown-item',
    });
  });

  it('update() merges fields and sends CG INVOKE', async () => {
    const { service, mock } = await setup();
    let parsedJson: string | null = null;
    mock.setHandler('CG', (req) => {
      // Args are unquoted by the mock's tokenizer; args[3] is the JSON.
      // Args after CG: 0=channel-layer, 1=INVOKE, 2=flash-layer, 3=method, 4=JSON.
      parsedJson = req.args[4] ?? null;
      return { kind: 'ok', code: 202, verb: 'CG' };
    });
    service.load({ itemId: 'i1', templateId: 'lt-1', fields: { a: '1' } });
    await service.update('i1', { b: '2' }, 'merge');
    expect(parsedJson).toBeTruthy();
    expect(JSON.parse(parsedJson!)).toEqual({ a: '1', b: '2' });
  });

  it('out() issues CG STOP by default', async () => {
    const { service, mock } = await setup();
    let lastLine: string | null = null;
    mock.setHandler('CG', (req) => {
      lastLine = req.raw;
      return { kind: 'ok', code: 202, verb: 'CG' };
    });
    service.load({ itemId: 'i1', templateId: 'lt-1', fields: {} });
    await service.out('i1');
    expect(lastLine).toBe('CG 1-10 STOP 1');
  });

  it('out({immediate: true}) issues CLEAR', async () => {
    const { service, mock } = await setup();
    let lastLine: string | null = null;
    mock.setHandler('CLEAR', (req) => {
      lastLine = req.raw;
      return { kind: 'ok', code: 202, verb: 'CLEAR' };
    });
    service.load({ itemId: 'i1', templateId: 'lt-1', fields: {} });
    await service.out('i1', true);
    expect(lastLine).toBe('CLEAR 1-10');
  });

  it('remove() drops the item and emits state-changed', async () => {
    const { service, mock } = await setup();
    mock.setHandler('CLEAR', () => ({ kind: 'ok', code: 202, verb: 'CLEAR' }));
    service.load({ itemId: 'i1', templateId: 'lt-1', fields: {} });
    let changed = false;
    service.on('state-changed', () => (changed = true));
    const result = await service.remove('i1');
    expect(result.accepted).toBe(true);
    expect(service.snapshot()).toEqual([]);
    expect(changed).toBe(true);
  });

  it('emits state-changed after take()', async () => {
    const { service, mock } = await setup();
    mock.setHandler('PLAY', () => ({ kind: 'ok', code: 202, verb: 'PLAY' }));
    service.load({ itemId: 'i1', templateId: 'lt-1', fields: {} });
    let snapshotCount = 0;
    service.on('state-changed', () => snapshotCount++);
    await service.take('i1');
    expect(snapshotCount).toBeGreaterThan(0);
  });
});
