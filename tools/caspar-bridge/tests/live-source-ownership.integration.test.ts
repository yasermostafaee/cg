import * as dgram from 'node:dgram';
import { afterEach, expect, it, vi } from 'vitest';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import { AmcpTransport, CommandQueue } from '@cg/caspar-client';
import type { ConnectionConfig } from '@cg/shared-ipc';
import { CasparRuntime } from '../src/caspar-runtime.js';
import type { LiveLayerRecord } from '../src/live-layers.js';
import { HEALTH_MS } from './support/harness.js';

/**
 * C-015 phase 5 — THE THIRD OWNERSHIP CLASS, at all three doors, plus the
 * boundary.
 *
 * A Live Source layer is a layer the BRIDGE owns carrying a NON-html producer.
 * That combination is what every existing ownership test lacks, and it is the
 * case each door gets wrong without phase 5:
 *
 *  - the R-009 sweep would surface it as an orphan — inviting the operator to
 *    clear a guest's face off air;
 *  - the C-014 quarantine would fence it off from allocation as "a foreign
 *    producer", a false statement about a layer the bridge put the producer on;
 *  - `clearLayer` would refuse it as `foreign` — the right outcome carried by
 *    exactly the wrong reason, since `foreign` means "provably not ours".
 *
 * ⚠ **THE BOUNDARY IS HALF THE POINT.** Every door test below runs TWO adjacent
 * layers through the SAME sweep with the SAME producer kind, differing ONLY in
 * whether the ledger holds them. Proving the new class is protected proves
 * nothing about the old classes having been left alone; a check that leaked one
 * layer either way would pass a test that only looked at the protected one.
 *
 * Nothing here can be reached from the UI in this phase: no verb seats a live
 * producer yet (`playSource` is phase 6.1), so the ledger is populated through
 * its own bookkeeping API — which is why that API is phase 5's and not phase 6's.
 */

let mock: MockHandle | null = null;
let runtime: CasparRuntime | null = null;
let foreignQueue: CommandQueue | null = null;
let foreignTransport: AmcpTransport | null = null;

const SWEEP_MS = 150;
const STALE_MS = 800;

/** Inside the 10–59 Live Source range, and clear of what `lower-third` allocates (10–19). */
const LIVE_LAYER = 30;
/** Its immediate neighbour — the boundary. Identical in every way except the ledger. */
const NEIGHBOUR_LAYER = 31;

afterEach(async () => {
  vi.restoreAllMocks();
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

/**
 * A second, independent AMCP client — how a producer the bridge did not create
 * gets onto a layer. Used here to put REAL non-html producers on the wire, so
 * the occupancy tap reports what a live source actually looks like.
 */
async function foreignSend(handle: MockHandle, line: string): Promise<void> {
  if (foreignTransport === null) {
    foreignTransport = new AmcpTransport();
    await foreignTransport.connect(handle.host, handle.amcpPort);
    foreignQueue = new CommandQueue(foreignTransport);
  }
  await foreignQueue?.enqueue(line);
}

async function boot(reservedLayers: readonly number[] = []): Promise<void> {
  const oscPort = await freeUdpPort();
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 30 });
  runtime = new CasparRuntime(
    singleServer(mock.amcpPort, oscPort),
    {},
    { sweepMs: SWEEP_MS, occupancyStaleMs: STALE_MS, reservedLayers },
  );
  runtime.start();
  await runtime.startServing();
  runtime.templateImport(
    { templateId: 'lower-third', templateType: 'lower-third', fields: [] },
    '<!doctype html><html><body>served</body></html>',
  );
  await runtime.whenServerHealthy(HEALTH_MS);
}

/** A ledger record for `layer`. The rects are inert here — phase 6 computes them. */
function liveRecord(layer: number, sourceId = 'guest-1'): LiveLayerRecord {
  const box = { x: 0, y: 0, width: 1, height: 1 };
  return {
    slot: { channel: 1, layer },
    sourceId,
    role: 'fill',
    producer: 'route://2',
    fill: box,
    clip: box,
    intendedVolume: 0,
  };
}

/** Put a REAL `route` producer (non-html) on both layers, and wait for the tap. */
async function occupyBothWithRoute(): Promise<void> {
  await foreignSend(mock!, `PLAY 1-${String(LIVE_LAYER)} "route://2"`);
  await foreignSend(mock!, `PLAY 1-${String(NEIGHBOUR_LAYER)} "route://2"`);
  await waitFor(
    () =>
      mock!.layerState({ channel: 1, layer: LIVE_LAYER })?.producer === 'route' &&
      mock!.layerState({ channel: 1, layer: NEIGHBOUR_LAYER })?.producer === 'route',
    5000,
  );
}

// ── DOOR 1 — the R-009 orphan sweep ────────────────────────────────────────

it('DOOR 1 (R-009): a ledgered Live Source layer is never an orphan — its unledgered NEIGHBOUR still is', async () => {
  await boot();
  runtime!.registerLiveLayers('item-live', [liveRecord(LIVE_LAYER)]);
  await occupyBothWithRoute();

  // The neighbour surfacing is what proves the sweep is running and CAN see
  // this producer kind — without it, "no orphan on 30" would be vacuous.
  await waitFor(() => runtime!.orphans().some((o) => o.layer === NEIGHBOUR_LAYER));
  await new Promise((r) => setTimeout(r, SWEEP_MS * 4));

  const orphanLayers = runtime!.orphans().map((o) => o.layer);
  expect(orphanLayers).toContain(NEIGHBOUR_LAYER);
  expect(
    orphanLayers,
    'a reclaimable live guest box is an operator being invited to clear a face off air',
  ).not.toContain(LIVE_LAYER);
}, 25000);

it('DOOR 1 boundary: releasing the ledger hands the layer BACK to the sweep', async () => {
  await boot();
  runtime!.registerLiveLayers('item-live', [liveRecord(LIVE_LAYER)]);
  await occupyBothWithRoute();
  await waitFor(() => runtime!.orphans().some((o) => o.layer === NEIGHBOUR_LAYER));
  expect(runtime!.orphans().map((o) => o.layer)).not.toContain(LIVE_LAYER);

  // Teardown forgets the layers. Protection is a property of the LEDGER, not a
  // latch — otherwise a released layer would stay invisible to the sweep forever.
  runtime!.releaseLiveLayers('item-live');
  await waitFor(() => runtime!.orphans().some((o) => o.layer === LIVE_LAYER));
  expect(runtime!.orphans().map((o) => o.layer)).toContain(LIVE_LAYER);
}, 25000);

// ── DOOR 2 — the C-014 allocation quarantine ───────────────────────────────

it('DOOR 2 (C-014): a ledgered Live Source layer is never quarantined as foreign — its neighbour is', async () => {
  await boot();
  // The quarantine announces itself on stderr, by design ("the one line whoever
  // wonders why a layer is being skipped will grep for"). Reading that line is
  // the most direct observation of which layers this door actually took.
  const seen: string[] = [];
  vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown): boolean => {
    seen.push(String(chunk));
    return true;
  });

  runtime!.registerLiveLayers('item-live', [liveRecord(LIVE_LAYER)]);
  await occupyBothWithRoute();
  await waitFor(() => seen.some((l) => l.includes(`layer 1-${String(NEIGHBOUR_LAYER)}`)), 8000);
  await new Promise((r) => setTimeout(r, SWEEP_MS * 4));

  const quarantineLines = seen.filter((l) => l.includes('quarantined from'));
  expect(quarantineLines.some((l) => l.includes(`layer 1-${String(NEIGHBOUR_LAYER)}`))).toBe(true);
  expect(
    quarantineLines.some((l) => l.includes(`layer 1-${String(LIVE_LAYER)}`)),
    'the bridge must never call its OWN producer foreign',
  ).toBe(false);
}, 25000);

it('DOOR 2 ordering: the ledger is consulted BEFORE the producer-kind test — a NON-html live producer is the case that proves it', async () => {
  await boot();
  const seen: string[] = [];
  vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown): boolean => {
    seen.push(String(chunk));
    return true;
  });

  // The whole hazard in one assertion. The kind test says "only html can be
  // ours"; this producer is `route`, so it falls straight through it. If the
  // ledger check sat after that test — or did not exist — this layer would be
  // quarantined, and the quarantine line would name it and call it foreign.
  runtime!.registerLiveLayers('item-live', [liveRecord(LIVE_LAYER)]);
  await foreignSend(mock!, `PLAY 1-${String(LIVE_LAYER)} "route://2"`);
  await waitFor(
    () => mock!.layerState({ channel: 1, layer: LIVE_LAYER })?.producer === 'route',
    5000,
  );
  await new Promise((r) => setTimeout(r, SWEEP_MS * 6));

  expect(mock!.layerState({ channel: 1, layer: LIVE_LAYER })?.producer).toBe('route');
  expect(seen.filter((l) => l.includes('quarantined from'))).toEqual([]);
}, 25000);

// ── DOOR 3 — R-015, `clearLayer` ───────────────────────────────────────────

it('DOOR 3 (R-015): clearLayer refuses a Live Source layer as `live-source` — NOT `foreign`, NOT `owned`', async () => {
  await boot();
  runtime!.registerLiveLayers('item-live', [liveRecord(LIVE_LAYER)]);
  await occupyBothWithRoute();

  const refusal = await runtime!.clearLayer(1, LIVE_LAYER);
  expect(refusal).toEqual({ ok: false, reason: 'live-source' });

  // Spelled out rather than left to the deep-equal above: the whole decision in
  // C5 is that this reason is DISTINCT. A regression that collapsed it into
  // either neighbour would still be a refusal, and would still look correct.
  expect(refusal.reason).not.toBe('foreign');
  expect(refusal.reason).not.toBe('owned');

  // And nothing was sent — the layer still carries its producer.
  await new Promise((r) => setTimeout(r, SWEEP_MS * 2));
  expect(mock!.layerState({ channel: 1, layer: LIVE_LAYER })?.producer).toBe('route');
}, 25000);

it('DOOR 3 boundary: the two EXISTING ownership classes still refuse with their own reasons, unchanged', async () => {
  await boot([60]);
  runtime!.registerLiveLayers('item-live', [liveRecord(LIVE_LAYER)]);
  await occupyBothWithRoute();

  // (a) OWNED — a stack item's template layer. Still `owned`, via `#slots`,
  //     which phase 5 did not touch.
  expect((await runtime!.load('item1', 'lower-third', {})).accepted).toBe(true);
  expect((await runtime!.take('item1')).accepted).toBe(true);
  expect(await runtime!.clearLayer(1, 10)).toEqual({ ok: false, reason: 'owned' });

  // (b) FOREIGN — the neighbour: same non-html producer, same sweep, no ledger
  //     entry. Still `foreign`, and that is the reason the live layer must NOT
  //     have got.
  expect(await runtime!.clearLayer(1, NEIGHBOUR_LAYER)).toEqual({ ok: false, reason: 'foreign' });

  // (c) RESERVED — a declared playout layer. Still refused before anything else.
  expect(await runtime!.clearLayer(1, 60)).toEqual({ ok: false, reason: 'reserved' });

  // (d) A genuine html orphan is STILL CLEARABLE — the door did not seize up.
  await foreignSend(mock!, 'PLAY 1-77 "foreign" HTML');
  await waitFor(() => runtime!.orphans().some((o) => o.layer === 77));
  expect(await runtime!.clearLayer(1, 77)).toEqual({ ok: true });
}, 30000);

// ── The ledger itself — separate from `#slots` ─────────────────────────────

it('the ledger is SEPARATE from the slot map: registering live layers creates no slot, and an item can own several', async () => {
  await boot();

  // An item's live layers do not appear as a stack slot: `#slots` answers
  // "where does this item's TEMPLATE live", and these are not that.
  runtime!.registerLiveLayers('item-live', [
    liveRecord(LIVE_LAYER, 'guest-1'),
    liveRecord(NEIGHBOUR_LAYER, 'guest-2'),
  ]);
  expect(runtime!.stackSnapshot().find((i) => i.itemId === 'item-live')).toBeUndefined();

  // N layers for ONE item — unrepresentable in `#slots`, which is exactly why
  // the ledger is a second structure rather than a widened value type.
  expect(runtime!.liveLayers().get('item-live')).toHaveLength(2);

  // A real stack item still gets its slot the ordinary way, alongside.
  expect((await runtime!.load('item1', 'lower-third', {})).accepted).toBe(true);
  expect(runtime!.stackSnapshot().find((i) => i.itemId === 'item1')?.slot).toMatchObject({
    channel: 1,
    layer: 10,
  });
  expect(runtime!.liveLayers().has('item1')).toBe(false);

  // Re-registering REPLACES rather than accumulates, so a re-seat cannot leave
  // a stale coordinate protected forever.
  runtime!.registerLiveLayers('item-live', [liveRecord(LIVE_LAYER, 'guest-1')]);
  expect(runtime!.liveLayers().get('item-live')).toHaveLength(1);
  runtime!.registerLiveLayers('item-live', []);
  expect(runtime!.liveLayers().has('item-live')).toBe(false);
}, 25000);
