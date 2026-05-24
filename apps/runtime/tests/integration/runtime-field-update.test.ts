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
 * M7.2 — Runtime field inspector live update against amcp-mock.
 *
 * Mirrors the runtime Inspector's commit-on-blur path:
 *   1. operator picks an item, edits a field
 *   2. renderer calls window.cg.stack.update with {fieldId: value}
 *   3. StackService dispatches CG <ch>-<layer> UPDATE 1 "{...}" via the
 *      adapter → amcp-mock receives the line
 *
 * Per ADR 0006 the JSON payload is ack-only; the runtime can still
 * verify the UPDATE was issued by inspecting the line on the wire.
 */

let mock: MockHandle | undefined;
let backupMock: MockHandle | undefined;
let transport: AmcpTransport | undefined;
let backupTransport: AmcpTransport | undefined;

afterEach(async () => {
  if (transport) transport.destroy();
  transport = undefined;
  if (backupTransport) backupTransport.destroy();
  backupTransport = undefined;
  if (mock) await mock.stop();
  mock = undefined;
  if (backupMock) await backupMock.stop();
  backupMock = undefined;
});

function makeFakeSession(label: 'A' | 'B', queue: CommandQueue): ServerSession {
  const e = new EventEmitter() as unknown as ServerSession;
  Object.defineProperty(e, 'name', { value: label });
  Object.defineProperty(e, 'queue', { value: queue });
  Object.defineProperty(e, 'state', { get: () => 'healthy', configurable: true });
  Object.defineProperty(e, 'osc', { value: new OscTransport() });
  return e;
}

describe('M7.2 — runtime inspector live update', () => {
  it('stack.update issues a CG UPDATE line containing the new field JSON', async () => {
    mock = await createMock({ amcpPort: 0, oscPort: 0, disableOsc: true });
    backupMock = await createMock({ amcpPort: 0, oscPort: 0, disableOsc: true });
    transport = new AmcpTransport();
    backupTransport = new AmcpTransport();
    await transport.connect(mock.host, mock.amcpPort);
    await backupTransport.connect(backupMock.host, backupMock.amcpPort);

    const queueA = new CommandQueue(transport);
    const queueB = new CommandQueue(backupTransport);
    const sessionA = makeFakeSession('A', queueA);
    const sessionB = makeFakeSession('B', queueB);
    const adapter = new RedundancyAdapter({
      strategy: 'mirror-sync',
      sessions: { A: sessionA, B: sessionB },
      autoFailoverEnabled: false,
    });

    const connections = {
      sessionA,
      sessionB,
      adapter,
      on: vi.fn(),
      off: vi.fn(),
      getHealth: vi.fn(),
      getConfig: vi.fn(),
      failover: vi.fn(),
    } as unknown as ConnectionService;

    const templates = new TemplateRegistry();
    templates.register({
      templateId: 'lt-update',
      url: 'file:///C:/x/index.html',
      templateType: 'lower-third',
      fields: [{ id: 'title', type: 'text', label: 'Title', default: '', required: true }],
    });

    const stack = new StackService({
      connections,
      templates,
      reconciler: new Reconciler(),
      layerManager: new LayerManager(),
    });

    // Take it on air so the slot has a CG instance the UPDATE can patch.
    mock.setHandler('PLAY', () => ({ kind: 'ok', code: 202, verb: 'PLAY' }));
    backupMock.setHandler('PLAY', () => ({ kind: 'ok', code: 202, verb: 'PLAY' }));
    stack.load({ itemId: 'i1', templateId: 'lt-update', fields: { title: 'before' } });
    await stack.take('i1');

    // Capture the next CG UPDATE — that's the wire bytes we want to assert.
    let updateLine: string | null = null;
    mock.setHandler('CG', (req) => {
      updateLine = req.raw;
      return { kind: 'ok', code: 202, verb: 'CG' };
    });
    backupMock.setHandler('CG', () => ({ kind: 'ok', code: 202, verb: 'CG' }));

    const result = await stack.update('i1', { title: 'فارسی' }, 'merge');
    expect(result.accepted).toBe(true);
    expect(updateLine).not.toBeNull();
    expect(updateLine).toContain('CG');
    // ADR 0006: the runtime delivers field updates via CG INVOKE "update"
    // because raw CG UPDATE returns the JSON unparsed inside CasparCG.
    expect(updateLine).toContain('INVOKE');
    expect(updateLine).toContain('update');
    expect(updateLine).toContain('فارسی');

    queueA.dispose();
    queueB.dispose();
  });
});
