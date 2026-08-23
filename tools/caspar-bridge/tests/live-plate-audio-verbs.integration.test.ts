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
import type { RetainedStackItem } from '@cg/shared-schema';
import { CasparRuntime } from '../src/caspar-runtime.js';
import type { LiveLayerRecord } from '../src/live-layers.js';
import { awaitChannelModeRead, HEALTH_MS } from './support/harness.js';

/**
 * `add-multibox-audio` — **THE FOUR OPERATOR VERBS, AND THE ONE RULE THEY ALL HAVE TO
 * SATISFY FIRST.**
 *
 * FADER, ON/OFF, SOLO and PANIC are all writes to ONE map of plate volumes. Bridge-side they
 * are therefore one verb (`setLivePlateVolumes`) applied to four differently-shaped maps, and
 * this file asserts the properties that make each of the four safe:
 *
 *   - 🔴 **GOLDEN RULE 10 first.** Setting a volume is a CONFIGURATION verb. On a row that
 *     owns no live seats, every one of the four records intent and sends NOTHING. It is
 *     asserted PER VERB rather than inherited by assumption from `setLivePlateVolume`'s
 *     current shape — the gate lives in that one writer precisely so it cannot be got round,
 *     and a test that only checked the writer would not notice a fifth verb bypassing it.
 *   - **SOLO's wire footprint**, exactly: one raise, N−1 mutes.
 *   - **The HELD-plate rule** holds for all four: intent recorded, nothing sent.
 *   - **Retention** carries every one of the four across a bridge restart.
 *   - **`0` is never confused with absent** in any of the new reads.
 *
 * ⚠ **WHY `B-161` REACHES AUDIO AT ALL, since a volume is not a `PLAY`.** The seat is written
 * at `record.intendedVolume` and re-asserted whenever that seat is (re)built, so a plate raised
 * while its row owned no seats would have been **seated AUDIBLE** by whatever seated it next —
 * a guest's microphone reaching air through a verb nobody associates with playout. Same shape
 * as `B-161`'s videos-with-no-template, one field over.
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

/** Four boxes — the case the whole feature exists for. */
const TEMPLATE: TemplateInfo = {
  templateId: 'four-box',
  templateType: 'four-box',
  fields: [],
  liveSources: {
    resolution: SCENE,
    defaultPosition: CENTRED,
    sources: [
      plate('el-1', 'guest-1', 100),
      plate('el-2', 'guest-2', 600),
      plate('el-3', 'guest-3', 1100),
      plate('el-4', 'guest-4', 1500),
    ],
  },
};

const CATALOG: SourceCatalog = {
  sources: [
    { id: 'src-a', name: 'Studio A', format: '1080i5000', producer: { kind: 'route', channel: 2 } },
    { id: 'src-b', name: 'Baku', format: '1080i5000', producer: { kind: 'route', channel: 3 } },
    { id: 'src-c', name: 'Tabriz', format: '1080i5000', producer: { kind: 'route', channel: 4 } },
    { id: 'src-d', name: 'Mashhad', format: '1080i5000', producer: { kind: 'route', channel: 5 } },
  ],
  layerRange: BAND,
};

const ASSIGNMENTS: SourceAssignments = {
  assignments: [
    { templateId: 'four-box', plateId: 'guest-1', sourceId: 'src-a' },
    { templateId: 'four-box', plateId: 'guest-2', sourceId: 'src-b' },
    { templateId: 'four-box', plateId: 'guest-3', sourceId: 'src-c' },
    { templateId: 'four-box', plateId: 'guest-4', sourceId: 'src-d' },
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
    `cg-audioverbs-${String(process.pid)}-${String(Date.now())}-${String(Math.round(performance.now() * 1000))}.ndjson`,
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
  // Every "the wire shows NOTHING" assertion below reads from a `before` baseline, which is
  // valid only once R-030's timer-driven one-shot `INFO` has drained (flake family 3).
  await awaitChannelModeRead(r);
  return r;
}

async function onAir(r: CasparRuntime): Promise<void> {
  await r.load('item-1', 'four-box', {});
  expect((await r.take('item-1')).accepted).toBe(true);
}

const layerOf = (r: CasparRuntime, plateId: string): number =>
  (r.liveLayers().get('item-1') ?? []).find((rec) => rec.sourceId === plateId)?.slot.layer ?? -1;

const volumeOf = (r: CasparRuntime, plateId: string): number | undefined =>
  mock?.layerState({ channel: 1, layer: layerOf(r, plateId) })?.volume;

/** Every `MIXER … VOLUME` the wire has carried since `from`. */
async function volumeLines(from: number): Promise<string[]> {
  return (await recvLines()).slice(from).filter((l) => /^MIXER \S+ VOLUME /.test(l));
}

/** The four verbs, as the MAPS the operator surface actually sends. */
const FADER = { 'guest-1': 0.4 };
const ON = { 'guest-1': 1 };
const OFF = { 'guest-1': 0 };
const SOLO = { 'guest-1': 1, 'guest-2': 0, 'guest-3': 0, 'guest-4': 0 };
const PANIC = { 'guest-1': 0, 'guest-2': 0, 'guest-3': 0, 'guest-4': 0 };

const VERBS: [string, Record<string, number>][] = [
  ['FADER', FADER],
  ['ON', ON],
  ['OFF', OFF],
  ['SOLO', SOLO],
  ['PANIC', PANIC],
];

/**
 * A ledger record, written directly.
 *
 * ⚠ **NOT a shortcut around the seating path — it is how the reachable state is REACHED.**
 * `out` and `stopItem` both call `teardownLiveLayers`, which releases the ledger, so records
 * and a not-owning row do not coexist through those doors. `exitRehearse` does NOT tear plates
 * down, and that is the real state this construction stands in for. `registerLiveLayers` is
 * the bridge's own public ledger writer and is used this way by
 * `declared-layer-classes.integration.test.ts` and `clear-all-status-independent.integration.test.ts`.
 */
function seatRecord(layer: number, sourceId: string, held?: boolean): LiveLayerRecord {
  const rect = { x: 0, y: 0, width: 1, height: 1 };
  return {
    slot: { channel: 1, layer },
    sourceId,
    role: 'fill',
    producer: `route://1-${String(layer)}`,
    fill: rect,
    clip: rect,
    intendedVolume: 0,
    ...(held === undefined ? {} : { held }),
  };
}

// ── SOLO ──────────────────────────────────────────────────────────────────────

describe('SOLO — one raise, N−1 mutes, in ONE call', () => {
  it('🔴 emits exactly one `VOLUME 1` and three `VOLUME 0`, and writes the same into plateVolumes', async () => {
    const r = await boot();
    await onAir(r);
    const before = (await recvLines()).length;

    const verdict = await r.setLivePlateVolumes('item-1', SOLO);

    expect(verdict.ok).toBe(true);
    expect(verdict.results.map((x) => x.plateId)).toEqual([
      'guest-1',
      'guest-2',
      'guest-3',
      'guest-4',
    ]);

    const lines = await volumeLines(before);
    expect(lines.filter((l) => l.endsWith(' VOLUME 1'))).toEqual([
      `MIXER 1-${String(layerOf(r, 'guest-1'))} VOLUME 1`,
    ]);
    expect(lines.filter((l) => l.endsWith(' VOLUME 0'))).toHaveLength(3);
    // …and it is the SIBLINGS that were muted, not any three layers.
    for (const p of ['guest-2', 'guest-3', 'guest-4']) {
      expect(lines).toContain(`MIXER 1-${String(layerOf(r, p))} VOLUME 0`);
    }

    // THE INTENT MAP SAYS THE SAME THING. A wire that raised one plate while the recorded
    // intent said something else would be re-asserted onto every future seat — one gesture
    // becoming a standing lie about what is audible.
    expect(r.livePlateVolumes('item-1')).toEqual(SOLO);
    expect(volumeOf(r, 'guest-1')).toBe(1);
    expect(volumeOf(r, 'guest-2')).toBe(0);
  });

  it('the RAISE goes first, so a map that dies half-way leaves siblings SILENCED, not raised', async () => {
    // Insertion order is the caller's and the bridge preserves it. Silence is the safe
    // direction for a partial application; two guests up is not.
    const r = await boot();
    await onAir(r);
    const before = (await recvLines()).length;

    await r.setLivePlateVolumes('item-1', SOLO);

    const lines = await volumeLines(before);
    expect(lines[0]).toBe(`MIXER 1-${String(layerOf(r, 'guest-1'))} VOLUME 1`);
  });

  it('one refused plate does not hide the plates that landed', async () => {
    const r = await boot();
    await onAir(r);

    const verdict = await r.setLivePlateVolumes('item-1', {
      'guest-1': 1,
      'guest-9': 0,
      'guest-2': 0,
    });

    expect(verdict.ok, 'a partial application is never ok').toBe(false);
    expect(verdict.results).toEqual([
      { plateId: 'guest-1', ok: true },
      { plateId: 'guest-9', ok: false, reason: 'unknown-plate' },
      { plateId: 'guest-2', ok: true },
    ]);
    // The two DECLARED plates really did move — a single `ok: false` would have said
    // otherwise and had the operator re-press a gesture that had already landed.
    expect(volumeOf(r, 'guest-1')).toBe(1);
    expect(r.livePlateVolumes('item-1')).toEqual({ 'guest-1': 1, 'guest-2': 0 });
  });

  it('an out-of-range volume is refused PER PLATE, and records nothing for it', async () => {
    const r = await boot();
    await onAir(r);

    const verdict = await r.setLivePlateVolumes('item-1', { 'guest-1': 1, 'guest-2': 40 });

    expect(verdict.results[1]).toEqual({
      plateId: 'guest-2',
      ok: false,
      reason: 'invalid-volume',
    });
    expect(r.livePlateVolumes('item-1')?.['guest-2']).toBeUndefined();
  });

  it('an EMPTY map is a no-op that SUCCEEDED — PANIC over a plateless row is not a failure', async () => {
    const r = await boot();
    await onAir(r);
    const before = (await recvLines()).length;

    expect(await r.setLivePlateVolumes('item-1', {})).toEqual({ ok: true, results: [] });

    expect(await volumeLines(before)).toEqual([]);
  });
});

// ── GOLDEN RULE 10 ────────────────────────────────────────────────────────────

describe('🔴 GOLDEN RULE 10 — on a row that owns no live seats, every verb sends NOTHING', () => {
  /**
   * A `loaded` row that OWNS SEATED RECORDS — the state the gate exists for.
   *
   * The record check alone is not the gate, and this is the fixture that proves it: there
   * really are records here, so a gate written as "is anything seated?" would send.
   */
  async function loadedWithSeats(): Promise<CasparRuntime> {
    const r = await boot();
    await r.load('item-1', 'four-box', {});
    r.registerLiveLayers('item-1', [
      seatRecord(30, 'guest-1'),
      seatRecord(31, 'guest-2'),
      seatRecord(32, 'guest-3'),
      seatRecord(33, 'guest-4'),
    ]);
    return r;
  }

  /*
    ⚠ **THE RULE IS DIRECTIONAL, and this block used to state it wrongly (`PATCH-BX-01` B).**

    It asserted that ALL FIVE maps send zero commands on a row that owns no live seats. That
    over-stated rule 10 and was a defect in its own right: rule 10's words are *"no `PLAY`, no
    un-mute and no fill"*, and a `MIXER … VOLUME 0` is none of the three. Gating the silence
    meant OFF, a fader dragged to zero and the panic button were all refused the wire on
    precisely the rows where a guest could still be AUDIBLE — each recording an intent, sending
    nothing, and answering `ok`.

    So the maps are split by DIRECTION rather than by verb name. What is unchanged, and is the
    half `B-161` is about, is that a RAISE still sends nothing.
  */
  const RAISING: [string, Record<string, number>][] = [
    ['FADER', FADER],
    ['ON', ON],
  ];
  const SILENCING: [string, Record<string, number>][] = [
    ['OFF', OFF],
    ['PANIC', PANIC],
  ];

  for (const [name, map] of RAISING) {
    it(`${name} (a RAISE) sends ZERO commands and still records the intent`, async () => {
      const r = await loadedWithSeats();
      const before = (await recvLines()).length;

      const verdict = await r.setLivePlateVolumes('item-1', map);

      expect(verdict.ok, 'the verb SUCCEEDS — it is configuration, and it landed').toBe(true);
      // 🔴 THE WHOLE ASSERTION: nothing reached the plant. Not a `PLAY`, not a `MIXER`, not
      // a fill, not an un-hold. `B-161` measured four `PLAY`s and eight `MIXER`s arriving on
      // a `loaded` row from a verb that only meant to change configuration.
      expect(await recvLines()).toHaveLength(before);
      // …and the intent is recorded, so the next take carries it. Removing this would take
      // away arming-before-the-take, which is the affordance the mute rule exists to
      // preserve.
      expect(r.livePlateVolumes('item-1')).toEqual(map);
    });
  }

  for (const [name, map] of SILENCING) {
    it(`${name} (a SILENCE) DOES reach the wire — a mute cannot put anything on air`, async () => {
      const r = await loadedWithSeats();
      const before = (await recvLines()).length;

      const verdict = await r.setLivePlateVolumes('item-1', map);

      expect(verdict.ok).toBe(true);
      const lines = await volumeLines(before);
      expect(lines.length, 'the silence is not swallowed').toBe(Object.keys(map).length);
      for (const line of lines) expect(line).toMatch(/ VOLUME 0$/);
      expect(r.livePlateVolumes('item-1')).toEqual(map);
    });
  }

  it('🔴 SOLO on such a row sends its ZEROS and withholds its ONE — the split, in one call', async () => {
    /*
      The sharpest statement of the directional rule, because SOLO carries both directions in a
      single map. The three siblings are silenced (a mute reaches a seated layer whatever the
      row's state); the raised plate is NOT (that is the half that could put a voice on air).
      Both intents are recorded either way.
    */
    const r = await loadedWithSeats();
    const before = (await recvLines()).length;

    await r.setLivePlateVolumes('item-1', SOLO);

    const lines = await volumeLines(before);
    expect(lines.filter((l) => l.endsWith(' VOLUME 0'))).toHaveLength(3);
    expect(
      lines.filter((l) => l.endsWith(' VOLUME 1')),
      'the RAISE is withheld',
    ).toEqual([]);
    expect(r.livePlateVolumes('item-1')).toEqual(SOLO);
  });

  it('🔴 the LEDGER’s as-sent volume is untouched too — a claim about a command never sent', async () => {
    // Skipping only the send would leave `intendedVolume` claiming a volume the layer never
    // received. That field is exactly what a later re-seat re-asserts, so it is the field
    // through which `B-161` would have reached air.
    const r = await loadedWithSeats();

    await r.setLivePlateVolumes('item-1', ON);

    expect(
      r
        .liveLayers()
        .get('item-1')
        ?.find((x) => x.sourceId === 'guest-1')?.intendedVolume,
    ).toBe(0);
  });

  it('🔴 the gate is `#ownsLiveSeats`, NOT the air status — a REHEARSING row still reaches its plates', async () => {
    /*
      The trap `B-161` names, on the audio axis. A rehearsing row is deliberately NOT on air
      (`enterRehearse` refuses an on-air row) and yet OWNS its plates on PVW — and rehearse is
      precisely when an operator checks a guest's level before air. A gate built on
      `isOnAirStatus` alone would have taken that away without failing any test that existed
      before.
    */
    const r = await loadedWithSeats();
    expect((await r.enterRehearse('item-1')).ok).toBe(true);
    const before = (await recvLines()).length;

    await r.setLivePlateVolumes('item-1', ON);

    expect(await volumeLines(before)).toContain('MIXER 1-30 VOLUME 1');
  });

  it('…and LEAVING rehearse closes the RAISE again, with the plates still seated', async () => {
    // `exitRehearse` does NOT tear plates down — it drops the row from `#rehearsing` and
    // restores the TEMPLATE layer's volume. The row then owns no seats, so its RAISE half is
    // gated once more; its SILENCE half never was.
    const r = await loadedWithSeats();
    await r.enterRehearse('item-1');
    await r.exitRehearse('item-1');
    expect(r.liveLayers().get('item-1'), 'the plates really are still seated').toHaveLength(4);
    const before = (await recvLines()).length;

    await r.setLivePlateVolumes('item-1', ON);

    expect(await volumeLines(before)).toEqual([]);
    expect(r.livePlateVolumes('item-1')).toEqual(ON);
  });

  it('the single-plate verb is gated by the SAME code — one gate, two doors', async () => {
    // The gate lives inside `setLivePlateVolume`, the one writer both channels share, so a
    // caller cannot get round it by choosing the other door — in EITHER direction.
    const r = await loadedWithSeats();
    const before = (await recvLines()).length;

    expect(await r.setLivePlateVolume('item-1', 'guest-1', 1)).toEqual({ ok: true, sent: false });
    expect(await recvLines()).toHaveLength(before);

    // …and the same one writer lets the SILENCE through, on the same row, in the same call
    // shape. Two doors, one gate, one direction rule.
    expect(await r.setLivePlateVolume('item-1', 'guest-1', 0)).toEqual({ ok: true, sent: true });
    expect(await volumeLines(before)).toEqual(['MIXER 1-30 VOLUME 0']);
    expect(r.livePlateVolumes('item-1')).toEqual({ 'guest-1': 0 });
  });
});

// ── THE HELD PLATE ────────────────────────────────────────────────────────────

describe('🔴 a HELD plate gets NO wire command from any verb, and keeps its intent', () => {
  /** On air, with `guest-3` and `guest-4` held — a look that punches only two holes. */
  async function onAirWithHeld(): Promise<CasparRuntime> {
    const r = await boot();
    await onAir(r);
    const records = r.liveLayers().get('item-1') ?? [];
    r.registerLiveLayers(
      'item-1',
      records.map((rec) =>
        rec.sourceId === 'guest-3' || rec.sourceId === 'guest-4' ? { ...rec, held: true } : rec,
      ),
    );
    return r;
  }

  for (const [name, map] of VERBS) {
    it(`${name} leaves the held plates silent on the wire, and records their intent`, async () => {
      const r = await onAirWithHeld();
      const heldLayers = ['guest-3', 'guest-4'].map((p) => `MIXER 1-${String(layerOf(r, p))} `);
      const before = (await recvLines()).length;

      await r.setLivePlateVolumes('item-1', map);

      const lines = await volumeLines(before);
      /*
        Asserting a raise onto a held layer would put a VOICE ON AIR from a box that is not
        on screen — and the hold's mute is a one-shot, so nothing would ever take it back
        down. The reconcile re-asserts the recorded intent at the moment it un-holds.
      */
      for (const prefix of heldLayers) {
        expect(lines.some((l) => l.startsWith(prefix))).toBe(false);
      }
      for (const [plateId, v] of Object.entries(map)) {
        expect(r.livePlateVolumes('item-1')?.[plateId]).toBe(v);
      }
    });
  }

  it('SOLO on a held plate arms it without un-holding it — the before-the-switch affordance', async () => {
    const r = await onAirWithHeld();
    const before = (await recvLines()).length;

    await r.setLivePlateVolumes('item-1', {
      'guest-3': 1,
      'guest-1': 0,
      'guest-2': 0,
      'guest-4': 0,
    });

    const lines = await volumeLines(before);
    expect(lines.some((l) => l.startsWith(`MIXER 1-${String(layerOf(r, 'guest-3'))} `))).toBe(
      false,
    );
    expect(r.livePlateVolumes('item-1')?.['guest-3']).toBe(1);
    // The row is not un-held by an audio verb: that is a LOOK's job, and nothing here
    // touches the look.
    expect(
      r
        .liveLayers()
        .get('item-1')
        ?.find((x) => x.sourceId === 'guest-3')?.held,
    ).toBe(true);
  });
});

// ── RETENTION ─────────────────────────────────────────────────────────────────

describe('every verb’s intent survives a bridge blip, through retention', () => {
  for (const [name, map] of VERBS) {
    it(`${name} comes back intact and is asserted by the next take`, async () => {
      const r = await boot();
      await onAir(r);
      await r.setLivePlateVolumes('item-1', map);
      const published = r.stackSnapshot().find((i) => i.itemId === 'item-1');
      expect(published?.plateVolumes).toEqual(map);

      // What the browser retains and hands back to a fresh bridge process.
      const retained: RetainedStackItem[] = [
        {
          itemId: 'item-1',
          templateId: 'four-box',
          fields: {},
          state: 'on-air',
          ...(published?.plateVolumes !== undefined && { plateVolumes: published.plateVolumes }),
        },
      ];
      await runtime?.stop();
      runtime = null;
      const fresh = new CasparRuntime(
        singleServer(mock?.amcpPort ?? 0, await freeUdpPort()),
        {},
        { sweepMs: 150, sourceCatalog: CATALOG, sourceAssignments: ASSIGNMENTS },
      );
      runtime = fresh;
      fresh.start();
      await fresh.startServing();
      fresh.templateImport(TEMPLATE, '<!doctype html><html><body>served</body></html>');
      await fresh.whenServerHealthy(HEALTH_MS);

      await fresh.restore(retained);

      expect(fresh.livePlateVolumes('item-1')).toEqual(map);
      // The claim that matters is not "the field came back" — it is that the next take puts
      // each plate back at the level the operator chose. A restored intent nobody asserts is
      // not a restored intent.
      await fresh.take('item-1');
      for (const [plateId, v] of Object.entries(map)) {
        expect(volumeOf(fresh, plateId)).toBe(v);
      }
    });
  }
});

// ── ZERO IS NOT ABSENT ────────────────────────────────────────────────────────

describe('🔴 `0` is a REAL authored value in every new read', () => {
  it('PANIC records an explicit 0 for every plate — never an empty map', async () => {
    // "The operator silenced this" and "nobody has said" are different states, and only one
    // of them was chosen. A PANIC that deleted keys instead of writing zeros would be
    // indistinguishable from a row nobody had touched.
    const r = await boot();
    await onAir(r);

    await r.setLivePlateVolumes('item-1', PANIC);

    const published = r.stackSnapshot().find((i) => i.itemId === 'item-1')?.plateVolumes;
    expect(published).toEqual(PANIC);
    for (const p of ['guest-1', 'guest-2', 'guest-3', 'guest-4']) {
      expect(published?.[p]).toBe(0);
      expect(published?.[p]).not.toBeUndefined();
    }
  });

  it('SOLO writes explicit zeros for siblings, never omits them', async () => {
    // An absent key means "leave this plate alone". Relying on omission to mean silence
    // would make SOLO a no-op on everything but the chosen plate.
    const r = await boot();
    await onAir(r);
    await r.setLivePlateVolumes('item-1', { 'guest-2': 1, 'guest-3': 1 });

    await r.setLivePlateVolumes('item-1', SOLO);

    expect(r.livePlateVolumes('item-1')).toEqual(SOLO);
    expect(volumeOf(r, 'guest-2')).toBe(0);
    expect(volumeOf(r, 'guest-3')).toBe(0);
  });

  it('a plate NOBODY has spoken about stays ABSENT after a one-plate verb', async () => {
    const r = await boot();
    await onAir(r);

    await r.setLivePlateVolumes('item-1', OFF);

    const published = r.stackSnapshot().find((i) => i.itemId === 'item-1')?.plateVolumes;
    expect(published?.['guest-1']).toBe(0);
    expect(published?.['guest-2'], 'never asked ≠ chosen silent').toBeUndefined();
  });
});
