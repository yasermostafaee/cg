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
 * Reconnect-reconciliation (Face 2 + the load guard) — a killed bridge leaves
 * its producers ORPHANED on air (the mock's layer state is per server instance,
 * like real CasparCG). A fresh bridge session:
 *
 *  - ADOPTS a layer on its first `CG ADD` there: `CLEAR <ch>-<layer>` precedes
 *    the ADD (issued before the item's slot/OSC interest bind), destroying the
 *    orphan so its OSC can never route to the fresh item — and issues NO CLEAR
 *    at startup (an orphan on an untargeted layer stays on air).
 *  - REJECTS a load of an unregistered template (`unknown-template`) before any
 *    AMCP send — the EXP-A regression, where the failed load previously showed
 *    a false ON AIR badge fed by the orphan's OSC.
 */

let mock: MockHandle | null = null;
let runtime: CasparRuntime | null = null;
let runtime2: CasparRuntime | null = null;
let tracePath: string | null = null;

afterEach(async () => {
  await runtime?.stop();
  runtime = null;
  await runtime2?.stop();
  runtime2 = null;
  await mock?.stop();
  mock = null;
  if (tracePath !== null && fs.existsSync(tracePath)) fs.rmSync(tracePath);
  tracePath = null;
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

function connectionFor(amcpPort: number, oscPort: number, oscPortB: number): ConnectionConfig {
  return {
    servers: {
      A: { host: '127.0.0.1', amcpPort, oscPort },
      B: { host: '127.0.0.1', amcpPort, oscPort: oscPortB },
    },
    strategy: 'mirror-sync',
    autoFailoverEnabled: true,
  };
}

const TEMPLATE: TemplateInfo = {
  templateId: 'lower-third',
  templateType: 'lower-third',
  fields: [],
};
const HTML = '<!doctype html><html><head><meta charset="utf-8"></head><body>سلام</body></html>';
const SLOT = { channel: 1, layer: 10 };

/** Session 1: import → load → take → the bridge DIES with output on air. */
async function orphanedSession(m: MockHandle, oscPort: number): Promise<void> {
  const r = new CasparRuntime(connectionFor(m.amcpPort, oscPort, await freeUdpPort()));
  runtime = r;
  r.start();
  await r.startServing();
  r.templateImport(TEMPLATE, HTML);
  await r.whenServerHealthy(HEALTH_MS);
  expect((await r.load('item1', 'lower-third', { headline: 'قدیمی' })).accepted).toBe(true);
  // The orphan this fixture hands over is a SETTLED, rendering page ("the
  // bridge dies WITH OUTPUT ON AIR") — wait for the mock's template GET to
  // resolve BEFORE the take (PLAY on a settled page deterministically flips
  // onAir) and before killing the bridge. Stopping mid-fetch is a DIFFERENT
  // scenario (the page legitimately settles failed → empty frames, off air):
  // under CI contention that race lost often enough to kill the orphan and
  // red the asserts at :133/:243.
  await expect(m.waitForCgAddResolution(SLOT)).resolves.toBe('resolved');
  expect((await r.take('item1')).accepted).toBe(true);
  expect(m.layerState(SLOT)?.onAir).toBe(true);
  await r.stop(); // nothing clears the layer — the producer is orphaned ON AIR
  runtime = null;
}

/** The mock's NDJSON wire trace: recv'd AMCP lines, in arrival order. */
async function recvLines(m: MockHandle, file: string): Promise<string[]> {
  // The trace stream flushes asynchronously — await the mock's write barrier
  // (every line queued so far is in the file) instead of sleeping: a fixed
  // sleep under CI contention read TRUNCATED traces, which both misses lines
  // and misaligns the session1Count slicing below.
  await m.traceFlush();
  return fs
    .readFileSync(file, 'utf-8')
    .split('\n')
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as { dir: string; line: string })
    .filter((e) => e.dir === 'recv')
    .map((e) => e.line);
}

it('the fresh session ADOPTS the orphaned layer: CLEAR precedes its first CG ADD, and no CLEAR is issued at startup', async () => {
  tracePath = path.join(
    os.tmpdir(),
    `cg-reconnect-recon-${String(process.pid)}-${String(Date.now())}.ndjson`,
  );
  const oscPort = await freeUdpPort();
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 40, tracePath });

  await orphanedSession(mock, oscPort);
  const staleAdd = mock.lastCgAdd(SLOT);

  // The orphan SURVIVES the bridge death, still on air. (Session 1 adopted the
  // layer too — its own CLEAR-before-first-ADD, a no-op on the clean layer —
  // and its take left the producer playing; nothing cleared it at death.)
  expect(mock.layerState(SLOT)?.producer).toBe('html');
  expect(mock.layerState(SLOT)?.onAir).toBe(true);
  const session1Lines = await recvLines(mock, tracePath);
  const s1Clear = session1Lines.findIndex((l) => l.startsWith('CLEAR 1-10'));
  const s1Add = session1Lines.findIndex((l) => l.startsWith('CG 1-10 ADD'));
  expect(s1Clear).toBeGreaterThanOrEqual(0); // adoption is unconditional, clean session included
  expect(s1Add).toBeGreaterThan(s1Clear);
  const session1Count = session1Lines.length;

  // Fresh session (re-delivery-shaped: the template is registered again).
  const r2 = new CasparRuntime(connectionFor(mock.amcpPort, oscPort, await freeUdpPort()));
  runtime2 = r2;
  r2.start();
  await r2.startServing();
  r2.templateImport(TEMPLATE, HTML);
  await r2.whenServerHealthy(HEALTH_MS);

  // Startup itself issues NO CLEAR — the orphan stays on air until a load
  // targets its layer (on-air safety: no blind startup sweep).
  const preLoadLines = (await recvLines(mock, tracePath)).slice(session1Count);
  expect(preLoadLines.some((l) => l.startsWith('CLEAR'))).toBe(false);
  expect(mock.layerState(SLOT)?.onAir).toBe(true);

  // The load adopts the layer: CLEAR 1-10 arrives BEFORE the fresh CG ADD.
  expect((await r2.load('item2', 'lower-third', { headline: 'جدید' })).accepted).toBe(true);
  const session2Lines = (await recvLines(mock, tracePath)).slice(session1Count);
  const firstClear = session2Lines.findIndex((l) => l.startsWith('CLEAR 1-10'));
  const firstAdd = session2Lines.findIndex((l) => l.startsWith('CG 1-10 ADD'));
  expect(firstClear).toBeGreaterThanOrEqual(0);
  expect(firstAdd).toBeGreaterThan(firstClear);

  // The fresh ADD references the NEW session's served URL (the old origin is dead).
  const freshAdd = mock.lastCgAdd(SLOT);
  // R-030 — the served URL carries the channel raster on every ADD; what this
  // case is about is the ORIGIN changing, asserted on the next line.
  expect(freshAdd?.template).toMatch(
    /^http:\/\/127\.0\.0\.1:\d+\/template\/lower-third\?cw=1920&ch=1080$/,
  );
  expect(freshAdd?.template).not.toBe(staleAdd?.template);
  await expect(mock.waitForCgAddResolution(SLOT)).resolves.toBe('resolved');

  // …and the cycle completes: take renders the fresh page.
  expect((await r2.take('item2')).accepted).toBe(true);
  expect(mock.layerState(SLOT)?.onAir).toBe(true);

  // A SECOND load of the same type in this session allocates the next layer —
  // adoption is once per layer, so its ADD is preceded by its own CLEAR (1-11),
  // while 1-10 is never re-adopted.
  const clears1to10 = session2Lines.filter((l) => l.startsWith('CLEAR 1-10')).length;
  expect((await r2.load('item3', 'lower-third', {})).accepted).toBe(true);
  const afterThird = (await recvLines(mock, tracePath)).slice(session1Count);
  expect(afterThird.filter((l) => l.startsWith('CLEAR 1-10')).length).toBe(clears1to10);
  expect(afterThird.some((l) => l.startsWith('CLEAR 1-11'))).toBe(true);
});

it('a remove landing during the adopt-CLEAR window neither leaks the layer nor ADDs a ghost producer', async () => {
  const oscPort = await freeUdpPort();
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 40 });

  // Hold every CLEAR open until released — the adopt-CLEAR awaits a real AMCP
  // round-trip, which is exactly the window the race lives in. (Mirror-sync
  // fans the CLEAR to both sessions; release them all together.)
  const releases: (() => void)[] = [];
  mock.setHandler(
    'CLEAR',
    (req, ctx) =>
      new Promise((resolve) => {
        releases.push(() => {
          const t = req.args[0] ?? '';
          const dash = t.indexOf('-');
          ctx.setLayer(
            { channel: Number(t.slice(0, dash)), layer: Number(t.slice(dash + 1)) },
            { producer: 'empty', filePath: '', paused: false, onAir: false },
          );
          resolve({ kind: 'ok', code: 202, verb: 'CLEAR' });
        });
      }),
  );

  const r = new CasparRuntime(connectionFor(mock.amcpPort, oscPort, await freeUdpPort()));
  runtime = r;
  r.start();
  await r.startServing();
  r.templateImport(TEMPLATE, HTML);
  await r.whenServerHealthy(HEALTH_MS);

  // The load blocks inside the adopt-CLEAR; the remove lands mid-window and,
  // finding no slot bound yet, cleans up nothing.
  const loadP = r.load('item1', 'lower-third', {});
  // Poll until BOTH sessions' adopt-CLEARs are genuinely held open — a fixed
  // sleep is contention-fragile (50ms was not always enough for the load to
  // reach the CLEAR handler), and releasing before the SECOND session's CLEAR
  // arrives would strand it un-released: the load (awaiting both mirror-sync
  // acks) then deadlocks into the test timeout.
  await expect.poll(() => releases.length, { timeout: 5000 }).toBeGreaterThanOrEqual(2);
  expect(releases.length).toBeGreaterThan(0); // the adopt-CLEAR is in flight
  expect((await r.remove('item1')).accepted).toBe(true);

  // Release the CLEARs — the resumed load must notice the item is gone, free
  // the layer, and send NO CG ADD (no ghost producer, no leaked interest).
  for (const release of releases.splice(0)) release();
  expect((await loadP).accepted).toBe(false);
  expect(mock.lastCgAdd(SLOT)).toBeUndefined();

  // The layer was released, not leaked: the next load re-allocates 1-10 and
  // completes the full cycle on it.
  expect((await r.load('item2', 'lower-third', { headline: 'تازه' })).accepted).toBe(true);
  for (const release of releases.splice(0)) release(); // any residual adopt-CLEARs
  expect(mock.lastCgAdd(SLOT)?.template).toMatch(
    /^http:\/\/127\.0\.0\.1:\d+\/template\/lower-third\?cw=1920&ch=1080$/,
  );
  // Settle the page before the take so PLAY deterministically flips onAir
  // (a pending fetch spuriously timing out under contention would flip the
  // layer off air between the take-ack and the assert).
  await expect(mock.waitForCgAddResolution(SLOT)).resolves.toBe('resolved');
  expect((await r.take('item2')).accepted).toBe(true);
  expect(mock.layerState(SLOT)?.onAir).toBe(true);
});

it('EXP-A regression: a post-restart load with an EMPTY registry fails fast (unknown-template) and is never painted ON AIR by the orphan', async () => {
  const oscPort = await freeUdpPort();
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 40 });
  await orphanedSession(mock, oscPort);

  // Fresh session, NO re-import (the pre-fix reconnect state).
  const r2 = new CasparRuntime(connectionFor(mock.amcpPort, oscPort, await freeUdpPort()));
  runtime2 = r2;
  r2.start();
  await r2.startServing();
  await r2.whenServerHealthy(HEALTH_MS);

  expect(r2.templateHtml('lower-third')).toBeNull();
  const loaded = await r2.load('item2', 'lower-third', { headline: 'جدید' });
  expect(loaded.accepted).toBe(false);

  // Give the 40 Hz OSC ticks time — before the fix, the orphan's producer
  // report routed to item2 and displayed a false ON AIR over the failed ack.
  await new Promise((r) => setTimeout(r, 200));
  const item = r2.stackSnapshot().find((i) => i.itemId === 'item2');
  expect(item?.status).toBe('error');
  expect(item?.errorCode).toBe('unknown-template');

  // The guard sent nothing: the orphan is untouched (still on air).
  expect(mock.layerState(SLOT)?.producer).toBe('html');
  expect(mock.layerState(SLOT)?.onAir).toBe(true);
});
