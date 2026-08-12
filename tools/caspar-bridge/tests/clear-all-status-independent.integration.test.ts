import * as dgram from 'node:dgram';
import { afterEach, expect, it } from 'vitest';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import { AmcpTransport, CommandQueue } from '@cg/caspar-client';
import type { ConnectionConfig, TemplateInfo } from '@cg/shared-ipc';
import { CasparRuntime } from '../src/caspar-runtime.js';
import type { LiveLayerRecord } from '../src/live-layers.js';
import { HEALTH_MS } from './support/harness.js';

/**
 * B-122 — CLEAR ALL IS AN ESCAPE HATCH, SO IT MUST NOT ASK THE BOOKKEEPING.
 *
 * The old `clearAll` filtered its candidates on `status` — i.e. on precisely
 * the values that may be WRONG in the situation the escape hatch exists for.
 * With every item wrongly reading `idle` it sent nothing and returned
 * `{ ok: true, cleared: 0 }`: a success report for a no-op, which is worse than
 * a disabled button, because a disabled button at least tells the truth.
 *
 * ── THE OWNER'S DECISION (2026-08-12), WHICH THESE TESTS ENCODE ─────────────
 *
 * CLEAR ALL sends a clear for EVERY item holding a bound slot, regardless of its
 * believed status — INCLUDING rows the model believes are merely `loaded` and
 * not yet on air. Losing a cued row is the ACCEPTED COST: an emergency control
 * must not depend on the bookkeeping whose failure is the emergency.
 *
 * ⚠ Do NOT reintroduce a status predicate on this path under another name. The
 * only question `clearAll` may ask about an item is whether it holds a layer of
 * ours to clear (a structural fact), never what it believes is on that layer.
 *
 * ── WHAT DOES STILL REFUSE ──────────────────────────────────────────────────
 *
 * A Live Source layer (C-015 phase 5's THIRD ownership class). Broadening this
 * verb must not let it reach a class that was just fenced off, so a bound slot
 * that is in the Live Source ledger is refused with the distinct `live-source`
 * reason and NOT cleared — and, as phase 5's own tests insist, an identical
 * neighbour that is NOT in the ledger is still cleared. Proving the protected
 * layer survived proves nothing on its own.
 */

let mock: MockHandle | null = null;
let runtime: CasparRuntime | null = null;
let foreignQueue: CommandQueue | null = null;
let foreignTransport: AmcpTransport | null = null;

afterEach(async () => {
  foreignQueue?.dispose();
  foreignQueue = null;
  foreignTransport?.destroy();
  foreignTransport = null;
  await runtime?.stop();
  runtime = null;
  await mock?.stop();
  mock = null;
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

async function waitFor(predicate: () => boolean, timeoutMs = 8000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timed out');
    await new Promise((r) => setTimeout(r, 25));
  }
}

/**
 * A second, independent AMCP client — how a producer the bridge did not create
 * gets onto a layer. It is the only honest way to build the case this item is
 * about: the model's belief and the wire genuinely disagreeing.
 */
async function foreignSend(handle: MockHandle, line: string): Promise<void> {
  if (foreignTransport === null) {
    foreignTransport = new AmcpTransport();
    await foreignTransport.connect(handle.host, handle.amcpPort);
    foreignQueue = new CommandQueue(foreignTransport);
  }
  await foreignQueue?.enqueue(line);
}

const LOWER_THIRD: TemplateInfo = {
  templateId: 'lower-third',
  templateType: 'lower-third',
  fields: [],
};
const HTML = '<!doctype html><html><head><meta charset="utf-8"></head><body>سلام</body></html>';

/**
 * `deaf: true` binds the bridge's OSC listener to a port the mock never sends
 * to. AMCP is untouched — commands go and are acked exactly as on a healthy
 * plant — but the occupancy tap hears nothing, so no observation ever reaches
 * the merge ladder and every status is derived from INTENT alone.
 *
 * That is the B-094 / B-101 install, and it is not a contrivance: it is the
 * shape this defect actually takes in the field. On a HEARING plant the tap
 * keeps the status honest, so the model can rarely be wrong for long — which is
 * precisely why a status filter looks harmless until it is deployed somewhere
 * OSC never arrives, and then the emergency control silently does nothing.
 */
async function boot(over: { deaf?: boolean } = {}): Promise<CasparRuntime> {
  const oscPort = await freeUdpPort();
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 30 });
  const listenPort = over.deaf === true ? await freeUdpPort() : oscPort;
  runtime = new CasparRuntime(
    singleServer(mock.amcpPort, listenPort),
    {},
    { sweepMs: 150, occupancyStaleMs: 800 },
  );
  runtime.start();
  await runtime.startServing();
  runtime.templateImport(LOWER_THIRD, HTML);
  await runtime.whenServerHealthy(HEALTH_MS);
  return runtime;
}

function slotOf(r: CasparRuntime, itemId: string): { channel: number; layer: number } {
  const slot = r.stackSnapshot().find((i) => i.itemId === itemId)?.slot;
  if (slot === undefined) throw new Error(`${itemId} holds no slot`);
  return { channel: slot.channel, layer: slot.layer };
}

function statusOf(r: CasparRuntime, itemId: string): string | undefined {
  return r.stackSnapshot().find((i) => i.itemId === itemId)?.status;
}

/** A ledger record for `slot`. The rects are inert here — phase 6 computes them. */
function liveRecord(slot: { channel: number; layer: number }): LiveLayerRecord {
  const box = { x: 0, y: 0, width: 1, height: 1 };
  return { slot, sourceId: 'guest-1', role: 'fill', producer: 'route://2', fill: box, clip: box };
}

it('THE DEFECT: an item whose believed status is WRONG is still cleared, and the layer really empties', async () => {
  const r = await boot({ deaf: true });
  if (mock === null) throw new Error('mock not booted');

  await r.load('item-a', 'lower-third', {});
  const slot = slotOf(r, 'item-a');
  await expect(mock.waitForCgAddResolution(slot)).resolves.toBe('resolved');
  expect((await r.take('item-a')).accepted).toBe(true);

  // Take it off, so the MODEL settles on `idle` off its own ack — and then put a
  // producer back on that exact layer from OUTSIDE the bridge. With the tap
  // deaf, nothing can correct the belief: the bookkeeping says the layer is
  // empty and the wire says it is not. This is the situation the escape hatch
  // exists for, and the one the old predicate could not act in.
  expect((await r.out('item-a')).accepted).toBe(true);
  await waitFor(() => statusOf(r, 'item-a') === 'idle');
  expect(mock.layerState(slot)?.producer).toBe('empty');

  await foreignSend(mock, `PLAY 1-${String(slot.layer)} "route://2"`);
  await waitFor(() => mock?.layerState(slot)?.producer === 'route');
  expect(statusOf(r, 'item-a'), 'the premise: the model still reads idle over a LIVE layer').toBe(
    'idle',
  );

  // The old predicate skipped this item on `status === 'idle'` and returned a
  // SUCCESS having sent nothing. The operator was told the emergency control
  // worked while the layer was still occupied.
  const result = await r.clearAll();
  expect(result.cleared, 'the emergency control must not consult the failing bookkeeping').toBe(1);
  expect(result.attempted).toBe(1);
  expect(result.ok).toBe(true);
  expect(result.refused).toEqual([]);
  expect(mock.layerState(slot)?.producer).toBe('empty');
}, 25000);

it("THE OWNER'S ANSWER: a merely-`loaded` row is cleared too — a cued row is the accepted cost", async () => {
  const r = await boot();
  if (mock === null) throw new Error('mock not booted');

  await r.load('item-cued', 'lower-third', {});
  const slot = slotOf(r, 'item-cued');
  await expect(mock.waitForCgAddResolution(slot)).resolves.toBe('resolved');
  expect(statusOf(r, 'item-cued')).toBe('loaded');
  expect(mock.layerState(slot)?.producer).toBe('html');

  const result = await r.clearAll();
  expect(result).toMatchObject({ ok: true, cleared: 1, attempted: 1, refused: [] });

  // The producer is destroyed (B-039), so the row is idle and a later take
  // re-ADDs rather than resuming. That IS the cost, and it is deliberate.
  expect(mock.layerState(slot)?.producer).toBe('empty');
  expect(statusOf(r, 'item-cued')).toBe('idle');
  expect(r.stackSnapshot().map((i) => i.itemId)).toEqual(['item-cued']);
}, 25000);

it('THE REPORT COUNTS WHAT WENT: nothing to address is never dressed up as success', async () => {
  const r = await boot();

  // An empty stack holds no layer of ours, so nothing is sent. The honest
  // report says so — it does not return `ok: true` for having done nothing,
  // which is the exact shape of the lie this item is filed against.
  expect(await r.clearAll()).toEqual({ ok: false, cleared: 0, attempted: 0, refused: [] });
}, 25000);

it('A LIVE SOURCE LAYER STILL REFUSES — and its unledgered NEIGHBOUR is still cleared', async () => {
  const r = await boot();
  if (mock === null) throw new Error('mock not booted');

  await r.load('item-live', 'lower-third', {});
  await r.load('item-plain', 'lower-third', {});
  const liveSlot = slotOf(r, 'item-live');
  const plainSlot = slotOf(r, 'item-plain');
  await expect(mock.waitForCgAddResolution(liveSlot)).resolves.toBe('resolved');
  await expect(mock.waitForCgAddResolution(plainSlot)).resolves.toBe('resolved');

  // The ledger is the ONLY difference between the two rows. Everything else —
  // status, producer kind, bound-ness — is identical, which is what makes the
  // neighbour's fate load-bearing rather than decorative.
  r.registerLiveLayers('item-live', [liveRecord(liveSlot)]);

  const result = await r.clearAll();
  expect(result.refused).toEqual([{ itemId: 'item-live', reason: 'live-source' }]);
  expect(result.attempted).toBe(1);
  expect(result.cleared).toBe(1);

  expect(
    mock.layerState(liveSlot)?.producer,
    'a bulk verb reaching a guest box is a face cut off air by a button that never named it',
  ).toBe('html');
  expect(mock.layerState(plainSlot)?.producer).toBe('empty');

  // Releasing the ledger hands the layer back: the protection is a property of
  // the LEDGER, not a latch on the item (phase 5's DOOR 1 boundary, one door over).
  r.releaseLiveLayers('item-live');
  const after = await r.clearAll();
  expect(after.refused).toEqual([]);
  expect(mock.layerState(liveSlot)?.producer).toBe('empty');
}, 25000);
