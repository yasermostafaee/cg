import * as dgram from 'node:dgram';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import type {
  ConnectionConfig,
  SourceAssignments,
  SourceCatalog,
  TemplateInfo,
} from '@cg/shared-ipc';
import { CasparRuntime } from '../src/caspar-runtime.js';
import type { LiveLayerRecord } from '../src/live-layers.js';
import { awaitChannelModeRead, HEALTH_MS } from './support/harness.js';

/**
 * 🔴 **PANIC — "SILENCE ALL BOXES", SCOPED TO THE LEDGER RATHER THAN TO BELIEVED STATUS.**
 *
 * ── THE DEFECT THIS FILE EXISTS FOR ────────────────────────────────────────
 *
 * PANIC's first cut resolved its scope in the BROWSER, from the console's `isOnAir(item)`
 * predicate. But the bridge routinely holds SEATS for a row that is not on air — `B-145`'s boot
 * adoption restores the persisted ledger while the browser re-delivers its stack intent
 * separately, so *"after a restart EVERY row arrives in this state"*. Those producers are on
 * their layers, and if one was raised it is AUDIBLE. That row reads neither on air nor
 * rehearsing, so **the panic button could not reach it**: an open microphone with an emergency
 * control pointed somewhere else.
 *
 * ⚠ The residual was first written up as the `exitRehearse` window. That is the wrong cause and
 * is corrected at {@link seatsOnAnOffAirRow}: leaving rehearse cannot produce this state,
 * because a rehearsing row's plates are never seated in the first place. Boot adoption is what
 * produces it; rehearse is only a way of passing through it. (`B-216` made that true by
 * construction — from `B-161` until then, an `update` with bindings DID seat a rehearsing row,
 * because `#ownsLiveSeats` carried the rehearse flag. Ownership is now the ledger at every door.)
 *
 * That is `B-122`'s shape one verb along — *"it gated the emergency control on exactly the
 * values that may be wrong in the emergency"* — and the fix is `clearAll`'s: ask the LEDGER,
 * which is a structural fact the bridge wrote itself when it sent the `PLAY`, not a status that
 * can be wrong.
 *
 * ── 🔴 AND IT DOES NOT WEAKEN GOLDEN RULE 10 ───────────────────────────────
 *
 * Rule 10 stops a CONFIGURATION verb from putting content ON AIR — its own words are *"no
 * `PLAY`, no un-mute and no fill"*. PANIC does none of those three: it only ever LOWERS a
 * volume, on layers that already exist, and it seats nothing, un-holds nothing, fills nothing
 * and creates nothing. `the wire carries ONLY MIXER … VOLUME 0` below is that claim, measured.
 */

let mock: MockHandle | null = null;
let runtime: CasparRuntime | null = null;
let tracePath: string | null = null;

const BAND = { start: 30, end: 34 };
const SCENE = { width: 1920, height: 1080 };
const CENTRED = { anchor: 'center' as const, offset: { x: 0, y: 0 } };

const plate = (elementId: string, sourceId: string, x: number) => ({
  elementId,
  sourceId,
  rect: { x, y: 100, width: 400, height: 225 },
  dynamic: false,
});

const TEMPLATE: TemplateInfo = {
  templateId: 'two-box',
  templateType: 'two-box',
  fields: [],
  liveSources: {
    resolution: SCENE,
    defaultPosition: CENTRED,
    sources: [plate('el-1', 'guest-1', 100), plate('el-2', 'guest-2', 600)],
  },
};

const CATALOG: SourceCatalog = {
  sources: [
    { id: 'src-a', name: 'Studio A', format: '1080i5000', producer: { kind: 'route', channel: 2 } },
    { id: 'src-b', name: 'Baku', format: '1080i5000', producer: { kind: 'route', channel: 3 } },
  ],
  layerRange: BAND,
};

const ASSIGNMENTS: SourceAssignments = {
  assignments: [
    { templateId: 'two-box', plateId: 'guest-1', sourceId: 'src-a' },
    { templateId: 'two-box', plateId: 'guest-2', sourceId: 'src-b' },
  ],
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

function singleServer(amcpPort: number, oscPort: number): ConnectionConfig {
  return {
    servers: { A: { host: '127.0.0.1', amcpPort, oscPort } },
    strategy: 'mirror-sync',
    autoFailoverEnabled: true,
  };
}

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

async function boot(): Promise<CasparRuntime> {
  const oscPort = await freeUdpPort();
  tracePath = path.join(
    os.tmpdir(),
    `cg-panic-${String(process.pid)}-${String(Date.now())}-${String(Math.round(performance.now() * 1000))}.ndjson`,
  );
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 30, tracePath });
  const r = new CasparRuntime(
    singleServer(mock.amcpPort, oscPort),
    {},
    { sweepMs: 150, sourceCatalog: CATALOG, sourceAssignments: ASSIGNMENTS },
  );
  runtime = r;
  r.start();
  await r.startServing();
  r.templateImport(TEMPLATE, '<!doctype html><html><body>served</body></html>');
  await r.whenServerHealthy(HEALTH_MS);
  await awaitChannelModeRead(r);
  return r;
}

const layerOf = (r: CasparRuntime, itemId: string, plateId: string): number =>
  (r.liveLayers().get(itemId) ?? []).find((rec) => rec.sourceId === plateId)?.slot.layer ?? -1;

const volumeOf = (r: CasparRuntime, itemId: string, plateId: string): number | undefined =>
  mock?.layerState({ channel: 1, layer: layerOf(r, itemId, plateId) })?.volume;

const since = async (from: number): Promise<string[]> => (await recvLines()).slice(from);

async function onAir(r: CasparRuntime, itemId = 'item-1'): Promise<void> {
  await r.load(itemId, 'two-box', {});
  expect((await r.take(itemId)).accepted).toBe(true);
}

/**
 * 🔴 **THE WINDOW: THE BRIDGE HOLDS SEATS FOR A ROW THAT IS NOT ON AIR — with REAL producers
 * on REAL layers, raised.**
 *
 * ── WHERE THIS STATE COMES FROM IN PRODUCTION, corrected ───────────────────
 *
 * ⚠ **NOT from `exitRehearse`, and it is worth saying so because that is the plausible answer
 * and it is wrong.** A rehearsing row's plates are never seated in the first place.
 * `enterRehearse` seats nothing; `setActiveLook` returns early for a row that owns no live
 * layer; and `swapLiveSource`/`update` on such a row reach no layer either. So leaving rehearse
 * cannot, by itself, produce a seated off-air row. (⚠ `B-216`: the `update` half of that was
 * FALSE from `B-161` until 2026-09-04 — `#ownsLiveSeats` carried the rehearse flag and an
 * UPDATE with bindings seated a rehearsing row's plates. Ownership is now the ledger at every
 * door, and `ownership-is-the-ledger.integration.test.ts` pins all three verbs on the wire.)
 *
 * The real origin is **BOOT ADOPTION (`B-145`)**: `adoptLiveLayers` restores the persisted
 * ledger at startup while the browser re-delivers its stack intent SEPARATELY, so the bridge
 * routinely holds confirmed seats for a row the stack reports as `loaded` — that file's own
 * words are *"after a restart EVERY row arrives in this state"*. A row in it can then enter and
 * leave rehearse, which is how `exitRehearse` came to look like the cause.
 *
 * ── HOW IT IS BUILT HERE ───────────────────────────────────────────────────
 *
 * A real take seats real producers and a real raise puts VOLUME 1 on the wire; the seats are
 * then re-keyed onto a row that is merely `loaded`. `registerLiveLayers` is the bridge's OWN
 * public ledger writer — the one `adoptLiveLayers` itself writes through — and three existing
 * test files build ledger state this way. Nothing about the PRODUCERS is simulated: they are on
 * those layers, at that volume, and the assertions read the mock's actual layer state.
 */
async function seatsOnAnOffAirRow(r: CasparRuntime): Promise<void> {
  await onAir(r, 'item-1');
  expect((await r.setLivePlateVolume('item-1', 'guest-1', 1)).sent).toBe(true);
  expect(volumeOf(r, 'item-1', 'guest-1'), 'the guest is genuinely AUDIBLE').toBe(1);

  const records = r.liveLayers().get('item-1') ?? [];
  expect(records).toHaveLength(2);
  await r.load('item-2', 'two-box', {});
  // The seats now belong to a row nothing has taken — the adopted-ledger shape.
  r.registerLiveLayers('item-1', []);
  r.registerLiveLayers('item-2', records);
  expect(r.liveLayers().get('item-2'), 'seats held by an off-air row').toHaveLength(2);
}

// ── THE RED ───────────────────────────────────────────────────────────────────

describe('🔴 seats held by an OFF-AIR row — the case PANIC could not reach', () => {
  it('🔴 THE FIX: a seated-but-not-on-air row IS silenced, on the WIRE', async () => {
    /*
      RED before `PATCH-BX-01`: PANIC's scope came from the browser's `isOnAir`, and even
      bridge-side the writer's gate refused to SEND on a row `#ownsLiveSeats` calls false —
      so this plate stayed at VOLUME 1 with the console reporting a completed panic.
    */
    const r = await boot();
    await seatsOnAnOffAirRow(r);

    const verdict = await r.silenceAllLivePlates();

    expect(volumeOf(r, 'item-2', 'guest-1'), 'the open microphone is CLOSED').toBe(0);
    expect(verdict.ok).toBe(true);
    expect(verdict.silenced, 'both plates reached the wire').toBe(2);
    expect(verdict.rows).toEqual([{ itemId: 'item-2', plates: 2 }]);
  });

  it('🔴 …and the plain OFF verb reaches it too — the gate is DIRECTIONAL, not PANIC-only', async () => {
    /*
      The same window, through the ordinary per-plate door. Refusing to LOWER a volume there
      was a defect in its own right: OFF recorded an intent, sent nothing, answered `ok`, and
      left the guest audible.
    */
    const r = await boot();
    await seatsOnAnOffAirRow(r);

    expect((await r.setLivePlateVolume('item-2', 'guest-1', 0)).sent).toBe(true);

    expect(volumeOf(r, 'item-2', 'guest-1')).toBe(0);
  });

  it('a RAISE on the same row REACHES the wire — the seats are the bridge’s (B-216), and rule 10 is intact', async () => {
    /*
      🔴 `B-216` — THIS TEST USED TO ASSERT THE OPPOSITE ("a raise on the same row is still
      refused the wire"), on the reading that a row could hold seats it did not own. Under the
      ledger axis the ledger IS ownership: these producers are on their layers, composited on
      the channel, and an operator pressing ON for a guest they can see must be obeyed. Rule
      10 is intact because its subject is a row that owns NO live layer — the seatless row in
      `ownership-is-the-ledger.integration.test.ts` and `live-plate-audio-verbs`' GOLDEN RULE
      10 block — where a raise still records the intent and sends nothing.
    */
    const r = await boot();
    await seatsOnAnOffAirRow(r);
    await r.setLivePlateVolume('item-2', 'guest-1', 0);
    const before = (await recvLines()).length;

    const verdict = await r.setLivePlateVolume('item-2', 'guest-2', 1);

    expect(verdict).toEqual({ ok: true, sent: true });
    expect(
      (await since(before)).filter((l) => /VOLUME 1$/.test(l)),
      'the raise reached the seat the ledger names',
    ).toHaveLength(1);
    expect(volumeOf(r, 'item-2', 'guest-2'), 'the guest is genuinely audible now').toBe(1);
    expect(r.livePlateVolumes('item-2')?.['guest-2']).toBe(1);
  });
});

// ── THE ORDINARY CASE STILL WORKS ─────────────────────────────────────────────

describe('PANIC still silences ordinary on-air rows', () => {
  it('every plate of an on-air row goes to zero, and the report names the row', async () => {
    const r = await boot();
    await onAir(r);
    await r.setLivePlateVolumes('item-1', { 'guest-1': 1, 'guest-2': 0.6 });
    expect(volumeOf(r, 'item-1', 'guest-1')).toBe(1);

    const verdict = await r.silenceAllLivePlates();

    expect(volumeOf(r, 'item-1', 'guest-1')).toBe(0);
    expect(volumeOf(r, 'item-1', 'guest-2')).toBe(0);
    expect(r.livePlateVolumes('item-1')).toEqual({ 'guest-1': 0, 'guest-2': 0 });
    expect(verdict.ok).toBe(true);
    expect(verdict.silenced).toBe(2);
    expect(verdict.recorded).toBe(2);
    expect(verdict.rows).toEqual([{ itemId: 'item-1', plates: 2 }]);
  });

  it('it reaches an ON-AIR row and an OFF-AIR seated row in ONE press', async () => {
    /*
      🔴 THE LEDGER SCOPE'S REAL PAYOFF. One press covers both kinds, and the operator does not
      have to know — or be right about — which row is in which state. Under the old browser-side
      `isOnAir` scope this press reached exactly half of what was audible.
    */
    const r = await boot();
    await onAir(r, 'item-1');
    await r.setLivePlateVolumes('item-1', { 'guest-1': 1, 'guest-2': 1 });
    const records = r.liveLayers().get('item-1') ?? [];
    const stays = records.filter((x) => x.sourceId === 'guest-1');
    const moves = records.filter((x) => x.sourceId === 'guest-2');
    // `item-1` stays ON AIR holding `guest-1`; `guest-2`'s seat is re-keyed onto a row nothing
    // has taken. Two rows, one audible plate each, in opposite states — and the SAME producers
    // on the SAME layers throughout, so no source is seated twice.
    await r.load('item-2', 'two-box', {});
    r.registerLiveLayers('item-1', stays);
    r.registerLiveLayers('item-2', moves);
    expect(volumeOf(r, 'item-1', 'guest-1'), 'on-air plate is audible').toBe(1);
    expect(volumeOf(r, 'item-2', 'guest-2'), 'off-air plate is audible too').toBe(1);

    const verdict = await r.silenceAllLivePlates();

    expect(volumeOf(r, 'item-1', 'guest-1'), 'the on-air row').toBe(0);
    expect(volumeOf(r, 'item-2', 'guest-2'), 'the off-air seated row').toBe(0);
    expect(verdict.rows.map((x) => x.itemId).sort()).toEqual(['item-1', 'item-2']);
    expect(verdict.silenced).toBe(2);
  });
});

// ── THE WIRE FOOTPRINT ────────────────────────────────────────────────────────

describe('🔴 PANIC emits NOTHING but mutes — no PLAY, no un-mute, no fill, no un-hold', () => {
  it('the wire carries ONLY `MIXER … VOLUME 0`', async () => {
    /*
      Golden rule 10 in one assertion, measured rather than argued. `B-161` was four `PLAY`s,
      four `MIXER VOLUME` and eight `MIXER FILL`/`CLIP` arriving from a verb nobody associated
      with playout. If PANIC ever emits one of those, this reddens.
    */
    const r = await boot();
    await onAir(r);
    await r.setLivePlateVolumes('item-1', { 'guest-1': 1, 'guest-2': 1 });
    const before = (await recvLines()).length;

    await r.silenceAllLivePlates();

    const lines = await since(before);
    expect(
      lines.length,
      'something was actually sent — an empty wire would pass vacuously',
    ).toBeGreaterThan(0);
    for (const line of lines) {
      expect(line, `PANIC emitted a non-mute: ${line}`).toMatch(/^MIXER \S+ VOLUME 0$/);
    }
    expect(lines.some((l) => l.startsWith('PLAY'))).toBe(false);
    expect(lines.some((l) => /CG \d/.test(l))).toBe(false);
    expect(lines.some((l) => /MIXER \S+ (FILL|CLIP)/.test(l))).toBe(false);
    expect(
      lines.some((l) => / VOLUME (?!0$)/.test(l)),
      'never an UN-mute',
    ).toBe(false);
  });

  it('it does not un-hold a held plate, on the ledger or on the wire', async () => {
    const r = await boot();
    await onAir(r);
    const records = r.liveLayers().get('item-1') ?? [];
    r.registerLiveLayers(
      'item-1',
      records.map((rec) => (rec.sourceId === 'guest-2' ? { ...rec, held: true } : rec)),
    );

    await r.silenceAllLivePlates();

    expect(
      r
        .liveLayers()
        .get('item-1')
        ?.find((x) => x.sourceId === 'guest-2')?.held,
      'still held — un-holding is a LOOK’s job, never an audio verb’s',
    ).toBe(true);
  });
});

// ── HELD PLATES (B3) ──────────────────────────────────────────────────────────

describe('🔴 a HELD plate: intent RECORDED, nothing SENT', () => {
  /**
   * The decision, and its reason: a held plate is seated but the active look punches no hole
   * for it, and §12.4's hold is *"muted and idle"* — so it is ALREADY SILENT and there is
   * nothing for a panic to take off air. What matters is that its recorded intent goes to `0`
   * like every other, because the reconcile that eventually UN-holds it asserts that intent —
   * so a plate silenced during a panic stays silent when its look comes back, instead of
   * returning at whatever it was before.
   */
  async function withHeldSibling(r: CasparRuntime): Promise<void> {
    await onAir(r);
    await r.setLivePlateVolumes('item-1', { 'guest-1': 1, 'guest-2': 1 });
    const records = r.liveLayers().get('item-1') ?? [];
    r.registerLiveLayers(
      'item-1',
      records.map((rec) => (rec.sourceId === 'guest-2' ? { ...rec, held: true } : rec)),
    );
  }

  it('no wire command is addressed to the held plate’s layer', async () => {
    const r = await boot();
    await withHeldSibling(r);
    const heldLayer = `MIXER 1-${String(layerOf(r, 'item-1', 'guest-2'))} `;
    const before = (await recvLines()).length;

    await r.silenceAllLivePlates();

    const lines = await since(before);
    expect(lines.some((l) => l.startsWith(heldLayer))).toBe(false);
    // …while its UNHELD sibling did get one.
    expect(lines).toContain(`MIXER 1-${String(layerOf(r, 'item-1', 'guest-1'))} VOLUME 0`);
  });

  it('its INTENT is still recorded, so it stays silent when its look comes back', async () => {
    const r = await boot();
    await withHeldSibling(r);

    await r.silenceAllLivePlates();

    expect(r.livePlateVolumes('item-1')).toEqual({ 'guest-1': 0, 'guest-2': 0 });
  });

  it('the report counts it as RECORDED but not as SILENCED — two numbers, both true', async () => {
    const r = await boot();
    await withHeldSibling(r);

    const verdict = await r.silenceAllLivePlates();

    expect(verdict.recorded, 'both plates had their intent set').toBe(2);
    expect(verdict.silenced, 'only the unheld one reached the wire').toBe(1);
    // A ledger of nothing but held plates is still a COMPLETE success — there was nothing to
    // send, and every intent landed.
    expect(verdict.ok).toBe(true);
  });
});

// ── THE REPORT ────────────────────────────────────────────────────────────────

describe('the report cannot dress a no-op as a success (B-122)', () => {
  it('an EMPTY ledger reports ok:false with zeros', async () => {
    const r = await boot();
    const before = (await recvLines()).length;

    const verdict = await r.silenceAllLivePlates();

    expect(verdict).toEqual({ ok: false, silenced: 0, recorded: 0, rows: [], failed: [] });
    expect(await since(before)).toEqual([]);
  });

  it('a plate whose send FAILS is named, and the press is not ok', async () => {
    const r = await boot();
    await onAir(r);
    await r.setLivePlateVolumes('item-1', { 'guest-1': 1, 'guest-2': 1 });
    mock?.setHandler('MIXER', () => ({ kind: 'err', code: 502, verb: 'MIXER' }));

    const verdict = await r.silenceAllLivePlates();

    expect(verdict.ok).toBe(false);
    expect(verdict.failed.map((f) => f.plateId).sort()).toEqual(['guest-1', 'guest-2']);
    expect(verdict.silenced).toBe(0);
  });

  it('a fill+key pair is silenced ONCE, not twice — the same statement sent twice is one', async () => {
    const r = await boot();
    await onAir(r);
    const records = r.liveLayers().get('item-1') ?? [];
    const first = records[0] as LiveLayerRecord;
    // A key half carries the SAME sourceId on a second record — the shape `role` exists for.
    r.registerLiveLayers('item-1', [
      ...records,
      { ...first, slot: { channel: 1, layer: 34 }, role: 'key' },
    ]);

    const verdict = await r.silenceAllLivePlates();

    expect(verdict.recorded, 'two PLATES, not three records').toBe(2);
    expect(verdict.rows).toEqual([{ itemId: 'item-1', plates: 2 }]);
  });
});

// ── THE STRANDED LAYER ────────────────────────────────────────────────────────

describe('🔴 a STRANDED live layer is reachable by PANIC — the one nothing else can reach', () => {
  it('a seat whose item the reconciler no longer carries is still silenced', async () => {
    /*
      `B-145`'s subject: *"the layers stay lit and nothing in the product can name them"*. The
      ledger is keyed by `itemId` and adopted from disk at boot, so it can hold records for an
      item the stack does not carry.

      Before the plate-validity widening, `setLivePlateVolume` refused such a plate
      `unknown-plate` — it checked the TEMPLATE declaration, and a stranded row has no
      reconciler entry to find a template through. So the one producer with no other handle was
      also the one the panic button could not touch.
    */
    const r = await boot();
    await onAir(r);
    await r.setLivePlateVolume('item-1', 'guest-1', 1);
    const records = r.liveLayers().get('item-1') ?? [];
    const strandedLayer = records[0]?.slot.layer ?? -1;
    // Re-key the SAME seats onto an itemId the stack does not carry — exactly what a ledger
    // adopted from disk after the operator removed the row looks like.
    r.registerLiveLayers('ghost-item', records);
    expect(r.liveLayers().get('ghost-item')).toHaveLength(2);

    const verdict = await r.silenceAllLivePlates();

    expect(verdict.rows.map((x) => x.itemId)).toContain('ghost-item');
    expect(verdict.failed, 'no plate was refused as unknown').toEqual([]);
    expect(mock?.layerState({ channel: 1, layer: strandedLayer })?.volume).toBe(0);
  });
});
