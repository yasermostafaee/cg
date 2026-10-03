import * as dgram from 'node:dgram';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import { retainedStateFor } from '@cg/shared-schema';
import { CasparRuntime } from '../src/caspar-runtime.js';
import type { ConnectionConfig, TemplateInfo } from '@cg/shared-ipc';
import type { RetainedStackItem, StackItemStatus } from '@cg/shared-schema';
import { HEALTH_MS, TEST_LAYER_POLICY } from './support/harness.js';

/**
 * B-109 / B-107 — **a bridge restart may not put back what the operator took off.**
 *
 * The operator CLEARs a graphic (the stack's `out`) to take it off air and keeps the
 * row to re-take later. An `out` is not a `remove`: the row stays on the stack,
 * reconciled `idle`, with its layer slot still RESERVED. When the bridge PROCESS
 * restarts, the browser re-delivers its retained intent — and retention used to
 * store `played: false` for BOTH `idle` and `loaded`, so `restore()` could not tell
 * "cleared, leave the layer empty" from "loaded, re-seat it". `#decidePendingRestores`
 * found the layer SILENT (the operator's own CLEAR emptied it), took its
 * "silent → the producer is gone, re-ADD as loaded" branch, and issued a `CG ADD`
 * nobody asked for. The graphic came back resident and READY, one take from air.
 *
 * 🔴 **Every assertion here reads the mock's NDJSON WIRE TRACE — the actual AMCP
 * bytes — not bridge bookkeeping.** The defect IS a wire mutation, so a regression
 * must not be able to hide behind a passing abstraction. That is the same discipline
 * `stack-survives-bridge-restart.integration.test.ts` uses for the invariant this one
 * is the mirror image of: that file proves a restore never CLEARs a LIVE layer; this
 * one proves it never ADDs onto an EMPTY one the operator emptied on purpose.
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

function singleServer(amcpPort: number, oscPort: number): ConnectionConfig {
  return {
    servers: { A: { host: '127.0.0.1', amcpPort, oscPort } },
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
const SLOT = { channel: 1, layer: 10 }; // 'lower-third' policy slot

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function waitFor(cond: () => boolean, timeoutMs: number, what: string): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!cond()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await delay(25);
  }
}

function status(r: CasparRuntime, itemId: string): StackItemStatus | undefined {
  return r.stackSnapshot().find((i) => i.itemId === itemId)?.status;
}

/** The mock's NDJSON wire trace: recv'd AMCP lines, in arrival order. */
async function recvLines(m: MockHandle, file: string): Promise<string[]> {
  await m.traceFlush();
  return fs
    .readFileSync(file, 'utf-8')
    .split('\n')
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as { dir: string; line: string })
    .filter((e) => e.dir === 'recv')
    .map((e) => e.line);
}

/**
 * The browser's side of the contract, reduced through the SAME canonical map the
 * `StackRetentionStore` uses. Writing the status list out again here would be the
 * second derivation `B-107`'s notes warn about — and it would let this test prove
 * the bridge handles input the browser never sends.
 */
function retain(r: CasparRuntime): RetainedStackItem[] {
  return r.stackSnapshot().map((i) => {
    const state = retainedStateFor(i.status);
    return {
      itemId: i.itemId,
      templateId: i.templateId,
      fields: i.fields,
      state,
      ...(state === 'error' && i.errorCode !== undefined && { errorCode: i.errorCode }),
      ...(i.slot !== undefined && { slot: i.slot }),
      ...(i.position !== undefined && { position: i.position }),
    };
  });
}

it('🔴 B-109: a deliberately CLEARed graphic is NOT re-ADDed by a bridge restart', async () => {
  tracePath = path.join(
    os.tmpdir(),
    `cg-b109-cleared-${String(process.pid)}-${String(Date.now())}.ndjson`,
  );
  const oscPort = await freeUdpPort();
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 40, tracePath });
  const m = mock;

  // ── session 1: load, take to air, then the operator CLEARs it ──
  const r = new CasparRuntime(
    singleServer(m.amcpPort, oscPort),
    {},
    { layerPolicy: TEST_LAYER_POLICY },
  );
  runtime = r;
  r.start();
  await r.startServing();
  r.templateImport(TEMPLATE, HTML);
  await r.whenServerHealthy(HEALTH_MS);
  expect((await r.load('item1', 'lower-third', { headline: 'سلام' })).accepted).toBe(true);
  await expect(m.waitForCgAddResolution(SLOT)).resolves.toBe('resolved');
  expect((await r.take('item1')).accepted).toBe(true);
  await waitFor(() => status(r, 'item1') === 'on-air', 8000, 'item reaches ON AIR');

  // THE operator action: CLEAR (out), not remove. The row stays on the stack.
  expect((await r.out('item1')).accepted).toBe(true);
  await waitFor(() => status(r, 'item1') === 'idle', 8000, 'the cleared row settles at idle');
  expect(r.stackSnapshot().map((i) => i.itemId)).toEqual(['item1']);
  // The layer really is empty on the wire, and the slot really is still reserved —
  // the two facts that together make this chain reachable at all.
  expect(m.layerState(SLOT)?.producer).not.toBe('html');
  const retained = retain(r);
  expect(retained[0]).toMatchObject({ state: 'cleared' });
  expect(retained[0]?.slot).toMatchObject(SLOT);

  await r.stop(); // the bridge process dies
  runtime = null;

  // ── session 2: a fresh bridge, restore, and let the decision be TAKEN ──
  const beforeRestore = (await recvLines(m, tracePath)).length;
  const r2 = new CasparRuntime(
    singleServer(m.amcpPort, oscPort),
    {},
    { layerPolicy: TEST_LAYER_POLICY },
  );
  runtime2 = r2;
  r2.start();
  await r2.startServing();
  r2.templateImport(TEMPLATE, HTML);
  // Reaching healthy means the session drained with OSC flowing at 40 Hz, so the tap
  // is WARM by construction — the decision is taken inline, off a tap that can tell
  // "this layer is empty" from "I have never heard anything". Without a warm tap the
  // bridge would refuse to decide and this test would pass for the wrong reason.
  await r2.whenServerHealthy(HEALTH_MS);
  expect(await r2.restore(retained)).toEqual({ restored: 1, skipped: [], migrated: [] });

  // Give a re-ADD every chance to appear: the ADD in the loaded case is issued off
  // this same path and lands well inside this window (the loaded-restore test waits
  // on it explicitly). Asserting an ABSENCE needs a real window, not zero delay.
  await delay(1500);

  // ── THE INVARIANT, on the AMCP bytes ──
  const after = (await recvLines(m, tracePath)).slice(beforeRestore);
  expect(after.some((l) => l.startsWith('CG 1-10 ADD'))).toBe(false);
  // Nor anything else aimed at that layer: no CLEAR, no REMOVE, no PLAY.
  expect(after.some((l) => l.startsWith('CLEAR 1-10'))).toBe(false);
  expect(after.some((l) => l.startsWith('CG 1-10 REMOVE'))).toBe(false);
  expect(after.some((l) => l.startsWith('CG 1-10 PLAY'))).toBe(false);
  // The layer is still empty — the operator's model of the stack still matches the wire.
  expect(m.layerState(SLOT)?.producer).not.toBe('html');

  // …and the ROW is back, which is the half that must NOT regress: B-092's whole
  // point is that the operator's list survives. It comes back CLEARED, not READY.
  expect(r2.stackSnapshot().map((i) => i.itemId)).toEqual(['item1']);
  expect(status(r2, 'item1')).toBe('idle');
  // Its slot is held, so the operator's re-take goes back to the same layer.
  expect(r2.stackSnapshot()[0]?.slot).toMatchObject(SLOT);
}, 40_000);

it('🔴 B-107: an ERRORED row is restored as ERRORED on its layer, never promoted to loaded', async () => {
  tracePath = path.join(
    os.tmpdir(),
    `cg-b107-errored-${String(process.pid)}-${String(Date.now())}.ndjson`,
  );
  const oscPort = await freeUdpPort();
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 40, tracePath });
  const m = mock;

  /*
   * 🔴 `B-301` — **AN ERRORED ROW IS ONE ON A LAYER.** This test used to make its errored row with a
   * refused Load (`not-fixed`), and a refused Load no longer creates anything (the test below). A
   * row in `error` now comes from a command refused on a row that holds its layer — a take CasparCG
   * refused (`amcp-403`). The retained input is written as the browser's retention writes it (the
   * same schema, the same canonical state), so the ONLY thing deciding the outcome below is the
   * state retention carried — `B-107`'s point, unchanged: a failure survives a restart.
   */
  const retained: RetainedStackItem[] = [
    {
      itemId: 'ghost',
      templateId: 'lower-third',
      fields: {},
      state: 'error',
      errorCode: 'amcp-403',
      slot: SLOT,
    },
  ];

  const beforeRestore = (await recvLines(m, tracePath)).length;
  const r2 = new CasparRuntime(
    singleServer(m.amcpPort, oscPort),
    {},
    { layerPolicy: TEST_LAYER_POLICY },
  );
  runtime2 = r2;
  r2.start();
  await r2.startServing();
  // The template IS registered in the new session, so nothing about the registry
  // explains the state below — it is the retained state doing the work.
  r2.templateImport(TEMPLATE, HTML);
  await r2.whenServerHealthy(HEALTH_MS);
  expect(await r2.restore(retained)).toEqual({ restored: 1, skipped: [], migrated: [] });
  await delay(1500);

  // The row is BACK, on its layer, and still says it failed, with its cause.
  const row = r2.stackSnapshot().find((i) => i.itemId === 'ghost');
  expect(row?.status).toBe('error');
  expect(row?.status).not.toBe('loaded');
  expect(row?.errorCode).toBe('amcp-403');
  expect(row?.slot).toMatchObject(SLOT);
  // It is NOT pending — a settled failure must not spin forever on the operator's row.
  expect(row?.pending).toBe(false);
  // And NOTHING was sent for it: an errored row has no producer to re-seat, so the
  // restore may not touch a layer on its behalf.
  const after = (await recvLines(m, tracePath)).slice(beforeRestore);
  expect(after.some((l) => l.startsWith('CG 1-10 ADD'))).toBe(false);
  expect(after.some((l) => l.startsWith('CLEAR 1-10'))).toBe(false);
}, 40_000);

it('🔴 B-301 — a refused Load leaves NOTHING, and what one left before is not brought back — control: an errored row on its layer is', async () => {
  /*
   * The owner's `2 in error` (2026-09-30): before the Loads checked first, every refused Load left
   * an item in `error` WITH NO LAYER — no row showed it, nothing could settle it, it was retained
   * and restored, and the Layers badge counted it on every channel. (`LAYER-BANDS-16`'s own reading
   * of such a row — "comes back with no layer, its error intact" — was right about the layer; the
   * row it described exists no longer.)
   */
  tracePath = path.join(
    os.tmpdir(),
    `cg-b301-refused-load-${String(process.pid)}-${String(Date.now())}.ndjson`,
  );
  const oscPort = await freeUdpPort();
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 40, tracePath });
  const m = mock;

  const r = new CasparRuntime(
    singleServer(m.amcpPort, oscPort),
    {},
    { layerPolicy: TEST_LAYER_POLICY },
  );
  runtime = r;
  r.start();
  await r.startServing();
  r.templateImport(TEMPLATE, HTML);
  await r.whenServerHealthy(HEALTH_MS);

  // 1 · A refused Load is answered exactly as before, and creates nothing.
  expect(await r.loadFixed({ channel: 1, layer: 99 }, 'ghost', 'lower-third', {})).toEqual({
    accepted: false,
    errorCode: 'not-fixed',
  });
  await delay(200);
  expect(r.stackSnapshot().find((i) => i.itemId === 'ghost')).toBeUndefined();
  expect(retain(r)).toEqual([]);
  // CONTROL — an accepted Load does create its item (the instrument is live).
  expect((await r.load('item1', 'lower-third', {})).accepted).toBe(true);
  expect(r.stackSnapshot().map((i) => i.itemId)).toEqual(['item1']);
  await r.stop();
  runtime = null;

  // 2 · A retention file from before this change: the leftover, and a real errored row.
  const retained: RetainedStackItem[] = [
    {
      itemId: 'ghost',
      templateId: 'lower-third',
      fields: {},
      state: 'error',
      errorCode: 'not-fixed',
    },
    {
      itemId: 'row',
      templateId: 'lower-third',
      fields: {},
      state: 'error',
      errorCode: 'amcp-403',
      slot: SLOT,
    },
  ];
  const beforeRestore = (await recvLines(m, tracePath)).length;
  const r2 = new CasparRuntime(
    singleServer(m.amcpPort, oscPort),
    {},
    { layerPolicy: TEST_LAYER_POLICY },
  );
  runtime2 = r2;
  r2.start();
  await r2.startServing();
  r2.templateImport(TEMPLATE, HTML);
  await r2.whenServerHealthy(HEALTH_MS);

  // The leftover is dropped — not restored, not reported: it held nothing and never did.
  expect(await r2.restore(retained)).toEqual({ restored: 1, skipped: [], migrated: [] });
  await delay(1500);
  expect(r2.stackSnapshot().find((i) => i.itemId === 'ghost')).toBeUndefined();
  // CONTROL — the errored row ON ITS LAYER comes back, visibly broken, with its cause.
  const row = r2.stackSnapshot().find((i) => i.itemId === 'row');
  expect(row?.status).toBe('error');
  expect(row?.errorCode).toBe('amcp-403');
  expect(row?.slot).toMatchObject(SLOT);

  // Nothing was sent on either's behalf, on ANY layer.
  const after = (await recvLines(m, tracePath)).slice(beforeRestore);
  expect(after.some((l) => /^CG \d+-\d+ ADD/.test(l))).toBe(false);
  expect(after.some((l) => /^CLEAR \d+-\d+/.test(l))).toBe(false);
}, 40_000);

it('CONTROL: a LOADED row comes back LOADED over the silent layer, nothing sent — and its next take re-ADDs it onto that layer', async () => {
  // The control that proves the tests above can fail. `CENTRAL-BRIDGE-01` (`C-047`): a restore
  // sends nothing for ANY state now (it used to re-ADD a loaded row), so what tells a LOADED row
  // from a CLEARed one is the STATE it comes back in — and the loaded one's take must still work,
  // re-ADDing onto the same layer, or the feature would be broken while every test above passed.
  tracePath = path.join(
    os.tmpdir(),
    `cg-b109-control-${String(process.pid)}-${String(Date.now())}.ndjson`,
  );
  const oscPort = await freeUdpPort();
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 40, tracePath });
  const m = mock;

  const r = new CasparRuntime(
    singleServer(m.amcpPort, oscPort),
    {},
    { layerPolicy: TEST_LAYER_POLICY },
  );
  runtime = r;
  r.start();
  await r.startServing();
  r.templateImport(TEMPLATE, HTML);
  await r.whenServerHealthy(HEALTH_MS);
  expect((await r.load('item1', 'lower-third', { headline: 'سلام' })).accepted).toBe(true);
  await expect(m.waitForCgAddResolution(SLOT)).resolves.toBe('resolved');
  const retained = retain(r);
  expect(retained[0]).toMatchObject({ state: 'loaded' });
  await r.stop();
  runtime = null;

  // CasparCG restarts too, so the layer comes back genuinely EMPTY — the same wire
  // observation the cleared case produces, and the whole reason the two were
  // indistinguishable before this change.
  const amcpPort = m.amcpPort;
  mock = null;
  await m.stop();
  mock = await createMock({ amcpPort, oscPort, oscHost: '127.0.0.1', oscHz: 40, tracePath });
  expect(mock.layerState(SLOT)).toBeUndefined();

  const r2 = new CasparRuntime(
    singleServer(amcpPort, oscPort),
    {},
    { layerPolicy: TEST_LAYER_POLICY },
  );
  runtime2 = r2;
  r2.start();
  await r2.startServing();
  r2.templateImport(TEMPLATE, HTML);
  await r2.whenServerHealthy(HEALTH_MS);
  expect(await r2.restore(retained)).toEqual({ restored: 1, skipped: [], migrated: [] });

  // Identical silence, a DIFFERENT row — because the retained STATE differs — and nothing sent.
  await waitFor(() => status(r2, 'item1') === 'loaded', 8000, 'restored item rests at LOADED');
  await delay(400);
  expect(mock.layerState(SLOT)).toBeUndefined();
  // …and the operator's take re-ADDs it onto its own layer and plays it (B-039).
  expect((await r2.take('item1')).accepted).toBe(true);
  await expect(mock.waitForCgAddResolution(SLOT, 10_000)).resolves.toBe('resolved');
  expect(mock.layerState(SLOT)?.producer).toBe('html');
  expect(mock.layerState(SLOT)?.onAir).toBe(true);
}, 40_000);
