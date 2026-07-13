import * as dgram from 'node:dgram';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import { CasparRuntime } from '../src/caspar-runtime.js';
import type { ConnectionConfig, TemplateInfo } from '@cg/shared-ipc';
import { HEALTH_MS } from './support/harness.js';

/**
 * B-054 — `#loaded` (producer-existence bookkeeping) must not survive an AMCP
 * session reconnect: a restarted CasparCG comes back with EMPTY layers, so a
 * take that trusts process-lifetime memory sends a bare `CG PLAY` that real
 * CasparCG blind-acks `202` while rendering nothing (the mock models exactly
 * that). A restart is simulated faithfully as mock stop + re-create on the
 * SAME ports — the mock's layer state is per server instance, like real
 * CasparCG, so the new instance is genuinely empty (the B-041 lesson). A
 * transient blip (same server, producers intact) is `closeAllAmcpConnections`
 * on a surviving instance.
 */

let mock: MockHandle | null = null;
let mockB: MockHandle | null = null;
let runtime: CasparRuntime | null = null;
const tracePaths: string[] = [];

afterEach(async () => {
  await runtime?.stop();
  runtime = null;
  await mock?.stop();
  mock = null;
  await mockB?.stop();
  mockB = null;
  for (const p of tracePaths.splice(0)) {
    if (fs.existsSync(p)) fs.rmSync(p);
  }
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

function newTracePath(tag: string): string {
  const p = path.join(
    os.tmpdir(),
    `cg-b054-${tag}-${String(process.pid)}-${String(Date.now())}-${String(tracePaths.length)}.ndjson`,
  );
  tracePaths.push(p);
  return p;
}

function singleServer(amcpPort: number, oscPort: number): ConnectionConfig {
  return {
    servers: { A: { host: '127.0.0.1', amcpPort, oscPort } },
    strategy: 'mirror-sync',
    autoFailoverEnabled: true,
  };
}

function mirrorPair(amcpA: number, oscA: number, amcpB: number, oscB: number): ConnectionConfig {
  return {
    servers: {
      A: { host: '127.0.0.1', amcpPort: amcpA, oscPort: oscA },
      B: { host: '127.0.0.1', amcpPort: amcpB, oscPort: oscB },
    },
    strategy: 'mirror-sync',
    autoFailoverEnabled: false, // a dying BACKUP must not flip the primary mid-test
  };
}

const TEMPLATE: TemplateInfo = {
  templateId: 'lower-third',
  templateType: 'lower-third',
  fields: [],
};
const HTML = '<!doctype html><html><head><meta charset="utf-8"></head><body>سلام</body></html>';
const SLOT = { channel: 1, layer: 10 }; // 'lower-third' policy slot

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function waitFor(cond: () => boolean, timeoutMs: number, what: string): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!cond()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await delay(25);
  }
}

/** The mock's NDJSON wire trace: recv'd AMCP lines, in arrival order. */
async function recvLines(m: MockHandle, file: string): Promise<string[]> {
  // The trace stream flushes asynchronously — await the mock's write barrier
  // (every line queued so far is in the file) instead of sleeping: a fixed
  // sleep under CI contention read TRUNCATED traces, which both misses lines
  // and misaligns the offset-based slicing below.
  await m.traceFlush();
  return fs
    .readFileSync(file, 'utf-8')
    .split('\n')
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as { dir: string; line: string })
    .filter((e) => e.dir === 'recv')
    .map((e) => e.line);
}

async function bootRuntime(config: ConnectionConfig): Promise<CasparRuntime> {
  const r = new CasparRuntime(config);
  runtime = r;
  r.start();
  await r.startServing();
  r.templateImport(TEMPLATE, HTML);
  await r.whenServerHealthy(HEALTH_MS);
  return r;
}

/**
 * Stop `handle` and bring up a fresh instance on the SAME ports (empty
 * layers). `dropObserved` runs between stop and re-create: the session must
 * be SEEN leaving healthy before the port comes back, or a wait-for-healthy
 * right after can sample the stale pre-drop state and race the reconnect.
 */
async function restartMock(
  handle: MockHandle,
  oscPort: number,
  tracePath: string,
  dropObserved: () => Promise<void>,
): Promise<MockHandle> {
  const amcpPort = handle.amcpPort;
  await handle.stop();
  await dropObserved();
  return createMock({ amcpPort, oscPort, oscHost: '127.0.0.1', oscHz: 40, tracePath });
}

it('B-054 repro: a take after a CasparCG restart re-ADDs and renders — never a bare PLAY onto the empty layer (and no re-adopt CLEAR)', async () => {
  const oscPort = await freeUdpPort();
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 40 });
  const r = await bootRuntime(singleServer(mock.amcpPort, oscPort));

  // On air, ADD resolution settled (never stop a mock mid-template-fetch).
  expect((await r.load('item1', 'lower-third', { headline: 'سلام' })).accepted).toBe(true);
  await expect(mock.waitForCgAddResolution(SLOT)).resolves.toBe('resolved');
  expect((await r.take('item1')).accepted).toBe(true);
  expect(mock.layerState(SLOT)?.onAir).toBe(true);

  // ── CasparCG restarts (not the bridge, not the page) ──
  const trace2 = newTracePath('restart');
  const dying = mock;
  mock = null; // never double-stop in afterEach if restartMock throws mid-way
  mock = await restartMock(dying, oscPort, trace2, () =>
    waitFor(() => r.health().primary.state !== 'healthy', 4000, 'drop observed'),
  );
  await waitFor(() => r.health().primary.state === 'healthy', 10_000, 'session reconnect');

  // Mock fidelity: the restarted server is genuinely EMPTY.
  expect(mock.layerState(SLOT)).toBeUndefined();

  // ── the take must RE-LOAD (CG ADD then PLAY) and render ──
  // Pre-fix, stale #loaded skips the B-039 re-ADD: a bare CG PLAY is
  // blind-acked 202 onto the empty layer and nothing renders.
  expect((await r.take('item1')).accepted).toBe(true);
  expect(mock.layerState(SLOT)?.producer).toBe('html');
  expect(mock.layerState(SLOT)?.onAir).toBe(true);
  await expect(mock.waitForCgAddResolution(SLOT)).resolves.toBe('resolved');

  const lines = await recvLines(mock, trace2);
  const add = lines.findIndex((l) => l.startsWith('CG 1-10 ADD'));
  const play = lines.findIndex((l) => l.startsWith('CG 1-10 PLAY'));
  expect(add).toBeGreaterThanOrEqual(0);
  expect(play).toBeGreaterThan(add);
  // #adopted deliberately survives: the restarted server's layers are empty,
  // so no re-adopt CLEAR precedes the re-ADD (a CLEAR here would be a no-op
  // anyway — this pins that we did NOT clear adoption memory).
  expect(lines.some((l) => l.startsWith('CLEAR'))).toBe(false);
}, 20_000);

it('transient blip: the reconnect itself sends nothing beyond the handshake, air is undisturbed, and the next take re-ADDs onto the live layer', async () => {
  const trace = newTracePath('blip');
  const oscPort = await freeUdpPort();
  mock = await createMock({
    amcpPort: 0,
    oscPort,
    oscHost: '127.0.0.1',
    oscHz: 40,
    tracePath: trace,
  });
  const r = await bootRuntime(singleServer(mock.amcpPort, oscPort));

  expect((await r.load('item1', 'lower-third', { headline: 'سلام' })).accepted).toBe(true);
  await expect(mock.waitForCgAddResolution(SLOT)).resolves.toBe('resolved');
  expect((await r.take('item1')).accepted).toBe(true);
  expect(mock.layerState(SLOT)?.onAir).toBe(true);
  const preBlipCount = (await recvLines(mock, trace)).length;

  // ── TCP reset; the SAME server keeps its producers ──
  mock.closeAllAmcpConnections();
  await waitFor(() => r.health().primary.state !== 'healthy', 4000, 'blip observed');
  await waitFor(() => r.health().primary.state === 'healthy', 10_000, 'session reconnect');

  // The invalidation is bookkeeping-only: between reconnect and the next
  // operator action the bridge sent nothing but the session handshake, and
  // what was on air is still on air.
  const sinceBlip = (await recvLines(mock, trace)).slice(preBlipCount);
  expect(sinceBlip.every((l) => l.startsWith('VERSION') || l.startsWith('INFO'))).toBe(true);
  expect(mock.layerState(SLOT)?.producer).toBe('html');
  expect(mock.layerState(SLOT)?.onAir).toBe(true);

  // The next take conservatively re-ADDs (stage-replacing the item's OWN
  // producer — the designed harmless extra ADD), then plays. No CLEAR:
  // adoption memory survives the blip too.
  expect((await r.take('item1')).accepted).toBe(true);
  const afterTake = (await recvLines(mock, trace)).slice(preBlipCount);
  const add = afterTake.findIndex((l) => l.startsWith('CG 1-10 ADD'));
  const play = afterTake.findIndex((l) => l.startsWith('CG 1-10 PLAY'));
  expect(add).toBeGreaterThanOrEqual(0);
  expect(play).toBeGreaterThan(add);
  expect(afterTake.some((l) => l.startsWith('CLEAR'))).toBe(false);
  expect(mock.layerState(SLOT)?.producer).toBe('html');
  expect(mock.layerState(SLOT)?.onAir).toBe(true);
}, 20_000);

it('wholesale rule: a BACKUP-only restart heals through the next take — the pair reconverges instead of silently diverging', async () => {
  const oscA = await freeUdpPort();
  const oscB = await freeUdpPort();
  mock = await createMock({ amcpPort: 0, oscPort: oscA, oscHost: '127.0.0.1', oscHz: 40 });
  mockB = await createMock({ amcpPort: 0, oscPort: oscB, oscHost: '127.0.0.1', oscHz: 40 });
  const r = await bootRuntime(mirrorPair(mock.amcpPort, oscA, mockB.amcpPort, oscB));

  // On air on BOTH servers (mirror-sync fan-out).
  expect((await r.load('item1', 'lower-third', { headline: 'سلام' })).accepted).toBe(true);
  await expect(mock.waitForCgAddResolution(SLOT)).resolves.toBe('resolved');
  await expect(mockB.waitForCgAddResolution(SLOT)).resolves.toBe('resolved');
  expect((await r.take('item1')).accepted).toBe(true);
  expect(mock.layerState(SLOT)?.onAir).toBe(true);
  expect(mockB.layerState(SLOT)?.onAir).toBe(true);

  // ── only the BACKUP restarts; the primary keeps its producers ──
  const traceB2 = newTracePath('backup-restart');
  const dyingB = mockB;
  mockB = null;
  mockB = await restartMock(dyingB, oscB, traceB2, () =>
    waitFor(() => r.health().backup?.state !== 'healthy', 4000, 'backup drop observed'),
  );
  await waitFor(() => r.health().backup?.state === 'healthy', 10_000, 'backup reconnect');
  expect(mockB.layerState(SLOT)).toBeUndefined(); // restarted-empty
  expect(mock.layerState(SLOT)?.onAir).toBe(true); // primary untouched

  // The backup's reconnect invalidates WHOLESALE: the next take re-ADDs
  // through the fan-out — recreating the backup's lost producer, benignly
  // stage-replacing the primary's — instead of a bare PLAY that would leave
  // the backup empty until a failover exposed it.
  expect((await r.take('item1')).accepted).toBe(true);
  expect(mockB.layerState(SLOT)?.producer).toBe('html');
  expect(mockB.layerState(SLOT)?.onAir).toBe(true);
  expect(mock.layerState(SLOT)?.producer).toBe('html');
  expect(mock.layerState(SLOT)?.onAir).toBe(true);
  const linesB = await recvLines(mockB, traceB2);
  const add = linesB.findIndex((l) => l.startsWith('CG 1-10 ADD'));
  const play = linesB.findIndex((l) => l.startsWith('CG 1-10 PLAY'));
  expect(add).toBeGreaterThanOrEqual(0);
  expect(play).toBeGreaterThan(add);
}, 20_000);

it('the invalidation survives setConfig rewiring: a restart of the NEWLY configured server still heals the next take', async () => {
  const oscA = await freeUdpPort();
  const oscB = await freeUdpPort();
  mock = await createMock({ amcpPort: 0, oscPort: oscA, oscHost: '127.0.0.1', oscHz: 40 });
  mockB = await createMock({ amcpPort: 0, oscPort: oscB, oscHost: '127.0.0.1', oscHz: 40 });
  const r = await bootRuntime(singleServer(mock.amcpPort, oscA));

  // Re-point the RUNNING bridge to server B (sessions + adapter rebuilt,
  // #wireAdapter re-run against the NEW session objects).
  expect((await r.setConfig(singleServer(mockB.amcpPort, oscB))).ok).toBe(true);
  await r.whenServerHealthy(HEALTH_MS);

  expect((await r.load('item1', 'lower-third', { headline: 'سلام' })).accepted).toBe(true);
  await expect(mockB.waitForCgAddResolution(SLOT)).resolves.toBe('resolved');
  expect((await r.take('item1')).accepted).toBe(true);
  expect(mockB.layerState(SLOT)?.onAir).toBe(true);

  // ── the NEW server restarts ──
  const traceB2 = newTracePath('post-setconfig-restart');
  const dyingB = mockB;
  mockB = null;
  mockB = await restartMock(dyingB, oscB, traceB2, () =>
    waitFor(() => r.health().primary.state !== 'healthy', 4000, 'drop observed'),
  );
  await waitFor(() => r.health().primary.state === 'healthy', 10_000, 'session reconnect');

  expect((await r.take('item1')).accepted).toBe(true);
  expect(mockB.layerState(SLOT)?.producer).toBe('html');
  expect(mockB.layerState(SLOT)?.onAir).toBe(true);
  const lines = await recvLines(mockB, traceB2);
  expect(lines.findIndex((l) => l.startsWith('CG 1-10 ADD'))).toBeGreaterThanOrEqual(0);
  expect(lines.findIndex((l) => l.startsWith('CG 1-10 PLAY'))).toBeGreaterThan(
    lines.findIndex((l) => l.startsWith('CG 1-10 ADD')),
  );
}, 25_000);

it('the invalidation survives failover (no rewiring needed) and a stopped runtime never reconnects (clean dispose)', async () => {
  const oscA = await freeUdpPort();
  const oscPortB = await freeUdpPort();
  mock = await createMock({ amcpPort: 0, oscPort: oscA, oscHost: '127.0.0.1', oscHz: 40 });
  // The playout-suite pattern: A and B are two sessions onto the SAME mock.
  const r = await bootRuntime({
    servers: {
      A: { host: '127.0.0.1', amcpPort: mock.amcpPort, oscPort: oscA },
      B: { host: '127.0.0.1', amcpPort: mock.amcpPort, oscPort: oscPortB },
    },
    strategy: 'mirror-sync',
    autoFailoverEnabled: false,
  });

  expect((await r.load('item1', 'lower-third', { headline: 'سلام' })).accepted).toBe(true);
  await expect(mock.waitForCgAddResolution(SLOT)).resolves.toBe('resolved');
  expect((await r.take('item1')).accepted).toBe(true);
  expect(mock.layerState(SLOT)?.onAir).toBe(true);

  // Manual failover flips the primary WITHOUT touching session objects —
  // the per-session subscription must keep working un-rewired.
  const flipped = await r.failover();
  expect(flipped.ok).toBe(true);
  expect(flipped.newPrimary).toBe('B');

  const trace2 = newTracePath('post-failover-restart');
  const dying = mock;
  mock = null;
  mock = await restartMock(dying, oscA, trace2, () =>
    waitFor(
      () => r.health().primary.state !== 'healthy' && r.health().backup?.state !== 'healthy',
      4000,
      'both drops observed',
    ),
  );
  await waitFor(
    () => r.health().primary.state === 'healthy' && r.health().backup?.state === 'healthy',
    10_000,
    'both sessions reconnect',
  );

  expect((await r.take('item1')).accepted).toBe(true);
  expect(mock.layerState(SLOT)?.producer).toBe('html');
  expect(mock.layerState(SLOT)?.onAir).toBe(true);
  const lines = await recvLines(mock, trace2);
  const add = lines.findIndex((l) => l.startsWith('CG 1-10 ADD'));
  const play = lines.findIndex((l) => l.startsWith('CG 1-10 PLAY'));
  expect(add).toBeGreaterThanOrEqual(0);
  expect(play).toBeGreaterThan(add);

  // ── clean dispose: a stopped runtime's sessions never come back ──
  await r.stop();
  runtime = null;
  const trace3 = newTracePath('post-stop');
  const dying2 = mock;
  mock = null;
  mock = await restartMock(dying2, oscA, trace3, () => Promise.resolve());
  await delay(800); // > several reconnect backoff windows
  expect(mock.amcpClientCount).toBe(0);
}, 25_000);
