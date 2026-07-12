import * as dgram from 'node:dgram';
import * as net from 'node:net';
import { afterEach, expect, it } from 'vitest';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import { AmcpTransport, CommandQueue } from '@cg/caspar-client';
import type { OwnedOccupancyWarning, TemplateInfo } from '@cg/shared-ipc';
import { CasparRuntime } from '../src/caspar-runtime.js';

/**
 * B-056 — the owned-slot occupancy warning. Mirror pair where the PRIMARY's
 * AMCP link is down (its port dials dead) while the primary MACHINE is alive
 * and rendering: a real mock emits the primary's OSC stream to the bridge's
 * A-ingest, and a second, independent AMCP client (the "dead previous
 * session") planted a foreign producer on the target layer. With
 * `autoFailoverEnabled: false` (the PRD's human-in-the-loop scenario) every
 * send succeeds BACKUP-ONLY, so the load's adopt-CLEAR never lands on the
 * primary — the exact window where the orphan survives VISIBLY under the
 * fresh item's own layer with (pre-B-056) no operator tell.
 *
 * Frozen behavior is asserted alongside the warning: the load still proceeds
 * exactly as before (accepted, slot bound, its own CG ADD sent).
 */

let mockA: MockHandle | null = null;
let mockB: MockHandle | null = null;
let mockRevived: MockHandle | null = null;
let runtime: CasparRuntime | null = null;
let foreignQueue: CommandQueue | null = null;
let foreignTransport: AmcpTransport | null = null;
let observer: dgram.Socket | null = null;
let observerPackets = 0;

afterEach(async () => {
  // Deterministic release of every socket this suite opens — a leaked UDP
  // port (not timing) was the real root cause of past "flaky" CI reds.
  foreignQueue?.dispose();
  foreignQueue = null;
  foreignTransport?.destroy();
  foreignTransport = null;
  if (observer !== null) {
    const sock = observer;
    observer = null;
    await new Promise<void>((resolve) => {
      sock.close(() => {
        resolve();
      });
    });
  }
  observerPackets = 0;
  await runtime?.stop();
  runtime = null;
  await mockA?.stop();
  mockA = null;
  await mockB?.stop();
  mockB = null;
  await mockRevived?.stop();
  mockRevived = null;
});

function freeUdpPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const sock = dgram.createSocket('udp4');
    sock.once('error', reject);
    sock.bind(0, '127.0.0.1', () => {
      const port = sock.address().port;
      sock.close(() => {
        resolve(port);
      });
    });
  });
}

/** A TCP port with NOTHING listening — the primary's dead AMCP link. */
function freeTcpPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const address = srv.address();
      const port = typeof address === 'object' && address !== null ? address.port : 0;
      srv.close(() => {
        resolve(port);
      });
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

const TEMPLATE: TemplateInfo = {
  templateId: 'lower-third',
  templateType: 'lower-third',
  fields: [],
};
const HTML = '<!doctype html><html><head><meta charset="utf-8"></head><body>سلام</body></html>';
const SLOT = { channel: 1, layer: 10 };

interface Rig {
  emissions: OwnedOccupancyWarning[][];
  /** The primary's (dead) AMCP port — revive it with a mock to "restore" A. */
  deadAmcpPort: number;
}

/**
 * Mirror pair: server A dials a DEAD AMCP port but its machine renders (mockA
 * pushes A's OSC to the bridge ingest); server B is a fully live mock. With
 * `foreignOnPrimary` the dead previous session's graphic is planted on the
 * target layer of the A machine and the test deterministically waits until
 * the emitter is ticking it to its observers (the bridge's tap included).
 */
async function bootMirrorWithDeadPrimary(opts: { foreignOnPrimary: boolean }): Promise<Rig> {
  const oscA = await freeUdpPort();
  const oscB = await freeUdpPort();
  const deadAmcpPort = await freeTcpPort();
  if (opts.foreignOnPrimary) {
    mockA = await createMock({ amcpPort: 0, oscPort: oscA, oscHost: '127.0.0.1', oscHz: 30 });
  }
  mockB = await createMock({ amcpPort: 0, oscPort: oscB, oscHost: '127.0.0.1', oscHz: 30 });
  const r = new CasparRuntime({
    servers: {
      A: { host: '127.0.0.1', amcpPort: deadAmcpPort, oscPort: oscA },
      B: { host: '127.0.0.1', amcpPort: mockB.amcpPort, oscPort: oscB },
    },
    strategy: 'mirror-sync',
    // The PRD scenario: no failover — the unreachable A STAYS primary.
    autoFailoverEnabled: false,
  });
  runtime = r;
  const emissions: OwnedOccupancyWarning[][] = [];
  r.ownedOccupancyChanged.subscribe((w) => emissions.push(w));
  r.start();
  await r.startServing();
  r.templateImport(TEMPLATE, HTML);
  // A can never reach healthy (dead port) — wait for the BACKUP only.
  await waitFor(() => r.health().backup?.state === 'healthy');

  if (opts.foreignOnPrimary && mockA !== null) {
    // The dead previous session: an independent AMCP client leaves a graphic
    // on the target layer of the primary machine (the real orphan mechanism).
    foreignTransport = new AmcpTransport();
    await foreignTransport.connect(mockA.host, mockA.amcpPort);
    foreignQueue = new CommandQueue(foreignTransport);
    await foreignQueue.enqueue(`PLAY ${String(SLOT.channel)}-${String(SLOT.layer)} "foreign" HTML`);

    // Deterministic readiness: subscribe a probe socket as a SECOND OSC
    // observer. Every emitter tick fans the SAME bundle to all observers
    // (bridge ingest included), and post-PLAY every bundle carries the
    // planted layer's producer — two probe packets guarantee the bridge's
    // occupancy tap has a fresh entry (tick 33ms << staleness 2500ms).
    const probe = dgram.createSocket('udp4');
    observer = probe;
    probe.on('message', () => {
      observerPackets += 1;
    });
    await new Promise<void>((resolve, reject) => {
      probe.once('error', reject);
      probe.bind(0, '127.0.0.1', () => {
        resolve();
      });
    });
    mockA.addOscObserver('127.0.0.1', probe.address().port);
    await waitFor(() => observerPackets >= 2);
  }
  return { emissions, deadAmcpPort };
}

it('B-056: a backup-only adopt over an observed foreign producer raises the owned-slot warning; the load itself is UNCHANGED', async () => {
  const { emissions } = await bootMirrorWithDeadPrimary({ foreignOnPrimary: true });

  const loaded = await runtime!.load('item1', 'lower-third', { headline: 'جدید' });

  // (b) Load behavior unchanged: accepted, and its own CG ADD reached the
  // (reachable) backup with the served URL — the warning is purely additive.
  expect(loaded.accepted).toBe(true);
  expect(mockB!.lastCgAdd(SLOT)?.template).toMatch(
    /^http:\/\/127\.0\.0\.1:\d+\/template\/lower-third$/,
  );

  // (a) The warning surfaces, naming the channel-layer AND the item.
  expect(runtime!.ownedOccupancy()).toMatchObject([
    { channel: 1, layer: 10, itemId: 'item1', producer: 'html' },
  ]);
  expect(emissions.length).toBeGreaterThan(0);
  expect(emissions[emissions.length - 1]).toMatchObject([
    { channel: 1, layer: 10, itemId: 'item1' },
  ]);

  // The slot stayed bound to item1: the next same-type load allocates the
  // NEXT layer (1-11) — and, its layer being unobserved on the primary,
  // raises no second warning (observed-occupancy only).
  expect((await runtime!.load('item2', 'lower-third', {})).accepted).toBe(true);
  expect(mockB!.lastCgAdd({ channel: 1, layer: 11 })).toBeDefined();
  expect(runtime!.ownedOccupancy()).toHaveLength(1);
}, 30000);

it('unknown occupancy does not warn: a backup-only adopt with the primary OSC silent raises nothing', async () => {
  // No mockA at all — the primary machine is fully dark: the bridge KNOWS the
  // adopt-CLEAR missed the primary but CANNOT observe occupancy → no warning
  // (observed-occupancy only; the health surface already shows A down).
  const { emissions } = await bootMirrorWithDeadPrimary({ foreignOnPrimary: false });

  const loaded = await runtime!.load('item1', 'lower-third', {});
  expect(loaded.accepted).toBe(true);
  expect(mockB!.lastCgAdd(SLOT)).toBeDefined();
  expect(runtime!.ownedOccupancy()).toEqual([]);
  expect(emissions).toHaveLength(0);
}, 30000);

it('an out resolves the warning ONLY when its CLEAR lands on the primary', async () => {
  const { emissions, deadAmcpPort } = await bootMirrorWithDeadPrimary({ foreignOnPrimary: true });
  await runtime!.load('item1', 'lower-third', {});
  expect(runtime!.ownedOccupancy()).toHaveLength(1);

  // Out with the primary still unreachable: the CLEAR lands backup-only —
  // nothing proved the primary's layer was cleared, the warning persists.
  expect((await runtime!.out('item1')).accepted).toBe(true);
  expect(runtime!.ownedOccupancy()).toHaveLength(1);

  // The primary's AMCP link recovers (a mock now answers the SAME port the
  // bridge dials; its own OSC goes to a throwaway port — the A machine's
  // stream keeps flowing from mockA).
  mockRevived = await createMock({
    amcpPort: deadAmcpPort,
    oscPort: await freeUdpPort(),
    oscHost: '127.0.0.1',
    oscHz: 30,
  });
  await runtime!.whenServerHealthy(15000);

  // A later out for the same layer now executes on the current primary
  // (ok && onPrimary) — provably cleared, the warning resolves.
  expect((await runtime!.out('item1')).accepted).toBe(true);
  expect(runtime!.ownedOccupancy()).toEqual([]);
  expect(emissions[emissions.length - 1]).toEqual([]);
}, 30000);

it('a remove resolves the warning even while the primary is unreachable (the layer is deallocated — R-009 owns it now)', async () => {
  const { emissions } = await bootMirrorWithDeadPrimary({ foreignOnPrimary: true });
  await runtime!.load('item1', 'lower-third', {});
  expect(runtime!.ownedOccupancy()).toHaveLength(1);

  expect((await runtime!.remove('item1')).accepted).toBe(true);
  expect(runtime!.ownedOccupancy()).toEqual([]);
  expect(emissions[emissions.length - 1]).toEqual([]);
}, 30000);

it('a take does NOT resolve the warning', async () => {
  const { emissions } = await bootMirrorWithDeadPrimary({ foreignOnPrimary: true });
  await runtime!.load('item1', 'lower-third', {});
  expect(runtime!.ownedOccupancy()).toHaveLength(1);
  const emissionsBefore = emissions.length;

  // The take succeeds backup-only (B acks CG PLAY) — but proves nothing about
  // the primary's layer: once A reconnects, that PLAY may render the orphan.
  expect((await runtime!.take('item1')).accepted).toBe(true);
  expect(runtime!.ownedOccupancy()).toHaveLength(1);
  expect(emissions.length).toBe(emissionsBefore);
}, 30000);
