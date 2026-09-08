import * as dgram from 'node:dgram';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import type {
  ConnectionConfig,
  SourceAssignments,
  SourceCatalog,
  TemplateInfo,
  TemplateLook,
} from '@cg/shared-ipc';
import { isOnAirStatus } from '@cg/shared-schema';
import type { LiveSourceRect } from '@cg/shared-schema';
import { CasparRuntime } from '../src/caspar-runtime.js';
import { awaitChannelModeRead, HEALTH_MS } from './support/harness.js';

/**
 * `RUNTIME-REDESIGN-01` §6 — 🔴 **CHANGING AUDIO MUST NOT PUT A READY ROW ON AIR**, and
 * 🔴 **SOLO IS SCOPED TO THE OWNING ROW — hidden frames included, nothing outside it.**
 *
 * The air-safety assertion of the phase, stated at the WIRE before the audio surfaces were
 * touched (golden rule 10, `B-161` on the audio axis): a plate's volume is a CONFIGURATION
 * statement — how loud this plate SHOULD be — and only a TAKE puts content on air. For a row
 * that owns no live seats (never taken, or taken off by the operator's own verb) a raise, a
 * fader move and a SOLO map must put no `PLAY`, no `MIXER … VOLUME` and no `MIXER … FILL` /
 * `CLIP` on the AMCP wire and must leave the ledger empty. Asserted on the mock's AMCP trace,
 * never on what a UI shows.
 *
 * ── HOW IT WAS TAKEN RED ────────────────────────────────────────────────────────
 *
 * The defect this guards is one seat-write wide: an audio verb that SEATS the plates it
 * addresses so the volume has a layer to land on (`setLivePlateVolume`'s own header names it —
 * *"a plate raised on a row that owns no live seats would be seated AUDIBLE by whatever seated
 * it next"*). Planted as a `reconcileLivePlates(itemId, { mode: 'take' })` ahead of the gate in
 * `setLivePlateVolume` for a row with no ledger record, the three ready-row cases below went
 * RED with `PLAY`s and `MIXER … VOLUME` on the wire and seats in the ledger; the positive
 * control and the SOLO-scope case stayed green. Restored, 6 / 6 (`design.md` §13.5).
 *
 * ── THE POSITIVE CONTROL ────────────────────────────────────────────────────────
 *
 * "Nothing reached the wire" is void until the instrument is proven live: the same raise on the
 * same row while it IS on air must put a `MIXER … VOLUME 1` on the wire.
 *
 * ── SOLO'S SCOPE NAMES THE OWNING ROW ───────────────────────────────────────────
 *
 * Two rows on air, every plate raised. A SOLO map for ONE row's plate silences that row's other
 * plates — including the one its active look HIDES — and touches nothing on the other row: the
 * other row's layers see no `MIXER … VOLUME` and keep their intent at 1. A test that silenced
 * everything would pass a "does SOLO silence?" check and fail this one, which is the point.
 */

let mock: MockHandle | null = null;
let oscPort = 0;
let runtime: CasparRuntime | null = null;
let tracePath: string | null = null;

const BAND = { start: 30, end: 39 };
const SCENE = { width: 1920, height: 1080 };
const CENTRED = { anchor: 'center' as const, offset: { x: 0, y: 0 } };
const BOX: Record<string, LiveSourceRect> = {
  'live-1': { x: 0, y: 0, width: 480, height: 270 },
  'live-2': { x: 480, y: 0, width: 480, height: 270 },
  'live-3': { x: 960, y: 0, width: 480, height: 270 },
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

function look(id: string, rects: Record<string, LiveSourceRect>): TemplateLook {
  return { id, name: id, entered: { mode: 'cut' }, rects };
}

/**
 * Three plates; the DEFAULT look shows two of them, so `live-3` is a HIDDEN frame — seated by
 * the union pre-seat, held, and exactly the plate a SOLO must still silence.
 */
const TEMPLATE: TemplateInfo = {
  templateId: 'debate',
  templateType: 'debate',
  fields: [{ id: 'title', label: 'Title', type: 'text', required: false, default: '' }],
  liveSources: {
    resolution: SCENE,
    defaultPosition: CENTRED,
    sources: ['live-1', 'live-2', 'live-3'].map((k) => ({
      elementId: `el-${k}`,
      sourceId: k,
      rect: BOX[k] as LiveSourceRect,
      dynamic: false,
    })),
    looks: [
      look('three', BOX),
      look('two', {
        'live-1': BOX['live-1'] as LiveSourceRect,
        'live-2': BOX['live-2'] as LiveSourceRect,
      }),
    ],
    defaultLookId: 'two',
  },
};

const CATALOG: SourceCatalog = {
  sources: [1, 2, 3].map((i) => ({
    id: `src-${String(i)}`,
    name: `Feed ${String(i)}`,
    format: '1080i5000' as const,
    producer: { kind: 'route' as const, channel: i + 1 },
  })),
  layerRange: BAND,
};

const ASSIGNMENTS: SourceAssignments = {
  assignments: [
    { templateId: 'debate', plateId: 'live-1', sourceId: 'src-1' },
    { templateId: 'debate', plateId: 'live-2', sourceId: 'src-2' },
    { templateId: 'debate', plateId: 'live-3', sourceId: 'src-3' },
  ],
};

async function boot(): Promise<CasparRuntime> {
  oscPort = await freeUdpPort();
  tracePath = path.join(
    os.tmpdir(),
    `cg-audio-does-not-take-${String(process.pid)}-${String(Date.now())}-${String(Math.round(performance.now() * 1000))}.ndjson`,
  );
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 30, tracePath });
  const r = new CasparRuntime(
    singleServer(mock.amcpPort, oscPort),
    {},
    { sweepMs: 150, lookMixerHoldMs: 0, sourceCatalog: CATALOG, sourceAssignments: ASSIGNMENTS },
  );
  r.start();
  await r.startServing();
  r.templateImport(TEMPLATE, '<!doctype html><html></html>');
  await r.whenServerHealthy(HEALTH_MS);
  // A "nothing reached the wire" assertion is valid only from a PROVEN-QUIESCENT wire —
  // R-030's one-shot `INFO` must have landed first (flake family 3, support/harness.ts).
  await awaitChannelModeRead(r);
  /*
    ⚠ And R-022's boot re-assert (`#reassertDeclaredVolumes`) sends real traffic 140–160 ms
    after HEALTHY on every boot — one-shot per process, and with zero declared rows it sends
    nothing, but the wait costs nothing and makes the baseline honest rather than lucky.
  */
  await new Promise((resolve) => setTimeout(resolve, 250));
  runtime = r;
  return r;
}

/** Lines this action put on the wire, from a baseline taken before it. */
async function since(before: number): Promise<string[]> {
  return (await recvLines()).slice(before);
}

const layerSet = (r: CasparRuntime, itemId: string): number[] =>
  (r.liveLayers().get(itemId) ?? []).map((rec) => rec.slot.layer).sort((a, b) => a - b);

const layerOf = (r: CasparRuntime, itemId: string, plateId: string): number =>
  (r.liveLayers().get(itemId) ?? []).find((rec) => rec.sourceId === plateId)?.slot.layer ?? -1;

/** The commands that can put a picture or a voice on air, plus the ledger — `B-161`'s reading. */
const reaching = (lines: readonly string[], r: CasparRuntime, itemId = 'item-1') => ({
  plays: lines.filter((l) => l.startsWith('PLAY 1-')),
  volumes: lines.filter((l) => /^MIXER 1-\d+ VOLUME/.test(l)),
  fits: lines.filter((l) => /^MIXER 1-\d+ (FILL|CLIP)/.test(l)),
  seats: layerSet(r, itemId),
});
const NOTHING = { plays: [], volumes: [], fits: [], seats: [] };

const item = (r: CasparRuntime, itemId = 'item-1') =>
  r.stackSnapshot().find((i) => i.itemId === itemId);

async function settledOffAir(r: CasparRuntime, itemId = 'item-1'): Promise<void> {
  await vi.waitFor(
    () => {
      const it = item(r, itemId);
      if (it === undefined) throw new Error(`${itemId} left the stack`);
      if (isOnAirStatus(it)) throw new Error(`${itemId} still reads ${it.status}`);
    },
    { timeout: 5_000, interval: 25 },
  );
}

/** The SOLO map exactly as the renderer builds it (`plateAudio.ts` `soloMap`): raised first. */
function soloMap(plates: readonly string[], plateId: string): Record<string, number> {
  const map: Record<string, number> = { [plateId]: 1 };
  for (const id of plates) if (id !== plateId) map[id] = 0;
  return map;
}

describe('RUNTIME-REDESIGN-01 §6 — changing audio does not put a ready row on air', () => {
  it('🔴 a LOADED, never-taken row: ON (100 %) reaches no layer, and the intent is recorded for the take', async () => {
    const r = await boot();
    await r.load('item-1', 'debate', { title: 'ready' });
    expect(layerSet(r, 'item-1'), 'a loaded row seats nothing').toEqual([]);

    const before = (await recvLines()).length;
    const res = await r.setLivePlateVolume('item-1', 'live-1', 1);
    expect(res.ok, 'the configuration change is accepted').toBe(true);
    expect(res.sent, 'and the writer says it did not reach the wire').toBe(false);
    expect(reaching(await since(before), r)).toEqual(NOTHING);
    // …and it LANDED: the intent is in force for the next take.
    expect(r.livePlateVolumes('item-1')).toEqual({ 'live-1': 1 });
    expect(item(r)?.status).toBe('loaded');
  });

  it('🔴 a LOADED, never-taken row: a SOLO map (raise one, silence the rest) reaches no layer', async () => {
    const r = await boot();
    await r.load('item-1', 'debate', { title: 'ready' });

    const before = (await recvLines()).length;
    const res = await r.setLivePlateVolumes(
      'item-1',
      soloMap(['live-1', 'live-2', 'live-3'], 'live-2'),
    );
    expect(res.ok).toBe(true);
    expect(reaching(await since(before), r)).toEqual(NOTHING);
    expect(r.livePlateVolumes('item-1')).toEqual({ 'live-1': 0, 'live-2': 1, 'live-3': 0 });
    expect(item(r)?.status).toBe('loaded');
  });

  it('🔴 TAKE, then OUT, settled off air, then ON: nothing reaches the wire, and the next TAKE seats the plate AUDIBLE', async () => {
    const r = await boot();
    await r.load('item-1', 'debate', { title: 'ready' });
    expect((await r.take('item-1')).accepted).toBe(true);
    expect(layerSet(r, 'item-1').length, 'the take pre-seats the plates').toBeGreaterThan(0);

    expect((await r.out('item-1')).accepted).toBe(true);
    await settledOffAir(r);
    expect(layerSet(r, 'item-1'), 'OUT releases every seat').toEqual([]);

    const before = (await recvLines()).length;
    const res = await r.setLivePlateVolume('item-1', 'live-1', 1);
    expect(res.ok).toBe(true);
    expect(res.sent).toBe(false);
    expect(reaching(await since(before), r), 'ON after OUT').toEqual(NOTHING);

    // The other half of rule 10: the intent is NOT lost, and the TAKE is what carries it.
    const beforeTake = (await recvLines()).length;
    expect((await r.take('item-1')).accepted).toBe(true);
    const took = await since(beforeTake);
    const layer = layerOf(r, 'item-1', 'live-1');
    expect(layer).toBeGreaterThan(0);
    // Inside the take's batch the line reads `MIXER 1-N VOLUME 1 DEFER` — the seat's volume,
    // deferred to the batch's COMMIT (the mixer's channel-wide contract, untouched here).
    expect(
      took.some((l) => l.startsWith(`MIXER 1-${String(layer)} VOLUME 1`)),
      'the next take seats live-1 at the volume the off-air ON recorded',
    ).toBe(true);
  });

  it('POSITIVE CONTROL — the same ON on the same row while it IS on air puts a MIXER VOLUME on the wire', async () => {
    const r = await boot();
    await r.load('item-1', 'debate', { title: 'ready' });
    expect((await r.take('item-1')).accepted).toBe(true);
    const layer = layerOf(r, 'item-1', 'live-1');
    expect(layer).toBeGreaterThan(0);

    const before = (await recvLines()).length;
    const res = await r.setLivePlateVolume('item-1', 'live-1', 1);
    expect(res.ok).toBe(true);
    expect(res.sent).toBe(true);
    const moved = reaching(await since(before), r);
    expect(moved.volumes).toEqual([`MIXER 1-${String(layer)} VOLUME 1`]);
    // A raise is not a re-seat: no PLAY, no fill — the picture was already there.
    expect(moved.plays).toEqual([]);
    expect(moved.fits).toEqual([]);
  });
});

describe('RUNTIME-REDESIGN-01 §6 — SOLO is scoped to the OWNING row, hidden frames included', () => {
  /**
   * 🔴 The test NAMES the owning row: SOLO on `item-1`'s `live-1` silences `item-1`'s other
   * frames — the shown `live-2` on the wire, the HIDDEN `live-3` in the record — and leaves
   * `item-2`'s plates untouched on the wire and in the intent map.
   */
  it('🔴 SOLO on item-1 silences item-1’s shown AND hidden frames and nothing on item-2', async () => {
    const r = await boot();
    await r.load('item-1', 'debate', { title: 'one' });
    await r.load('item-2', 'debate', { title: 'two' });
    expect((await r.take('item-1')).accepted).toBe(true);
    /*
      ⚠ The bridge allows ONE multibox carrier on air at a time, so the second row cannot hold
      seats beside the first — asserted rather than assumed, because it is the reason item-2
      is a READY row here (intents recorded, nothing seated) and not a second on-air row. Its
      recorded intents are what SOLO must leave alone; its EMPTY ledger is what a SOLO that
      reached across rows would have had to seat.
    */
    expect(await r.take('item-2')).toMatchObject({
      accepted: false,
      errorCode: 'multibox-already-on-air',
    });

    // Every plate on both rows raised, so a silence anywhere is attributable.
    for (const itemId of ['item-1', 'item-2']) {
      const res = await r.setLivePlateVolumes(itemId, { 'live-1': 1, 'live-2': 1, 'live-3': 1 });
      expect(res.ok, `${itemId} raised`).toBe(true);
    }
    // `live-3` is not in the default look, so it is seated and HELD — the hidden frame.
    const held = (r.liveLayers().get('item-1') ?? []).find((rec) => rec.sourceId === 'live-3');
    expect(held?.held, 'live-3 is the hidden frame of item-1').toBe(true);

    const ownLayers = new Set(layerSet(r, 'item-1'));
    expect(ownLayers.size).toBe(3);
    expect(layerSet(r, 'item-2'), 'item-2 owns nothing on the channel').toEqual([]);

    const before = (await recvLines()).length;
    const res = await r.setLivePlateVolumes(
      'item-1',
      soloMap(['live-1', 'live-2', 'live-3'], 'live-1'),
    );
    expect(res.ok).toBe(true);

    const lines = await since(before);
    const volumes = lines.filter((l) => /^MIXER 1-\d+ VOLUME/.test(l));
    const touched = volumes.map((l) => Number(/^MIXER 1-(\d+) VOLUME/.exec(l)?.[1]));
    // Every MIXER VOLUME landed on a layer item-1 owns — not the html layer, not anything else.
    expect(touched.length).toBeGreaterThan(0);
    for (const layer of touched) {
      expect(ownLayers.has(layer), `layer ${String(layer)} is item-1's`).toBe(true);
    }
    // …and SOLO seated nothing, anywhere: no PLAY, and item-2 still owns nothing.
    expect(lines.filter((l) => l.startsWith('PLAY 1-'))).toEqual([]);
    expect(layerSet(r, 'item-2')).toEqual([]);

    // The shown sibling went to 0 on the wire; the raised plate stayed at 1.
    expect(volumes).toContain(`MIXER 1-${String(layerOf(r, 'item-1', 'live-2'))} VOLUME 0`);
    expect(volumes).toContain(`MIXER 1-${String(layerOf(r, 'item-1', 'live-1'))} VOLUME 1`);
    // The HIDDEN frame is silenced in the RECORD only (held: no wire, by §12.4's own rule) —
    // and it IS silenced: a SOLO scoped to the visible look would have left it armed.
    expect(
      volumes.some((l) => l.startsWith(`MIXER 1-${String(layerOf(r, 'item-1', 'live-3'))} `)),
    ).toBe(false);
    expect(r.livePlateVolumes('item-1')).toEqual({ 'live-1': 1, 'live-2': 0, 'live-3': 0 });
    // item-2 — the row SOLO does not own — is exactly as it was.
    expect(r.livePlateVolumes('item-2')).toEqual({ 'live-1': 1, 'live-2': 1, 'live-3': 1 });
  });
});
