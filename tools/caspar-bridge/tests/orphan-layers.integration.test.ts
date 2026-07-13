import * as dgram from 'node:dgram';
import { afterEach, expect, it } from 'vitest';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import { AmcpTransport, CommandQueue } from '@cg/caspar-client';
import type { ConnectionConfig, OrphanLayer } from '@cg/shared-ipc';
import { CasparRuntime } from '../src/caspar-runtime.js';
import { HEALTH_MS } from './support/harness.js';

/**
 * R-009 — orphan-layer sweep against the mock's REAL OSC stream (the mock's
 * emitter truthfully reports per-touched-layer foreground producers; no
 * fidelity shims). The "dead previous bridge session" is a SECOND bare AMCP
 * connection issuing PLAY — exactly the real orphan mechanism.
 */

let mockA: MockHandle | null = null;
let mockB: MockHandle | null = null;
let runtime: CasparRuntime | null = null;
let foreignQueue: CommandQueue | null = null;
let foreignTransport: AmcpTransport | null = null;

const SWEEP_MS = 150;
const STALE_MS = 800;

afterEach(async () => {
  foreignQueue?.dispose();
  foreignQueue = null;
  foreignTransport?.destroy();
  foreignTransport = null;
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

async function waitFor(predicate: () => boolean, timeoutMs = 8000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timed out');
    await new Promise((r) => setTimeout(r, 25));
  }
}

function singleServer(amcpPort: number, oscPort: number): ConnectionConfig {
  return {
    servers: { A: { host: '127.0.0.1', amcpPort, oscPort } },
    strategy: 'mirror-sync',
    autoFailoverEnabled: true,
  };
}

/** A second, independent AMCP client — the "dead previous session". */
async function foreignPlay(mock: MockHandle, line: string): Promise<void> {
  if (foreignTransport === null) {
    foreignTransport = new AmcpTransport();
    await foreignTransport.connect(mock.host, mock.amcpPort);
    foreignQueue = new CommandQueue(foreignTransport);
  }
  await foreignQueue?.enqueue(line);
}

async function bootSingle(): Promise<{ emissions: OrphanLayer[][] }> {
  const oscPort = await freeUdpPort();
  mockA = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 30 });
  runtime = new CasparRuntime(
    singleServer(mockA.amcpPort, oscPort),
    {},
    { sweepMs: SWEEP_MS, occupancyStaleMs: STALE_MS },
  );
  const emissions: OrphanLayer[][] = [];
  runtime.orphansChanged.subscribe((o) => emissions.push(o));
  runtime.start();
  await runtime.startServing();
  runtime.templateImport(
    { templateId: 'lower-third', templateType: 'lower-third', fields: [] },
    '<!doctype html><html><body>served</body></html>',
  );
  await runtime.whenServerHealthy(HEALTH_MS);
  return { emissions };
}

it('a foreign producer surfaces within the sweep cadence; Clear resolves it on observed empty', async () => {
  const { emissions } = await bootSingle();

  // Idle is QUIET: several sweeps with nothing foreign → zero publishes.
  await new Promise((r) => setTimeout(r, SWEEP_MS * 4));
  expect(emissions).toHaveLength(0);
  expect(runtime!.orphans()).toEqual([]);

  // The dead previous session left a graphic on layer 77.
  await foreignPlay(mockA!, 'PLAY 1-77 "foreign" HTML');
  await waitFor(() => runtime!.orphans().some((o) => o.channel === 1 && o.layer === 77));
  expect(emissions.length).toBeGreaterThan(0);
  expect(emissions[emissions.length - 1]).toMatchObject([{ channel: 1, layer: 77 }]);

  // Explicit operator Clear → CLEAR 1-77 → the mock reports empty → resolves.
  const cleared = await runtime!.clearLayer(1, 77);
  expect(cleared).toEqual({ ok: true });
  await waitFor(() => runtime!.orphans().length === 0);
  expect(emissions[emissions.length - 1]).toEqual([]);

  // Quiet again after resolution: no further publishes on idle sweeps.
  const countAfterResolve = emissions.length;
  await new Promise((r) => setTimeout(r, SWEEP_MS * 4));
  expect(emissions.length).toBe(countAfterResolve);
}, 20000);

it('an owned layer never surfaces; Clear on an owned layer is refused', async () => {
  await bootSingle();

  // Own a layer the normal way (lower-third allocates 1-10).
  expect((await runtime!.load('item1', 'lower-third', {})).accepted).toBe(true);
  expect((await runtime!.take('item1')).accepted).toBe(true);

  // The owned, on-air layer is reported by OSC — but never as an orphan.
  await new Promise((r) => setTimeout(r, SWEEP_MS * 5));
  expect(runtime!.orphans()).toEqual([]);

  // Clearing an owned layer is Out/Remove's job — refused, nothing sent.
  expect(await runtime!.clearLayer(1, 10)).toEqual({ ok: false, reason: 'owned' });
}, 20000);

it('warnings FREEZE when the primary dies, and the sweep timer dies with stop()', async () => {
  const { emissions } = await bootSingle();

  await foreignPlay(mockA!, 'PLAY 1-77 "foreign" HTML');
  await waitFor(() => runtime!.orphans().length === 1);

  // Kill the server: the session leaves 'healthy', sweeps skip, and the
  // warning persists unchanged (absence of knowledge is not knowledge of
  // absence) — even though the tap's entries go stale.
  foreignQueue?.dispose();
  foreignQueue = null;
  foreignTransport?.destroy();
  foreignTransport = null;
  await mockA!.stop();
  mockA = null;
  await new Promise((r) => setTimeout(r, SWEEP_MS * 6));
  expect(runtime!.orphans()).toMatchObject([{ channel: 1, layer: 77 }]);

  // stop() disposes the timer: no further emissions, ever.
  const countAtStop = emissions.length;
  await runtime!.stop();
  await new Promise((r) => setTimeout(r, SWEEP_MS * 4));
  expect(emissions.length).toBe(countAtStop);
  runtime = null;
}, 20000);

it('the sweep follows the CURRENT primary across a failover', async () => {
  const oscA = await freeUdpPort();
  const oscB = await freeUdpPort();
  mockA = await createMock({ amcpPort: 0, oscPort: oscA, oscHost: '127.0.0.1', oscHz: 30 });
  mockB = await createMock({ amcpPort: 0, oscPort: oscB, oscHost: '127.0.0.1', oscHz: 30 });
  runtime = new CasparRuntime(
    {
      servers: {
        A: { host: '127.0.0.1', amcpPort: mockA.amcpPort, oscPort: oscA },
        B: { host: '127.0.0.1', amcpPort: mockB.amcpPort, oscPort: oscB },
      },
      strategy: 'mirror-sync',
      autoFailoverEnabled: false,
    },
    {},
    { sweepMs: SWEEP_MS, occupancyStaleMs: STALE_MS },
  );
  runtime.start();
  await runtime.startServing();
  await runtime.whenServerHealthy(HEALTH_MS);

  // The orphan exists ONLY on B (a foreign client played it there).
  await foreignPlay(mockB!, 'PLAY 1-88 "foreign" HTML');

  // While A is primary, B's occupancy is not swept — no orphan.
  await new Promise((r) => setTimeout(r, SWEEP_MS * 5));
  expect(runtime.orphans()).toEqual([]);

  // Fail over to B — the very same sweep now reads B's tap dynamically.
  const result = await runtime.failover();
  expect(result.newPrimary).toBe('B');
  await waitFor(() => runtime!.orphans().some((o) => o.channel === 1 && o.layer === 88));
}, 20000);
