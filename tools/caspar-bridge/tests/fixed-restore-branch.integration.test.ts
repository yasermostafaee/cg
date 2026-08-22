import * as dgram from 'node:dgram';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import type { ConnectionConfig, FixedSlotState, TemplateInfo } from '@cg/shared-ipc';
import type { RetainedStackItem } from '@cg/shared-schema';
import { CasparRuntime } from '../src/caspar-runtime.js';
import { HEALTH_MS } from './support/harness.js';

/**
 * R-021 stage 4 (tasks 3.1–3.3) — **THE RESTORE BRANCH**: design.md §d tests
 * 1–5 and 8, against a real AMCP mock and a real OSC tap.
 *
 * The whole item rests on one promise — "layer 72 is the clock" — and a restore is
 * the one path that could quietly break it. Before this stage a retained
 * coordinate that could not be taken exactly fell through to `#allocate()`, so a
 * declared operator row came back on some DYNAMIC layer: the row the operator
 * built their rundown around was empty, and the graphic was somewhere else
 * entirely. Under R-028's declared model EVERY item is on a declared row, so that
 * fall-through misplaces every row after a bridge restart rather than an unlucky
 * one — which is why R-028 §1.1 lists this as blocking.
 *
 * Everything here is asserted on the WIRE — which layer a `CG ADD` addressed, and
 * that no `CLEAR` was sent at all — read from the mock's own NDJSON trace rather
 * than from internal bookkeeping, because the failure being prevented is a
 * broadcast one and a badge can read correct over a blind mechanism (B-093's
 * lesson, and the reason `blind-occupancy-tap` asserts the same way).
 */

let mock: MockHandle | null = null;
let runtime: CasparRuntime | null = null;
let tracePath: string | null = null;

const SWEEP_MS = 150;
const STALE_MS = 800;
const HTML = '<!doctype html><html><head><meta charset="utf-8"></head><body>سلام</body></html>';
const BANK = { channel: 1, start: 70, count: 4 };
const FIXED_SLOTS = [
  { channel: 1, layer: 70 },
  { channel: 1, layer: 71 },
  { channel: 1, layer: 72 },
  { channel: 1, layer: 73 },
];
const TEMPLATE: TemplateInfo = {
  templateId: 'lower-third',
  templateType: 'lower-third',
  fields: [],
};

afterEach(async () => {
  await runtime?.stop();
  runtime = null;
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

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Poll until `cond` holds. The predicate may be ASYNC — several of these read the
 * mock's flushed wire trace, and a sync-only signature would silently accept the
 * returned Promise as truthy and pass on the first tick, which is a test that
 * asserts nothing.
 */
async function waitFor(
  cond: () => boolean | Promise<boolean>,
  what: string,
  timeoutMs = 8000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await cond())) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await delay(25);
  }
}

/** The mock's NDJSON wire trace: recv'd AMCP lines, in arrival order. */
async function recvLines(): Promise<string[]> {
  if (mock === null || tracePath === null) throw new Error('no trace');
  await mock.traceFlush();
  return fs
    .readFileSync(tracePath, 'utf-8')
    .split('\n')
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as { dir: string; line: string })
    .filter((e) => e.dir === 'recv')
    .map((e) => e.line);
}

/** Every layer a `CG … ADD` addressed, in order. The re-ADD half of the decision. */
async function cgAddTargets(): Promise<string[]> {
  return (await recvLines())
    .map((l) => /^CG (\d+-\d+) ADD\b/.exec(l))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => m[1] as string);
}

/**
 * Every `CLEAR` that reached the wire, target included.
 *
 * Matched on the VERB rather than on `CLEAR 1-72`, so a channel-wide `CLEAR 1`
 * would be caught by the same assertion. "No CLEAR at all" is the property; a
 * pattern that could only see the per-layer form would pass over the worse bug.
 */
async function clearLines(): Promise<string[]> {
  return (await recvLines()).filter((l) => /^CLEAR\b/.test(l));
}

function singleServer(amcpPort: number, oscPort: number): ConnectionConfig {
  return {
    servers: { A: { host: '127.0.0.1', amcpPort, oscPort } },
    strategy: 'mirror-sync',
    autoFailoverEnabled: true,
  };
}

/**
 * Boot a runtime with a declared bank of 70–73.
 *
 * `blind: true` points the runtime's OSC socket at a port the mock never sends
 * to. That is a different state from "hearing, and the layer is silent", and the
 * difference is the whole subject of test 4.
 */
async function boot(opts: { blind?: boolean } = {}): Promise<CasparRuntime> {
  const oscPort = await freeUdpPort();
  tracePath = path.join(
    os.tmpdir(),
    `cg-fixedrestore-${String(process.pid)}-${String(Date.now())}-${String(
      Math.trunc(performance.now()),
    )}.ndjson`,
  );
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 40, tracePath });
  const listenPort = opts.blind === true ? await freeUdpPort() : oscPort;
  const r = new CasparRuntime(
    singleServer(mock.amcpPort, listenPort),
    {},
    { sweepMs: SWEEP_MS, occupancyStaleMs: STALE_MS, fixedSlots: FIXED_SLOTS, fixedBank: BANK },
  );
  runtime = r;
  r.start();
  await r.startServing();
  r.templateImport(TEMPLATE, HTML);
  await r.whenServerHealthy(HEALTH_MS);
  return r;
}

function slotState(r: CasparRuntime, layer: number): FixedSlotState | undefined {
  return r.fixedLayersState().find((s) => s.layer === layer);
}

function itemSlot(
  r: CasparRuntime,
  itemId: string,
): { channel: number; layer: number } | undefined {
  const s = r.stackSnapshot().find((i) => i.itemId === itemId)?.slot;
  return s === undefined ? undefined : { channel: s.channel, layer: s.layer };
}

const retainedOn = (layer: number, itemId = 'item1'): RetainedStackItem[] => [
  {
    itemId,
    templateId: 'lower-third',
    fields: { headline: 'سلام' },
    state: 'on-air',
    slot: { channel: 1, layer, server: 'primary' },
  },
];

/** Stage a foreground producer of `kind` on a layer, and wait for the tap to see it. */
async function stageProducer(r: CasparRuntime, layer: number, kind: string): Promise<void> {
  mock?.emitOsc(`/channel/1/stage/layer/${String(layer)}/foreground/producer`, [kind]);
  await waitFor(
    () => {
      const o = slotState(r, layer)?.observed;
      return o?.kind === 'producer' && o.producer === kind;
    },
    `the tap observes ${kind} on layer ${String(layer)}`,
  );
}

// ── §d test 1 ────────────────────────────────────────────────────────────────
it('a declared row restores ON ITS OWN LAYER — never re-allocated elsewhere', async () => {
  const r = await boot();

  expect(await r.restore(retainedOn(72))).toEqual({ restored: 1, skipped: [] });

  // The row it was retained on is the row it came back on. Asserted on the WIRE as
  // well as on the binding: a hearing tap saw layer 72 silent, so the ordinary
  // deferred decision re-ADDs — and it must be THIS layer's `CG ADD` and no other.
  expect(itemSlot(r, 'item1')).toEqual({ channel: 1, layer: 72 });
  expect(slotState(r, 72)?.binding?.itemId).toBe('item1');
  expect(await cgAddTargets()).toEqual(['1-72']);
  // The re-ADD is never preceded by an adopt-CLEAR (B-092's rule, and it holds on
  // a declared row exactly as it does on a dynamic one).
  expect(await clearLines()).toEqual([]);
  // …and no OTHER declared row was bound in passing.
  for (const layer of [70, 71, 73]) expect(slotState(r, layer)?.binding).toBeNull();
}, 40_000);

// ── §d test 2 ────────────────────────────────────────────────────────────────
it('a declared row held by a FOREIGN producer parks in restore-blocked — zero wire traffic', async () => {
  const r = await boot();
  await stageProducer(r, 72, 'decklink');

  expect(await r.restore(retainedOn(72))).toEqual({ restored: 1, skipped: [] });

  // THE STATE: named, visible, and carrying BOTH facts the operator needs — the
  // item that is waiting, and what is actually on its layer.
  const slot = slotState(r, 72);
  expect(slot?.binding).toMatchObject({ itemId: 'item1', restoreBlocked: true });
  expect(slot?.observed).toEqual({ kind: 'producer', producer: 'decklink' });

  // THE PROMISE: nothing was sent. Not the adopt-CLEAR that would have destroyed
  // somebody's live feed (R-015's blind-destruction class — and an automatic path
  // never destroys), and not a re-ADD over it either (which at play-on-load 0
  // would take it off air just as silently, PR #353's measured case).
  expect(await clearLines()).toEqual([]);
  expect(await cgAddTargets()).toEqual([]);

  // AND IT WAS NOT RE-HOMED. This is the fall-through R-021 forbids: the item
  // stays on its declared row, and no other row acquired it.
  expect(itemSlot(r, 'item1')).toEqual({ channel: 1, layer: 72 });
  for (const layer of [70, 71, 73]) expect(slotState(r, layer)?.binding).toBeNull();
}, 40_000);

// ── §d test 3 ────────────────────────────────────────────────────────────────
it('a declared row holding OUR OWN surviving html producer is adopted WITHOUT a CLEAR', async () => {
  const r = await boot();
  await stageProducer(r, 72, 'html');

  expect(await r.restore(retainedOn(72))).toEqual({ restored: 1, skipped: [] });

  // Adopted in place: a producer survived the bridge's death, so the correct
  // action is to touch NOTHING at all.
  expect(await clearLines()).toEqual([]);
  expect(await cgAddTargets()).toEqual([]);
  // `html` is OURS, so this is emphatically NOT the blocked state. The two share a
  // shape — a producer observed under a binding — and are separated by the kind
  // alone, which is why the discriminator may never be loosened to "occupied".
  expect(slotState(r, 72)?.binding?.restoreBlocked).toBeUndefined();
  expect(itemSlot(r, 'item1')).toEqual({ channel: 1, layer: 72 });
}, 40_000);

// ── §d test 4 ────────────────────────────────────────────────────────────────
it('a BLIND tap DEFERS a declared row rather than blocking it — and sends nothing', async () => {
  const r = await boot({ blind: true });

  expect(await r.restore(retainedOn(72))).toEqual({ restored: 1, skipped: [] });
  await delay(1200); // several sweep ticks: every chance for a decision to fire

  // Nothing was sent — the blind-tap contract (B-093), unchanged by this stage.
  expect(await clearLines()).toEqual([]);
  expect(await cgAddTargets()).toEqual([]);
  // AND the row reads `unverified`, NOT blocked. This is the distinction that
  // makes the block a RECORDED decision rather than a derivation from `observed`:
  // a tap that has heard nothing is not evidence for any claim about the layer, so
  // it may not produce a state that says we looked and found somebody else there.
  expect(r.stackSnapshot().find((i) => i.itemId === 'item1')?.status).toBe('unverified');
  expect(slotState(r, 72)?.binding?.restoreBlocked).toBeUndefined();
}, 40_000);

// ── §d test 5 ────────────────────────────────────────────────────────────────
it('REGRESSION — a DYNAMIC retained slot keeps #368: exact slot first, then elsewhere', async () => {
  const r = await boot();

  // (a) THE EXACT-SLOT HALF. Layer 15 is free and inside `lower-third`'s 10–19
  // range, and `#allocate()` hands out 10 — the range's FIRST free layer. So
  // "came back on 15" is reachable only through the exact-slot reserve, and this
  // assertion fails the moment that reserve is dropped. It was dropped: B-114
  // REPLACED `reserve()` with `bindFixed()` instead of branching, which fixed the
  // declared row and silently cost every dynamic row its exact-slot restore —
  // consulting the wrong layer's occupancy, which is precisely the hazard
  // `#slotForRestore`'s own contract forbids.
  expect(await r.restore(retainedOn(15, 'dyn-exact'))).toEqual({ restored: 1, skipped: [] });
  expect(itemSlot(r, 'dyn-exact')).toEqual({ channel: 1, layer: 15 });

  // (b) THE FALL-THROUGH HALF, unchanged and deliberately NOT extended to declared
  // rows: a second item retained on the SAME dynamic layer cannot have it, so it
  // is re-homed rather than skipped (#368's hardware-validated check #2). An
  // anonymous layer costs the operator nothing to swap; a declared row is a
  // promise, which is the entire reason only this half falls through.
  expect(await r.restore(retainedOn(15, 'dyn-taken'))).toEqual({ restored: 1, skipped: [] });
  const rehomed = itemSlot(r, 'dyn-taken');
  expect(rehomed).not.toEqual({ channel: 1, layer: 15 });
  expect(rehomed?.layer).toBeGreaterThanOrEqual(10);
  expect(rehomed?.layer).toBeLessThanOrEqual(19);
}, 40_000);

it('a declared row already bound by another restored item is SKIPPED, never re-homed', async () => {
  const r = await boot();

  expect(await r.restore(retainedOn(72, 'first'))).toEqual({ restored: 1, skipped: [] });
  // The second item names the same declared row. `#allocate()` would happily give
  // it a dynamic layer — the exact outcome R-021 forbids — so the only honest
  // answer is to skip it, and to say WHY (B-108) in terms the operator can act on:
  // nothing is exhausted here, so `no-layer` would send them to free a layer that
  // could not help.
  expect(await r.restore(retainedOn(72, 'second'))).toEqual({
    restored: 0,
    skipped: [{ itemId: 'second', reason: 'fixed-slot-taken' }],
  });
  expect(r.stackSnapshot().some((i) => i.itemId === 'second')).toBe(false);
  expect(slotState(r, 72)?.binding?.itemId).toBe('first');
}, 40_000);

// ── §d test 8 — the `restore-blocked` lifecycle ──────────────────────────────
it('restore-blocked EXITS when the foreign producer vacates — the deferred re-ADD proceeds', async () => {
  const r = await boot();
  await stageProducer(r, 72, 'decklink');
  expect(await r.restore(retainedOn(72))).toEqual({ restored: 1, skipped: [] });
  expect(slotState(r, 72)?.binding?.restoreBlocked).toBe(true);

  // The playout side takes its feed off 72. Nothing tells the bridge; the next
  // sweep simply observes the layer as empty.
  mock?.emitOsc('/channel/1/stage/layer/72/foreground/producer', ['empty']);

  // The ORDINARY deferred decision then proceeds — silent layer, so a re-ADD, on
  // the SAME layer. There is deliberately no separate un-block mechanism that
  // could drift from it: the item stayed in `#pendingRestore` the whole time.
  await waitFor(
    async () => (await cgAddTargets()).includes('1-72'),
    'the deferred re-ADD lands on 1-72',
    12_000,
  );
  await waitFor(
    () => slotState(r, 72)?.binding?.restoreBlocked === undefined,
    'the block is withdrawn',
  );
  // It exited WITHOUT an auto-clear and WITHOUT being re-homed — the two exits d1
  // forbids.
  expect(await clearLines()).toEqual([]);
  expect(itemSlot(r, 'item1')).toEqual({ channel: 1, layer: 72 });
}, 40_000);

it('restore-blocked EXITS on the operator’s own Clear, then take — and never re-blocks', async () => {
  const r = await boot();
  await stageProducer(r, 72, 'decklink');
  expect(await r.restore(retainedOn(72))).toEqual({ restored: 1, skipped: [] });
  expect(slotState(r, 72)?.binding?.restoreBlocked).toBe(true);

  // d1's FIRST exit: the operator's explicit, confirm-gated hard Clear, and THEN a
  // take. Two deliberate steps — never one compound verb hiding the destructive
  // half behind a constructive label (the B-100 lesson, applied to the surface).
  expect((await r.out('item1')).accepted).toBe(true);
  expect((await clearLines()).some((l) => l.startsWith('CLEAR 1-72'))).toBe(true);
  expect(slotState(r, 72)?.binding?.restoreBlocked).toBeUndefined();

  // The parked restore is retired with it, so a later sweep cannot replay the
  // block over the operator's own, newer command.
  await delay(600);
  expect(slotState(r, 72)?.binding?.restoreBlocked).toBeUndefined();

  // …and the row still holds the item, on its own layer, ready to be taken.
  expect(itemSlot(r, 'item1')).toEqual({ channel: 1, layer: 72 });
  expect((await r.take('item1')).accepted).toBe(true);
  await waitFor(
    async () => (await cgAddTargets()).includes('1-72'),
    'the take re-ADDs onto the declared row',
    12_000,
  );
}, 40_000);

it('a REMOVED item takes its block with it — no row publishes a block for a departed item', async () => {
  const r = await boot();
  await stageProducer(r, 72, 'decklink');
  expect(await r.restore(retainedOn(72))).toEqual({ restored: 1, skipped: [] });
  expect(slotState(r, 72)?.binding?.restoreBlocked).toBe(true);

  await r.remove('item1');
  expect(slotState(r, 72)?.binding).toBeNull();
  await delay(600); // the sweep re-decides nothing for an item that is gone
  expect(slotState(r, 72)?.binding).toBeNull();
}, 40_000);
