import * as dgram from 'node:dgram';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import type { ConnectionConfig } from '@cg/shared-ipc';
import { createBridge, type BridgeHandle } from '../src/bridge.js';
import { HEALTH_MS } from './support/harness.js';

/**
 * B-125 — THE BOUND-ROW RACE, asserted on the WIRE.
 *
 * The row routes on `item === null` **at click time**. Between the render that
 * decided the row was empty and the click that acted on it, a load + take can
 * bind an item to that very layer and seat a producer on it — so the UNBOUND
 * branch fires (`clearBankLayer`) and destroys a producer the stack item still
 * believes is resident, WITHOUT going through `stack.out`.
 *
 * ── WHAT ACTUALLY BREAKS, AND WHY IT IS ASSERTED ON THE WIRE ────────────────
 *
 * The damage has two halves, and only one of them is visible in a status string:
 *
 *   1. `#loaded` — the bridge's OWN producer record — still holds the item. It
 *      is what `take()`'s B-039 pre-roll reads to decide whether to re-`CG ADD`.
 *      With it stale, the next take sends `CG PLAY` onto an EMPTY layer and
 *      NOTHING RENDERS. This half never self-heals, on any install, and it is
 *      what the wire assertions below pin.
 *   2. The published STATUS. On a plant with a working OSC tap this half
 *      self-heals: the tap observes `empty` and `freshTruth` derives `idle`
 *      within one TTL. On an OSC-LESS install (B-094 / B-101 — a real, shipped
 *      deployment class) there is no fresh truth at all, so the item keeps
 *      reading `loaded`/on-air off the intent ladder indefinitely, which is the
 *      defect exactly as B-125 words it.
 *
 * A test that read only the status would therefore be a test of the OSC tap. The
 * assertions here read the LAYER and the COMMANDS, so they hold either way.
 *
 * ── THE FIX THAT WAS REJECTED, RECORDED SO IT IS NOT REPROPOSED ─────────────
 *
 * Refusing the clear when the layer is owned. That reintroduces dependence on
 * the very bookkeeping this escape hatch exists to BYPASS — the hatch is for the
 * case where `#slots` and the status are exactly what is wrong. The fix is to
 * RECONCILE after a successful clear, never to gate on ownership before it.
 */

let mock: MockHandle | null = null;
let bridge: BridgeHandle | null = null;
let tracePath: string | null = null;

/** Bank 70–79 on channel 1; reservation 50–59 — the `clear-bank-scoped` layout. */
const BANK_START = 70;
const BANK_COUNT = 10;
const RESERVED = { ranges: [{ from: 50, to: 59 }] };
const HTML = '<!doctype html><html><head><meta charset="utf-8"></head><body>سلام</body></html>';

afterEach(async () => {
  await bridge?.close();
  bridge = null;
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

/** The mock's NDJSON wire trace: recv'd AMCP lines, in arrival order. */
async function recvLines(m: MockHandle, file: string): Promise<string[]> {
  await m.traceFlush();
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, 'utf-8')
    .split('\n')
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as { dir: string; line: string })
    .filter((e) => e.dir === 'recv')
    .map((e) => e.line);
}

async function boot(): Promise<BridgeHandle> {
  const oscPort = await freeUdpPort();
  tracePath = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), 'cg-clear-bank-race-')),
    'amcp-trace.ndjson',
  );
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 30, tracePath });
  bridge = await createBridge({
    port: 0,
    connection: singleServer(mock.amcpPort, oscPort),
    reservedLayers: RESERVED,
    fixedLayers: { channel: 1, low: { start: 1, count: 9 }, start: BANK_START, count: BANK_COUNT },
    runtimeTuning: { sweepMs: 150, occupancyStaleMs: 800 },
  });
  bridge.runtime.templateImport(
    { templateId: 'tpl-lower', templateType: 'lower-third', fields: [] },
    HTML,
  );
  await bridge.runtime.whenServerHealthy(HEALTH_MS);
  return bridge;
}

/** Bind a row and put a real producer on its layer (LOAD is list-only; TAKE seats it). */
async function seat(b: BridgeHandle, slot: { channel: number; layer: number }, itemId: string) {
  expect((await b.runtime.loadFixed(slot, itemId, 'tpl-lower', {})).accepted).toBe(true);
  expect((await b.runtime.take(itemId)).accepted).toBe(true);
  await expect(mock?.waitForCgAddResolution(slot)).resolves.toBe('resolved');
  expect(mock?.layerState(slot)?.producer).toBe('html');
}

it('THE RACE: the bank clear destroys the producer, and the next take must RE-ADD rather than play an empty layer', async () => {
  const b = await boot();
  if (mock === null || tracePath === null) throw new Error('mock not booted');
  const slot = { channel: 1, layer: 73 };

  // The load+take that wins the race — it happens between the render that saw
  // an empty row and the click that clears it.
  await seat(b, slot, 'item-raced');

  // The click the operator already committed to: the UNBOUND branch, addressed
  // to the LAYER, with no itemId to send. It must still SUCCEED — refusing it
  // because the layer turned out to be owned is the rejected fix.
  expect(await b.runtime.clearBankLayer(slot.channel, slot.layer)).toEqual({ ok: true });
  expect(mock.layerState(slot)?.producer).toBe('empty');

  // ── THE ASSERTION THE DEFECT FAILS ──
  // The producer is gone, so a take must re-ADD one. Unreconciled, `#loaded`
  // still claims a producer is resident and the take sends a bare `CG PLAY`
  // onto an empty layer: accepted on the wire, and NOTHING ON AIR.
  const before = (await recvLines(mock, tracePath)).length;
  expect((await b.runtime.take('item-raced')).accepted).toBe(true);
  const after = (await recvLines(mock, tracePath)).slice(before);

  expect(
    after.some((l) => l.startsWith(`CG ${String(slot.channel)}-${String(slot.layer)} ADD`)),
    'a take over a layer the bridge itself just emptied must re-ADD — CG PLAY alone renders nothing',
  ).toBe(true);
  await expect(mock.waitForCgAddResolution(slot)).resolves.toBe('resolved');
  expect(mock.layerState(slot)?.producer).toBe('html');
  expect(mock.layerState(slot)?.onAir).toBe(true);

  // The item was never dropped — reconciliation is bookkeeping, not a remove.
  expect(b.runtime.stackSnapshot().map((i) => i.itemId)).toEqual(['item-raced']);
}, 25000);

it('the reconciliation reaches the STATUS too: no item reports `loaded` over the emptied layer', async () => {
  const b = await boot();
  if (mock === null) throw new Error('mock not booted');
  const slot = { channel: 1, layer: 74 };

  await seat(b, slot, 'item-live');
  expect(await b.runtime.clearBankLayer(slot.channel, slot.layer)).toEqual({ ok: true });

  // Read IMMEDIATELY, before the OSC tap can observe the empty layer and derive
  // `idle` on its own. That self-healing is real on a hearing plant and would
  // mask the defect a moment later; on an OSC-less install (B-094/B-101) it
  // never comes, and the row lies until the operator hits REMOVE.
  expect(
    b.runtime.stackSnapshot().find((i) => i.itemId === 'item-live')?.status,
    'a row claiming air over a layer the bridge itself just emptied is the whole defect',
  ).toBe('idle');
}, 25000);

it('an UNBOUND bank layer clears exactly as before — reconciliation adds nothing to that path', async () => {
  const b = await boot();
  if (mock === null || tracePath === null) throw new Error('mock not booted');

  // 75 is in the bank and carries no item. The reconciliation step must find
  // nothing and change nothing: this is the ordinary escape-hatch case, and it
  // is asserted so the fix cannot quietly make the common path depend on items.
  expect(await b.runtime.clearBankLayer(1, 75)).toEqual({ ok: true });
  const lines = await recvLines(mock, tracePath);
  expect(lines.some((l) => l.startsWith('CLEAR 1-75'))).toBe(true);
  expect(b.runtime.stackSnapshot()).toEqual([]);
}, 25000);

it('a REFUSED bank clear reconciles NOTHING — the layer was never touched', async () => {
  const b = await boot();
  if (mock === null) throw new Error('mock not booted');
  const slot = { channel: 1, layer: 76 };

  await seat(b, slot, 'item-safe');

  // A refusal is not a clear. Reconciling on one would knock a perfectly
  // resident producer's row back to `idle` and cost the operator their resume —
  // the exact inverse of the defect, produced by the fix for it.
  expect((await b.runtime.clearBankLayer(1, 55)).ok).toBe(false); // reserved
  expect((await b.runtime.clearBankLayer(1, 69)).ok).toBe(false); // outside the bank

  expect(mock.layerState(slot)?.producer).toBe('html');
  expect(mock.layerState(slot)?.onAir).toBe(true);
}, 25000);
