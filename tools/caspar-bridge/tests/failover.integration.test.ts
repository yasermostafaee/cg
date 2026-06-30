import * as dgram from 'node:dgram';
import { afterEach, expect, it } from 'vitest';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import { CasparRuntime } from '../src/caspar-runtime.js';
import type { ConnectionConfig } from '@cg/shared-ipc';

/**
 * C-001 Phase 3a — real redundancy/failover, driven against TWO `amcp-mock`
 * instances (A and B). Proves the C-001 failover acceptance bullet: WHEN the
 * primary fails THEN failover switches to backup per the strategy, commands
 * continue to the new primary, and published health reflects the switch — for
 * BOTH auto-failover and the manual `connections.failover` path.
 */

let mockA: MockHandle | null = null;
let mockB: MockHandle | null = null;
let runtime: CasparRuntime | null = null;

afterEach(async () => {
  await runtime?.stop();
  runtime = null;
  await mockA?.stop();
  mockA = null;
  await mockB?.stop();
  mockB = null;
});

function freeUdpPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const sock = dgram.createSocket('udp4');
    sock.once('error', reject);
    sock.bind(0, '127.0.0.1', () => {
      const port = sock.address().port;
      sock.close(() => resolve(port));
    });
  });
}

async function waitFor(predicate: () => boolean, timeoutMs = 6000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timed out');
    await new Promise((r) => setTimeout(r, 20));
  }
}

function twoServer(
  amcpA: number,
  oscA: number,
  amcpB: number,
  oscB: number,
  autoFailoverEnabled: boolean,
): ConnectionConfig {
  return {
    servers: {
      A: { host: '127.0.0.1', amcpPort: amcpA, oscPort: oscA },
      B: { host: '127.0.0.1', amcpPort: amcpB, oscPort: oscB },
    },
    strategy: 'mirror-sync',
    autoFailoverEnabled,
  };
}

async function bootPair(autoFailoverEnabled: boolean): Promise<void> {
  const oscA = await freeUdpPort();
  const oscB = await freeUdpPort();
  mockA = await createMock({ amcpPort: 0, oscPort: oscA, oscHost: '127.0.0.1', oscHz: 30 });
  mockB = await createMock({ amcpPort: 0, oscPort: oscB, oscHost: '127.0.0.1', oscHz: 30 });
  runtime = new CasparRuntime(
    twoServer(mockA.amcpPort, oscA, mockB.amcpPort, oscB, autoFailoverEnabled),
  );
  runtime.start();
  // B-038 Phase 3 — serve the template so the (now-resolving) mock 202s `CG ADD`
  // against a real URL after failover too.
  await runtime.startServing();
  runtime.templateImport(
    { templateId: 'lower-third', templateType: 'lower-third', fields: [] },
    '<!doctype html><html><body>served</body></html>',
  );
  await runtime.whenServerHealthy(6000);
}

it('auto-failover: killing the primary switches to backup; commands + health follow', async () => {
  await bootPair(true);
  expect(runtime!.currentPrimary).toBe('A');
  expect(runtime!.health().currentPrimary).toBe('A');

  // Primary A fails.
  await mockA!.stop();
  mockA = null;

  // The RedundancyAdapter switches to B per the strategy's trigger.
  await waitFor(() => runtime!.currentPrimary === 'B');
  const health = runtime!.health();
  expect(health.currentPrimary).toBe('B');
  expect(health.lastFailover?.to).toBe('B');
  expect(health.lastFailover?.from).toBe('A');

  // Commands continue to the new primary B and are acked.
  expect((await runtime!.load('item1', 'lower-third', {})).accepted).toBe(true);
  expect((await runtime!.take('item1')).accepted).toBe(true);
}, 20000);

it('manual failover via connections.failover switches primary and reports it', async () => {
  await bootPair(true);
  expect(runtime!.currentPrimary).toBe('A');

  const result = await runtime!.failover();
  expect(result.newPrimary).toBe('B');
  expect(runtime!.currentPrimary).toBe('B');

  const health = runtime!.health();
  expect(health.currentPrimary).toBe('B');
  expect(health.lastFailover?.reason).toBe('manual');

  // Commands continue to B (both servers up here).
  expect((await runtime!.load('m1', 'lower-third', {})).accepted).toBe(true);
}, 20000);
