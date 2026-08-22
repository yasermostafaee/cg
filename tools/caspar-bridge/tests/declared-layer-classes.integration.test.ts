import * as dgram from 'node:dgram';
import { afterEach, expect, it } from 'vitest';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import { AmcpTransport, CommandQueue } from '@cg/caspar-client';
import type { ConnectionConfig } from '@cg/shared-ipc';
import { CasparRuntime } from '../src/caspar-runtime.js';
import type { LiveLayerRecord } from '../src/live-layers.js';
import { HEALTH_MS } from './support/harness.js';

/**
 * R-028 (6.2 / 6.3 / 6.5) — **THE THREE DECLARED CLASSES, IN ONE SWEEP.**
 *
 * Every one of these facts is already covered somewhere: playout exclusion in
 * `orphan-layers` and `playout-layers`, the Live Source ledger at DOOR 1/DOOR 3 in
 * `live-source-ownership`, and the operator bank in `orphan-layers` §1. So why
 * this file exists rather than three ticks against three other files:
 *
 * 🔴 **THE RISK 6.5 NAMES IS NOT THAT ANY CLASS IS IMPLEMENTED WRONGLY. IT IS THAT
 * A NARROWING GETS WRITTEN AGAINST TWO OF THREE.** That failure mode is invisible
 * to a per-class test suite — each file keeps passing, because each file only ever
 * asks about its own class. What catches it is ONE run in which all three are
 * declared at once and the sweep has to give three different, correct answers in
 * the same tick. Three passing tests in three files is precisely how these rules
 * would drift apart with nothing going red.
 *
 * And the three answers ARE different, which is the other half of the point.
 * "Declared" is not a synonym for "not an orphan":
 *
 *   playout (60–69)      → EXCLUDED. Not ours; surfacing it invites the operator
 *                          to clear the company's live automation output.
 *   live-source (10–59)  → OWNED. We seated that producer and hold its coordinate
 *                          in our own ledger.
 *   operator-row (70+)   → still a CANDIDATE when unbound. The row declares the
 *                          layer is the operator's to USE; a producer there that
 *                          we did not put there is an orphan on the one surface
 *                          whose owner can deal with it.
 *
 * A `#declaredLayerClass` that returned a boolean would have collapsed all three
 * into the strongest answer, and the middle column below is what would break.
 */

let mock: MockHandle | null = null;
let runtime: CasparRuntime | null = null;
let foreignQueue: CommandQueue | null = null;
let foreignTransport: AmcpTransport | null = null;

const SWEEP_MS = 150;
const STALE_MS = 800;

/** One layer per declared class, plus one that nobody declared at all. */
const LIVE_LAYER = 30; // class 3 — inside the freed 10–59 span
const PLAYOUT_LAYER = 65; // class 2 — inside the reserved range
const BANK_LAYER = 71; // class 1 — a declared operator row, left UNBOUND
const UNDECLARED_LAYER = 45; // no class at all — the control

const RESERVED = [60, 61, 62, 63, 64, 65, 66, 67, 68, 69];
const BANK = { channel: 1, start: 70, count: 4 };
const FIXED_SLOTS = [
  { channel: 1, layer: 70 },
  { channel: 1, layer: 71 },
  { channel: 1, layer: 72 },
  { channel: 1, layer: 73 },
];

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

async function waitFor(predicate: () => boolean, what: string, timeoutMs = 8000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error(`waitFor timed out: ${what}`);
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

/** A second, independent AMCP client — how a producer the bridge did not create arrives. */
async function foreignSend(handle: MockHandle, line: string): Promise<void> {
  if (foreignTransport === null) {
    foreignTransport = new AmcpTransport();
    await foreignTransport.connect(handle.host, handle.amcpPort);
    foreignQueue = new CommandQueue(foreignTransport);
  }
  await foreignQueue?.enqueue(line);
}

function liveRecord(layer: number): LiveLayerRecord {
  const box = { x: 0, y: 0, width: 1, height: 1 };
  return {
    slot: { channel: 1, layer },
    sourceId: 'guest-1',
    role: 'fill',
    producer: 'route://2',
    fill: box,
    clip: box,
    intendedVolume: 0,
  };
}

/** Boot with ALL THREE classes declared at once — the whole point of this file. */
async function bootAllThree(): Promise<CasparRuntime> {
  const oscPort = await freeUdpPort();
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 30 });
  const r = new CasparRuntime(
    singleServer(mock.amcpPort, oscPort),
    {},
    {
      sweepMs: SWEEP_MS,
      occupancyStaleMs: STALE_MS,
      reservedLayers: RESERVED,
      fixedSlots: FIXED_SLOTS,
      fixedBank: BANK,
    },
  );
  runtime = r;
  r.start();
  await r.startServing();
  await r.whenServerHealthy(HEALTH_MS);
  return r;
}

/** Put a REAL `route` producer on all four layers and wait for the tap to see them. */
async function occupyAllFour(): Promise<void> {
  const m = mock;
  if (m === null) throw new Error('mock not booted');
  for (const layer of [LIVE_LAYER, PLAYOUT_LAYER, BANK_LAYER, UNDECLARED_LAYER]) {
    await foreignSend(m, `PLAY 1-${String(layer)} "route://2"`);
  }
  await waitFor(
    () =>
      [LIVE_LAYER, PLAYOUT_LAYER, BANK_LAYER, UNDECLARED_LAYER].every(
        (layer) => m.layerState({ channel: 1, layer })?.producer === 'route',
      ),
    'all four layers carry a route producer',
    5000,
  );
}

const orphanLayers = (r: CasparRuntime): number[] =>
  r
    .orphans()
    .map((o) => o.layer)
    .sort((a, b) => a - b);

it('R-009 narrows against ALL THREE declared classes in ONE tick, and each gets its own answer', async () => {
  const r = await bootAllThree();
  r.registerLiveLayers('item-guest', [liveRecord(LIVE_LAYER)]);
  await occupyAllFour();

  // The undeclared layer is the CONTROL: if it never surfaced, every assertion
  // below would pass for the wrong reason (a sweep that surfaces nothing).
  await waitFor(
    () => orphanLayers(r).includes(UNDECLARED_LAYER),
    'the sweep is running and surfaces an undeclared layer',
  );

  // Three declared classes, three correct answers, from one sample.
  const surfaced = orphanLayers(r);
  expect(surfaced, 'a bridge-owned Live Source layer is never an orphan').not.toContain(LIVE_LAYER);
  expect(surfaced, 'a declared playout layer is never an orphan').not.toContain(PLAYOUT_LAYER);
  // …and the one that is DELIBERATELY still a candidate. An unbound operator row
  // carrying a producer we did not put there is an orphan by the definition — and
  // the only other surface that could report it (the row itself) now reads EMPTY
  // unconditionally, so excluding it here would report it nowhere at all.
  expect(surfaced, 'an UNBOUND operator row is declared, but not owned').toContain(BANK_LAYER);
});

it('releasing the ledger hands ONLY that layer back — the other two classes do not move', async () => {
  // The boundary, applied to the class LIST rather than to one class: a change in
  // one class's membership must not perturb the others' answers.
  const r = await bootAllThree();
  r.registerLiveLayers('item-guest', [liveRecord(LIVE_LAYER)]);
  await occupyAllFour();
  await waitFor(() => orphanLayers(r).includes(UNDECLARED_LAYER), 'the sweep is running');
  expect(orphanLayers(r)).not.toContain(LIVE_LAYER);

  r.releaseLiveLayers('item-guest');
  await waitFor(
    () => orphanLayers(r).includes(LIVE_LAYER),
    'the released layer returns to the sweep',
  );
  const surfaced = orphanLayers(r);
  expect(surfaced, 'the playout class is untouched by a ledger release').not.toContain(
    PLAYOUT_LAYER,
  );
  expect(surfaced, 'the operator-row class is untouched too').toContain(BANK_LAYER);
});

it('R-015 (6.3) — each class is refused for ITS OWN reason, and the undeclared layer for R-015’s', async () => {
  /*
   * The refusal REASON is the assertion, not the refusal. All four of these are
   * refused, so a test that only checked `ok: false` would pass with every reason
   * scrambled — and the reason is the whole operator-facing content: `foreign`
   * means "provably not ours", which is a false statement about a layer the bridge
   * put the producer on, and `reserved` means "somebody else owns it", which is a
   * false statement about our own bank.
   */
  const r = await bootAllThree();
  r.registerLiveLayers('item-guest', [liveRecord(LIVE_LAYER)]);
  await occupyAllFour();
  await waitFor(() => orphanLayers(r).includes(UNDECLARED_LAYER), 'the sweep is running');

  expect(await r.clearLayer(1, LIVE_LAYER)).toEqual({ ok: false, reason: 'live-source' });
  expect(await r.clearLayer(1, PLAYOUT_LAYER)).toEqual({ ok: false, reason: 'reserved' });
  // OUTSIDE every declared class, R-015 is UNCHANGED: a non-html producer is
  // provably not ours, and "not html" fails safe without enumerating video kinds.
  expect(await r.clearLayer(1, UNDECLARED_LAYER)).toEqual({ ok: false, reason: 'foreign' });
  // An unbound BANK layer reaches the same R-015 rule through `layers.clear` —
  // the operator's own bank-scoped door (`clearBankLayer`) is what b1 widened, and
  // widening one door never loosened the other. Pinned in `clear-bank-scoped`.
  expect(await r.clearLayer(1, BANK_LAYER)).toEqual({ ok: false, reason: 'foreign' });
});

it('R-028 (7.1) — an item on an OLD DYNAMIC layer is not auto-relocated onto a row', async () => {
  /*
   * THE MIGRATION PROPERTY, asserted as a behaviour rather than trusted to the
   * absence of migration code.
   *
   * With a bank declared, it is tempting for an upgrade to "tidy up" by moving a
   * legacy item onto a declared row. That is an unattended on-air action: the
   * relocation is a CLEAR on the old layer and a fresh `CG ADD` on the new one, so
   * a graphic that was on air blinks off and back — at whatever moment the bridge
   * happened to restart, with nobody watching. The item keeps its layer until an
   * operator removes it, and the operator-guide's upgrade note tells them how.
   */
  const r = await bootAllThree();
  r.templateImport(
    { templateId: 'lower-third', templateType: 'lower-third', fields: [] },
    '<!doctype html><html><body>served</body></html>',
  );
  expect(
    await r.restore([
      {
        itemId: 'legacy',
        templateId: 'lower-third',
        fields: {},
        state: 'on-air',
        slot: { channel: 1, layer: 15, server: 'primary' },
      },
    ]),
  ).toEqual({ restored: 1, skipped: [] });

  // It came back on ITS OWN old layer…
  expect(r.stackSnapshot().find((i) => i.itemId === 'legacy')?.slot).toMatchObject({
    channel: 1,
    layer: 15,
  });
  // …and no declared row acquired it. A row that silently gained an item the
  // operator never put there would be the same lie from the other direction.
  for (const slot of r.fixedLayersState()) {
    expect(slot.binding, `row ${String(slot.layer)} must stay unbound`).toBeNull();
  }
});
