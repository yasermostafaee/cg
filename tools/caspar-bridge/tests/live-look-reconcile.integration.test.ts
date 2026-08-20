import * as dgram from 'node:dgram';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import type {
  ConnectionConfig,
  SourceAssignments,
  SourceCatalog,
  TemplateInfo,
  TemplateLook,
} from '@cg/shared-ipc';
import type { LiveSourceRect } from '@cg/shared-schema';
import { CasparRuntime } from '../src/caspar-runtime.js';
import { awaitChannelModeRead, HEALTH_MS } from './support/harness.js';

/**
 * `multibox-layout-switch` `design.md` §4 / `tasks.md` 6.1–6.6 (LOOKS phase 3) — **THE ONE
 * RECONCILE: a look switch moves the live sources on air.**
 *
 * The unit under test is `reconcileLivePlates` and the two doors that reach it
 * (`setActiveLook`, `swapLiveSource`) plus the take that shares its halves. Every assertion
 * is on the AMCP wire, from the mock's NDJSON trace, for the reason `live-seating`'s header
 * already gives: the failure this machinery exists to prevent is invisible to state-only
 * assertions, because every internal structure can be correct while nothing reaches
 * CasparCG.
 *
 * ── 🔴 WHAT THESE TESTS CANNOT PROVE, STATED UP FRONT ────────────────────────────
 *
 * **The SDI seam on the plant.** No unit test can photograph what a switch looks like on
 * air. What is proven here is the COMMAND SEQUENCE — that a plain switch issues no `PLAY`,
 * that `MIXER FILL`/`CLIP` are re-derived per look, that held producers stay seated and
 * muted, that the layer set does not move — and the claim that those commands produce a
 * clean cut on a 2.3.2 server remains a plant measurement, not a result.
 *
 * **The PAGE's half of the switch.** A look switch is two mutations on two machines: the
 * bridge moves the producers' geometry (here) and the page flips which look's instance is
 * visible and re-punches its holes (`@cg/template-runtime`'s `setActiveLook`). There is no
 * transport between them yet — see `CasparRuntime.setActiveLook`'s note — so nothing in
 * this file asserts a punched hole. The bridge's own half of the mask IS asserted: `MIXER
 * … CLIP` is the layer's mask, emitted from the same geometry as `FILL`, and every switch
 * test below asserts BOTH where the plate is SEATED (its layer, and whether a `PLAY` was
 * issued) and where its MASK is (the `CLIP` rect) — the two axes `tasks.md` 3.3 requires,
 * in the vocabulary the bridge actually speaks.
 */

let mock: MockHandle | null = null;
let runtime: CasparRuntime | null = null;
let tracePath: string | null = null;

/** Six declared sources need six layers; the template's own layer is elsewhere. */
const BAND = { start: 30, end: 35 };
const SCENE = { width: 1920, height: 1080 };
const CENTRED = { anchor: 'center' as const, offset: { x: 0, y: 0 } };

/**
 * The 6-box debate grid — 3 columns × 2 rows of 480×270, parked in the top-left so the
 * axis looks below have somewhere to move a box TO without leaving the frame.
 */
const GRID: Record<string, LiveSourceRect> = {
  'live-1': { x: 0, y: 0, width: 480, height: 270 },
  'live-2': { x: 480, y: 0, width: 480, height: 270 },
  'live-3': { x: 960, y: 0, width: 480, height: 270 },
  'live-4': { x: 0, y: 270, width: 480, height: 270 },
  'live-5': { x: 480, y: 270, width: 480, height: 270 },
  'live-6': { x: 960, y: 270, width: 480, height: 270 },
};
const ROUTE_KEYS = Object.keys(GRID);

/** Solo: one source, full frame. The other five have NO entry — §12.4's release trigger. */
const SOLO: Record<string, LiveSourceRect> = {
  'live-1': { x: 0, y: 0, width: 1920, height: 1080 },
};

/** POSITION-ONLY: `live-1` moves, keeping 480×270 exactly. */
const MOVED: Record<string, LiveSourceRect> = {
  ...GRID,
  'live-1': { x: 0, y: 540, width: 480, height: 270 },
};

/**
 * SIZE-ONLY: `live-1` keeps its (0,0) origin and becomes SQUARE.
 *
 * Square on purpose: a 16:9 source in a 1:1 hole is the case where crop-to-fill actually
 * crops, so this look also proves 6.4's fit is re-derived rather than carried over — the
 * failure that does not announce itself, because `MIXER FILL` survives and the picture
 * looks fine while being wrongly cropped.
 */
const RESIZED: Record<string, LiveSourceRect> = {
  ...GRID,
  'live-1': { x: 0, y: 0, width: 540, height: 540 },
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
 * The multi-frame group as the bridge sees it: sources declared ONCE, looks referencing
 * them. `sources[].rect` is the source's rect in the DEFAULT look, which is what
 * `collectLookCarrier` emits and what a bridge that has not learned looks would seat.
 */
function sixBoxTemplate(over: { looks?: TemplateLook[]; sources?: readonly string[] } = {}) {
  const keys = over.sources ?? ROUTE_KEYS;
  return {
    templateId: 'debate',
    templateType: 'debate',
    fields: [],
    liveSources: {
      resolution: SCENE,
      defaultPosition: CENTRED,
      sources: keys.map((k) => ({
        elementId: `el-${k}`,
        sourceId: k,
        rect: GRID[k] as LiveSourceRect,
        dynamic: false,
      })),
      looks: over.looks ?? [
        look('six', GRID),
        look('solo', SOLO),
        look('moved', MOVED),
        look('resized', RESIZED),
        look('empty', {}),
      ],
      defaultLookId: 'six',
    },
  } satisfies TemplateInfo;
}

function catalog(over: Partial<SourceCatalog> = {}): SourceCatalog {
  return {
    sources: [
      ...ROUTE_KEYS.map((k, i) => ({
        id: `src-${String(i + 1)}`,
        name: `Feed ${String(i + 1)}`,
        format: '1080i5000',
        producer: { kind: 'route' as const, channel: i + 2 },
      })),
      // A CLIP — the one producer form that cannot be held idle (§12.4's named fallback).
      {
        id: 'src-clip',
        name: 'Sting',
        format: '1080i5000',
        producer: { kind: 'media' as const, file: 'sting.mov' },
      },
      // A 4:3 feed, so a swap changes the CROP visibly.
      {
        id: 'src-sd',
        name: 'Archive',
        format: 'PAL',
        producer: { kind: 'route' as const, channel: 9 },
      },
      // A producer form the mock REFUSES (an announced scheme it does not know), so a
      // seating failure can be provoked deterministically rather than by tearing down a
      // socket mid-test.
      {
        id: 'src-bad',
        name: 'Broken',
        format: '1080i5000',
        producer: { kind: 'media' as const, file: 'bogus://clip.mov' },
      },
    ],
    layerRange: BAND,
    ...over,
  };
}

function assign(pairs: readonly (readonly [string, string])[]): SourceAssignments {
  return {
    assignments: pairs.map(([plateId, sourceId]) => ({ templateId: 'debate', plateId, sourceId })),
  };
}

const DEFAULT_ASSIGNMENTS = assign(ROUTE_KEYS.map((k, i) => [k, `src-${String(i + 1)}`] as const));

async function boot(options: { template?: TemplateInfo; assignments?: SourceAssignments } = {}) {
  const oscPort = await freeUdpPort();
  tracePath = path.join(
    os.tmpdir(),
    `cg-looks-${String(process.pid)}-${String(Date.now())}-${String(Math.round(performance.now() * 1000))}.ndjson`,
  );
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 30, tracePath });
  const r = new CasparRuntime(
    singleServer(mock.amcpPort, oscPort),
    {},
    {
      sweepMs: 150,
      sourceCatalog: catalog(),
      sourceAssignments: options.assignments ?? DEFAULT_ASSIGNMENTS,
    },
  );
  runtime = r;
  r.start();
  await r.startServing();
  r.templateImport(options.template ?? sixBoxTemplate(), '<!doctype html><html></html>');
  await r.whenServerHealthy(HEALTH_MS);
  // Every "nothing reached the wire" assertion below baselines the trace, which is valid
  // only from a PROVEN-QUIESCENT wire — R-030's timer-driven one-shot `INFO` has to have
  // landed first (flake family 3, support/harness.ts). Not optional, and not filterable:
  // filtering would make the baseline pass vacuously if the read ever stopped happening.
  await awaitChannelModeRead(r);
  return r;
}

/** On air on the DEFAULT look — six producers seated on 30…35. */
async function onAir(r: CasparRuntime, itemId = 'item-1'): Promise<void> {
  await r.load(itemId, 'debate', {});
  expect((await r.take(itemId)).accepted).toBe(true);
}

const layerOf = (r: CasparRuntime, plateId: string, itemId = 'item-1'): number =>
  (r.liveLayers().get(itemId) ?? []).find((rec) => rec.sourceId === plateId)?.slot.layer ?? -1;

const recordOf = (r: CasparRuntime, plateId: string, itemId = 'item-1') =>
  (r.liveLayers().get(itemId) ?? []).find((rec) => rec.sourceId === plateId);

const layerSet = (r: CasparRuntime, itemId = 'item-1'): number[] =>
  (r.liveLayers().get(itemId) ?? []).map((rec) => rec.slot.layer).sort((a, b) => a - b);

/** Lines this action put on the wire, from a baseline taken before it. */
async function since(before: number): Promise<string[]> {
  return (await recvLines()).slice(before);
}

const playsIn = (lines: readonly string[]): string[] =>
  lines.filter((l) => l.startsWith('PLAY 1-'));
const clearsIn = (lines: readonly string[]): string[] =>
  lines.filter((l) => l.startsWith('CLEAR 1-') || /^MIXER 1-\d+ CLEAR/.test(l));

// ───────────────────────────── THE 6-BOX FIXTURE (3.2) ─────────────────────────────

it('the 6-box default look seats SIX band layers, one producer each', async () => {
  const r = await boot();
  const before = (await recvLines()).length;

  await onAir(r);

  const lines = await since(before);
  expect(layerSet(r)).toEqual([30, 31, 32, 33, 34, 35]);
  expect(playsIn(lines)).toHaveLength(6);
  // Each source on its own layer, and the ROUTE resolved through the mapping.
  for (const [i, key] of ROUTE_KEYS.entries()) {
    const layer = layerOf(r, key);
    expect(layer, `${key} must be seated`).toBe(BAND.start + i);
    expect(lines.some((l) => l === `PLAY 1-${String(layer)} "route://${String(i + 2)}"`)).toBe(
      true,
    );
    // Every bridge-created producer is born MUTED (6.5), and none of them is held.
    expect(recordOf(r, key)?.held ?? false).toBe(false);
  }
});

it('🔴 switching to a SOLO look RE-SEATS NOTHING — five plates HELD, one re-fitted', async () => {
  const r = await boot();
  await onAir(r);
  const seatedBefore = layerSet(r);
  const soloLayer = layerOf(r, 'live-1');
  const before = (await recvLines()).length;

  expect(await r.setActiveLook('item-1', 'solo')).toEqual({ ok: true });

  const lines = await since(before);
  // 🔴 THE ASSERTION THIS WHOLE PHASE EXISTS FOR. A `PLAY` is a fresh producer, and on the
  // plant a route re-acquires visibly — a switch that re-seated would be the re-acquire
  // §12.4 chose "held" to avoid.
  expect(playsIn(lines), 'a plain look switch must issue NO re-seat').toEqual([]);
  // …and nothing is destroyed either: a held plate keeps its producer.
  expect(clearsIn(lines), 'a held plate is not torn down').toEqual([]);

  // AXIS 1 — WHERE THE PLATES ARE SEATED: unchanged, all six, same layers.
  expect(layerSet(r)).toEqual(seatedBefore);
  expect(r.liveLayers().get('item-1') ?? []).toHaveLength(6);

  // AXIS 2 — WHERE THE MASKS ARE: only `live-1` has one, and it is the full frame.
  const clip = mock?.layerState({ channel: 1, layer: soloLayer })?.clip;
  expect(clip).toEqual({ x: 0, y: 0, width: 1, height: 1 });
  expect(lines.some((l) => l.startsWith(`MIXER 1-${String(soloLayer)} FILL `))).toBe(true);
  expect(lines.some((l) => l.startsWith(`MIXER 1-${String(soloLayer)} CLIP `))).toBe(true);

  // The other five: STILL SEATED, muted, and marked held — seat and punch are separate.
  for (const key of ROUTE_KEYS.slice(1)) {
    const layer = layerOf(r, key);
    expect(layer, `${key} must still own its layer`).toBeGreaterThanOrEqual(BAND.start);
    expect(recordOf(r, key)?.held, `${key} must be HELD`).toBe(true);
    expect(lines).toContain(`MIXER 1-${String(layer)} VOLUME 0`);
    expect(mock?.layerState({ channel: 1, layer })?.volume).toBe(0);
  }
});

it('🔴 switching BACK re-punches and re-fits, and still re-seats no producer', async () => {
  const r = await boot();
  await onAir(r);
  const seatedBefore = layerSet(r);
  const gridClips = new Map(
    ROUTE_KEYS.map((k) => [k, mock?.layerState({ channel: 1, layer: layerOf(r, k) })?.clip]),
  );
  await r.setActiveLook('item-1', 'solo');
  const before = (await recvLines()).length;

  expect(await r.setActiveLook('item-1', 'six')).toEqual({ ok: true });

  const lines = await since(before);
  expect(playsIn(lines), 'coming back from a look must not re-seat either').toEqual([]);
  expect(clearsIn(lines)).toEqual([]);
  // The layer allocation is the same set it was before the round trip.
  expect(layerSet(r)).toEqual(seatedBefore);
  for (const key of ROUTE_KEYS) {
    const layer = layerOf(r, key);
    // Un-held, re-fitted to the grid, and audible again at its recorded intent.
    expect(recordOf(r, key)?.held ?? false, `${key} must no longer be held`).toBe(false);
    expect(mock?.layerState({ channel: 1, layer })?.clip).toEqual(gridClips.get(key));
  }
});

// ───────────────────────── AXES DISCIPLINE (3.3) ─────────────────────────

it('AXIS position-only — the mask MOVES and does not resize; the seat does not move', async () => {
  const r = await boot();
  await onAir(r);
  const layer = layerOf(r, 'live-1');
  const beforeClip = mock?.layerState({ channel: 1, layer })?.clip;
  const beforeFill = mock?.layerState({ channel: 1, layer })?.fill;
  const before = (await recvLines()).length;

  expect(await r.setActiveLook('item-1', 'moved')).toEqual({ ok: true });

  const lines = await since(before);
  expect(playsIn(lines)).toEqual([]);
  expect(layerOf(r, 'live-1'), 'the seat is not an axis a look may move').toBe(layer);
  const clip = mock?.layerState({ channel: 1, layer })?.clip;
  const fill = mock?.layerState({ channel: 1, layer })?.fill;
  // POSITION changed…
  expect(clip?.y).not.toBe(beforeClip?.y);
  expect(clip?.y).toBeCloseTo(540 / 1080, 10);
  // …and SIZE did not, on either rect. A fit re-derived from the wrong rect would move
  // both, and a fit not re-derived at all would move neither.
  expect(clip?.width).toBe(beforeClip?.width);
  expect(clip?.height).toBe(beforeClip?.height);
  expect(fill?.width).toBe(beforeFill?.width);
  expect(fill?.height).toBe(beforeFill?.height);
  // The five boxes the look did NOT move are not re-fitted at all.
  for (const key of ROUTE_KEYS.slice(1)) {
    expect(lines.some((l) => l.includes(`1-${String(layerOf(r, key))} `))).toBe(false);
  }
});

it('AXIS size-only — the mask RESIZES in place, and the FILL takes a real crop', async () => {
  const r = await boot();
  await onAir(r);
  const layer = layerOf(r, 'live-1');
  const beforeClip = mock?.layerState({ channel: 1, layer })?.clip;
  const before = (await recvLines()).length;

  expect(await r.setActiveLook('item-1', 'resized')).toEqual({ ok: true });

  expect(playsIn(await since(before))).toEqual([]);
  expect(layerOf(r, 'live-1')).toBe(layer);
  const clip = mock?.layerState({ channel: 1, layer })?.clip;
  const fill = mock?.layerState({ channel: 1, layer })?.fill;
  // SIZE changed, POSITION did not.
  expect(clip?.x).toBe(beforeClip?.x);
  expect(clip?.y).toBe(beforeClip?.y);
  expect(clip?.width).not.toBe(beforeClip?.width);
  expect(clip?.width).toBeCloseTo(540 / 1920, 10);
  expect(clip?.height).toBeCloseTo(540 / 1080, 10);
  /*
    🔴 6.4 — THE CROP, WHICH IS THE FAILURE THAT DOES NOT ANNOUNCE ITSELF. A 16:9 feed in
    a 1:1 hole must be oversized on the WIDTH axis and centred, so the fill is wider than
    its mask and starts LEFT of it. A fit carried over from the previous look would leave a
    perfectly-rendering picture that is simply cropped wrong, and `MIXER FILL` survives a
    producer swap, so nothing downstream would ever correct it.
  */
  expect(fill?.width).toBeGreaterThan(clip?.width ?? 0);
  expect(fill?.x).toBeLessThan(clip?.x ?? 0);
  expect(fill?.height).toBeCloseTo(540 / 1080, 10);
});

it('AXIS both — position AND size move together, still with no re-seat', async () => {
  const r = await boot();
  await onAir(r);
  const layer = layerOf(r, 'live-1');
  const beforeClip = mock?.layerState({ channel: 1, layer })?.clip;
  const before = (await recvLines()).length;

  await r.setActiveLook('item-1', 'solo');

  expect(playsIn(await since(before))).toEqual([]);
  const clip = mock?.layerState({ channel: 1, layer })?.clip;
  expect(clip?.x).not.toBe(beforeClip?.x === 0 ? undefined : beforeClip?.x);
  expect(clip).toEqual({ x: 0, y: 0, width: 1, height: 1 });
  expect(beforeClip?.width).not.toBe(1);
  expect(layerOf(r, 'live-1'), 'the seat never moves on a switch').toBe(layer);
});

// ──────────────── §4's AUDIT TABLE — ONE ASSERTED INVERSE PER ROW (3.1) ────────────────

it('INVERSE 1/4 — the plate SET: a look RELEASES a plate, without out/stop/remove', async () => {
  const r = await boot();
  await onAir(r);
  expect((r.liveLayers().get('item-1') ?? []).filter((x) => x.held === true)).toHaveLength(0);

  await r.setActiveLook('item-1', 'empty');

  // The forward was "seat, take only"; the inverse is now per-plate and driven by the
  // desired set — the row is still on air and nothing was stopped, out or removed.
  const held = (r.liveLayers().get('item-1') ?? []).filter((x) => x.held === true);
  expect(held).toHaveLength(6);
  // …and the ledger still names every coordinate, so teardown reaches all of them.
  expect(layerSet(r)).toEqual([30, 31, 32, 33, 34, 35]);
  const before = (await recvLines()).length;
  await r.out('item-1');
  const lines = await since(before);
  for (const layer of [30, 31, 32, 33, 34, 35]) {
    expect(lines).toContain(`CLEAR 1-${String(layer)}`);
  }
  expect(r.liveLayers().has('item-1')).toBe(false);
});

it('INVERSE 2/4 — the MASK: a switch REPLACES the layer mask, it is not write-once', async () => {
  const r = await boot();
  await onAir(r);
  const layer = layerOf(r, 'live-1');
  const first = mock?.layerState({ channel: 1, layer })?.clip;
  expect(first).toEqual({ x: 0, y: 0, width: 480 / 1920, height: 270 / 1080 });

  await r.setActiveLook('item-1', 'solo');
  expect(mock?.layerState({ channel: 1, layer })?.clip).toEqual({
    x: 0,
    y: 0,
    width: 1,
    height: 1,
  });
  await r.setActiveLook('item-1', 'six');

  // Back to the first mask exactly — the inverse is total, not approximate.
  expect(mock?.layerState({ channel: 1, layer })?.clip).toEqual(first);
});

it('INVERSE 3/4 — the FIT: re-derived per look, and CLEARED on teardown', async () => {
  const r = await boot();
  await onAir(r);
  const layer = layerOf(r, 'live-1');
  const gridFill = mock?.layerState({ channel: 1, layer })?.fill;

  await r.setActiveLook('item-1', 'resized');
  expect(mock?.layerState({ channel: 1, layer })?.fill).not.toEqual(gridFill);

  const before = (await recvLines()).length;
  await r.out('item-1');
  // `MIXER … CLEAR` is the fit's real inverse and it is not optional: mixer geometry
  // OUTLIVES the producer, so a layer cleared without it hands the next tenant this
  // template's crop.
  expect(await since(before)).toContain(`MIXER 1-${String(layer)} CLEAR`);
});

it('INVERSE 4/4 — the LAYER allocation: a switch frees nothing, teardown frees everything', async () => {
  const r = await boot();
  await onAir(r);
  const allocated = layerSet(r);

  await r.setActiveLook('item-1', 'solo');
  await r.setActiveLook('item-1', 'empty');
  await r.setActiveLook('item-1', 'six');

  // Held plates KEEP their layers — that is what makes the return a cut, and it is why a
  // band must be wide enough for every DECLARED source rather than for the largest look.
  expect(layerSet(r)).toEqual(allocated);
  await r.out('item-1');
  expect(r.liveLayers().has('item-1')).toBe(false);
});

// ─────────────────── THE RELEASE POLICY AND ITS NAMED FALLBACK (2.5) ───────────────────

it('§12.4 — a HOLD is announced with its reason, and holds only what can be held', async () => {
  const r = await boot();
  await onAir(r);
  const seen: { plateId: string; disposition: string; reason: string }[] = [];
  r.livePlateReleased.subscribe((e) => seen.push(e));

  await r.setActiveLook('item-1', 'solo');

  expect(seen).toHaveLength(5);
  for (const e of seen) {
    expect(e.disposition).toBe('held');
    expect(e.reason).toContain('no rect in the active look');
  }
});

it('🔴 §12.4 fallback — a MEDIA clip cannot be held idle, so it is torn down BY NAME', async () => {
  const r = await boot({
    // `live-2` is a clip: held across a look it would run to its end and come back black.
    assignments: assign([
      ['live-1', 'src-1'],
      ['live-2', 'src-clip'],
      ...ROUTE_KEYS.slice(2).map((k, i) => [k, `src-${String(i + 3)}`] as const),
    ]),
  });
  await onAir(r);
  const clipLayer = layerOf(r, 'live-2');
  const routeLayer = layerOf(r, 'live-3');
  const seen: { plateId: string; disposition: string; reason: string }[] = [];
  r.livePlateReleased.subscribe((e) => seen.push(e));
  const before = (await recvLines()).length;

  await r.setActiveLook('item-1', 'solo');

  const lines = await since(before);
  const clipRelease = seen.find((e) => e.plateId === 'live-2');
  expect(clipRelease?.disposition, 'a clip cannot be held').toBe('torn-down');
  expect(clipRelease?.reason).toContain('media clip');
  // Torn down means actually cleared, and dropped from the ledger…
  expect(lines).toContain(`CLEAR 1-${String(clipLayer)}`);
  expect(lines).toContain(`MIXER 1-${String(clipLayer)} CLEAR`);
  expect(recordOf(r, 'live-2')).toBeUndefined();
  // …while its ROUTE neighbour, in the same look and released at the same moment, is HELD.
  expect(seen.find((e) => e.plateId === 'live-3')?.disposition).toBe('held');
  expect(recordOf(r, 'live-3')?.held).toBe(true);
  expect(lines).not.toContain(`CLEAR 1-${String(routeLayer)}`);
});

it('a plate the template NO LONGER DECLARES is torn down, not held forever', async () => {
  const r = await boot();
  await onAir(r);
  const goneLayer = layerOf(r, 'live-6');
  const seen: { plateId: string; disposition: string }[] = [];
  r.livePlateReleased.subscribe((e) => seen.push(e));

  // Re-imported with five sources: `live-6` is not a plate any more, so no look can ever
  // bring it back and holding it would strand a producer nothing will reclaim.
  r.templateImport(
    sixBoxTemplate({
      sources: ROUTE_KEYS.slice(0, 5),
      looks: [look('six', GRID), look('solo', SOLO)],
    }),
    '<!doctype html><html></html>',
  );
  const before = (await recvLines()).length;
  await r.setActiveLook('item-1', 'six');

  expect(seen.find((e) => e.plateId === 'live-6')?.disposition).toBe('torn-down');
  expect(await since(before)).toContain(`CLEAR 1-${String(goneLayer)}`);
  expect(recordOf(r, 'live-6')).toBeUndefined();
});

// ─────────────────── THE SWAP IS A CALLER, NOT A PEER (2.3) ───────────────────

it('🔴 swapLiveSource still replaces IN PLACE — one PLAY, neighbours untouched', async () => {
  const r = await boot();
  await onAir(r);
  const layer = layerOf(r, 'live-1');
  const neighbour = layerOf(r, 'live-2');
  const before = (await recvLines()).length;

  expect(await r.swapLiveSource('item-1', 'live-1', 'src-sd')).toEqual({ ok: true });

  const lines = await since(before);
  // Routed through the reconcile, the swap is simply the ONE plate whose seat changed.
  expect(playsIn(lines)).toEqual([`PLAY 1-${String(layer)} "route://9"`]);
  expect(clearsIn(lines), 'no CLEAR precedes the replace — B-126').toEqual([]);
  expect(lines.some((l) => l.includes(`1-${String(neighbour)} `))).toBe(false);
  expect(layerOf(r, 'live-1')).toBe(layer);
  // 6.9b — the fit re-derived in the same action: PAL is 4:3, so it crops on the height.
  const fill = mock?.layerState({ channel: 1, layer })?.fill;
  const clip = mock?.layerState({ channel: 1, layer })?.clip;
  expect(fill?.height).toBeGreaterThan(clip?.height ?? 0);
});

it('🔴 a swap of a HELD plate costs the wire NOTHING, and lands when a look shows it', async () => {
  const r = await boot();
  await onAir(r);
  await r.setActiveLook('item-1', 'solo');
  expect(recordOf(r, 'live-2')?.held).toBe(true);
  const layer = layerOf(r, 'live-2');
  const before = (await recvLines()).length;

  expect(await r.swapLiveSource('item-1', 'live-2', 'src-sd')).toEqual({ ok: true });

  /*
    🔴 NOTHING IS SENT, AND THAT FALLS OUT OF THE RECONCILE RATHER THAN BEING A CASE IN IT.
    The active look has no rect for this plate, so the desired set does not place it and
    there is no seat to change. Commanding an invisible producer would spend an on-air
    action — and, for a source form that could not be held, a re-acquire — on a picture
    nobody can see. The override is recorded either way, which is the whole point of the
    swap being an EDIT the reconcile then honours.
  */
  expect(playsIn(await since(before))).toEqual([]);
  expect(recordOf(r, 'live-2')?.held, 'still held, still seated on its own layer').toBe(true);
  expect(layerOf(r, 'live-2')).toBe(layer);

  const back = (await recvLines()).length;
  await r.setActiveLook('item-1', 'six');

  // Coming back, THIS plate's seat has changed (a different producer) so it — and only
  // it — is re-seated, on the layer it never left.
  expect(playsIn(await since(back))).toEqual([`PLAY 1-${String(layer)} "route://9"`]);
  expect(recordOf(r, 'live-2')?.producer).toBe('"route://9"');
  expect(recordOf(r, 'live-2')?.held ?? false).toBe(false);
  expect(layerOf(r, 'live-2')).toBe(layer);
});

// ─────────────────── §12.6 EXCLUSIVITY, RE-CONFIRMED UNDER LOOKS (2.6) ───────────────────

it('🔴 §12.6 — a row parked on a SOLO look is STILL a multi-box incumbent', async () => {
  const r = await boot();
  await onAir(r);
  await r.setActiveLook('item-1', 'solo');
  expect(r.activeLookId('item-1')).toBe('solo');

  await r.load('item-2', 'debate', {});
  const verdict = await r.take('item-2');

  /*
    The predicate counts the GROUP's declared sources, not the active look's rects. Counting
    the look would let a second multi-box template on air beside a row that merely happens
    to be showing one box — and the collision would arrive later, when somebody switched
    that row back to six, with both templates already playing.
  */
  expect(verdict.accepted).toBe(false);
  expect(verdict.errorCode).toBe('multibox-already-on-air');
  expect(verdict.message).toContain('6 boxes');
});

// ─────────────────── THE DOOR'S OWN REFUSALS ───────────────────

it('setActiveLook refuses an unknown look and an unknown item, and mutates nothing', async () => {
  const r = await boot();
  await onAir(r);
  const before = (await recvLines()).length;

  expect((await r.setActiveLook('item-1', 'nope')).reason).toBe('unknown-look');
  expect((await r.setActiveLook('item-404', 'six')).reason).toBe('unknown-item');

  expect(await since(before)).toEqual([]);
  expect(r.activeLookId('item-1')).toBe('six');
});

it('a fresh take enters the AUTHORED default look, and a re-take keeps the chosen one', async () => {
  const r = await boot();
  await onAir(r);
  expect(r.activeLookId('item-1'), 'defaultLookId, not array order').toBe('six');

  await r.setActiveLook('item-1', 'solo');
  const before = (await recvLines()).length;
  await r.take('item-1');

  // A re-take re-asserts every plate (the operator's repair verb) but must NOT drag the
  // row back to the default look while the operator is watching the one they chose.
  expect(r.activeLookId('item-1')).toBe('solo');
  expect(playsIn(await since(before)), 'a re-take re-asserts the seats').toHaveLength(1);
  expect(recordOf(r, 'live-2')?.held).toBe(true);
});

// ─────────────── THE TWO FAILURE POLICIES, ONE FACT APART (2.1 / 2.2) ───────────────

it('🔴 a failure mid-SWITCH blacks nothing that was working — only the failing plate', async () => {
  /*
    The on-air case this policy exists for: the operator switches to a look that brings a
    NEW source in, and that source will not play. A take would roll the whole thing back,
    because nothing is on air yet and a half-placed layer is worse than a black one. A
    SWITCH must not — the row is on air, and blacking the boxes that are working to punish
    the one that is not is the opposite of what the operator needs in that minute.
  */
  const r = await boot({
    template: sixBoxTemplate({
      sources: ['live-1', 'live-2'],
      // The default look shows ONE box, so the take never touches the broken source.
      looks: [
        look('six', { 'live-1': GRID['live-1'] as LiveSourceRect }),
        look('both', {
          'live-1': GRID['live-1'] as LiveSourceRect,
          'live-2': GRID['live-2'] as LiveSourceRect,
        }),
      ],
    }),
    assignments: assign([
      ['live-1', 'src-1'],
      ['live-2', 'src-bad'],
    ]),
  });
  await onAir(r);
  const good = layerOf(r, 'live-1');
  const goodProducer = recordOf(r, 'live-1')?.producer;
  const before = (await recvLines()).length;

  const verdict = await r.setActiveLook('item-1', 'both');

  expect(verdict.ok, 'the switch is refused, honestly').toBe(false);
  const lines = await since(before);
  // The plate that was already on air kept its producer — not re-seated, not cleared.
  expect(lines).not.toContain(`CLEAR 1-${String(good)}`);
  expect(recordOf(r, 'live-1')?.producer).toBe(goodProducer);
  expect(layerOf(r, 'live-1')).toBe(good);
  expect(mock?.layerState({ channel: 1, layer: good })?.producer).toBeTruthy();
  // The plate this action CREATED and could not play is cleared and left out of the
  // ledger: a `PLAY` that left this process may have made a producer, and a ledger that
  // did not name it would leave a live picture nobody owns.
  expect(recordOf(r, 'live-2')).toBeUndefined();
  // …and the look stands, so the next take enters what the operator asked for.
  expect(r.activeLookId('item-1')).toBe('both');
});

it('🔴 the TAKE keeps its all-or-nothing rollback — the graphic never plays half-placed', async () => {
  const r = await boot({
    template: sixBoxTemplate({
      sources: ['live-1', 'live-2'],
      looks: [
        look('six', {
          'live-1': GRID['live-1'] as LiveSourceRect,
          'live-2': GRID['live-2'] as LiveSourceRect,
        }),
      ],
    }),
    assignments: assign([
      ['live-1', 'src-1'],
      ['live-2', 'src-bad'],
    ]),
  });
  await r.load('item-1', 'debate', {});
  const before = (await recvLines()).length;

  const verdict = await r.take('item-1');

  expect(verdict.accepted).toBe(false);
  const lines = await since(before);
  // BOTH layers come down, including the one that played perfectly well: a fill without
  // its clip renders nothing, and a producer with no geometry is a guest blown up across
  // the whole programme. Either is worse on air than black.
  expect(lines).toContain(`CLEAR 1-${String(BAND.start)}`);
  expect(r.liveLayers().has('item-1')).toBe(false);
  // …and the graphic itself never played.
  expect(lines.some((l) => l.startsWith('CG 1-') && l.includes('PLAY'))).toBe(false);
});

// ─────────── THE HELD LAYER IS NOT A FREE LAYER (regression, session BC review) ───────────

it('🔴 a plate a look shows for the FIRST TIME never lands on a HELD layer', async () => {
  /*
    THE DEFECT THIS PINS, because it destroyed a producer on air and then hid itself.

    `#planLiveSeating` used to report every layer in the item's ledger as available to that
    item. Before LOOKS that was correct by accident: a take seated every declaration, so the
    ledger and the desired set held the same plates. A HELD plate is in the ledger and NOT in
    the desired set, so its layer was offered as free to a plate the new look shows for the
    first time — which has no `preferred` layer of its own and takes the lowest free one.

    The result was not a visible break. The fresh `PLAY` replaced the held producer with no
    `CLEAR`, the ledger named one slot twice, and on the way BACK the stale held record still
    matched layer+producer so `seatUnchanged` fired and nothing was re-played — leaving the
    operator's box showing the wrong feed, wrongly cropped and silent, while the ledger and
    the published state both named the right one. Only a re-take repaired it.
  */
  const r = await boot({
    template: sixBoxTemplate({
      sources: ['live-1', 'live-2', 'live-3'],
      looks: [
        // The default seats live-1 and live-2 only — live-3 has never been seated.
        look('a', { 'live-1': GRID['live-1'], 'live-2': GRID['live-2'] }),
        // …then live-2 is HELD, and live-3 arrives for the first time.
        look('c', { 'live-1': GRID['live-1'], 'live-3': GRID['live-3'] }),
      ],
    }),
    assignments: assign([
      ['live-1', 'src-1'],
      ['live-2', 'src-2'],
      ['live-3', 'src-3'],
    ]),
  });
  await onAir(r);
  const heldLayer = layerOf(r, 'live-2');
  const heldProducer = recordOf(r, 'live-2')?.producer;
  expect(heldLayer).toBe(BAND.start + 1);

  const arrival = (await recvLines()).length;
  await r.setActiveLook('item-1', 'c');
  const arrivalLines = await since(arrival);

  const arriving = layerOf(r, 'live-3');
  // 🔴 THE DEFECT, DIRECTLY: nothing may be PLAYed onto the held plate's layer.
  expect(arrivalLines.some((l) => l.startsWith(`PLAY 1-${String(heldLayer)} `))).toBe(false);
  // 🔴 THE ASSERTION. The arriving plate takes a genuinely free layer, never the held one.
  expect(arriving).not.toBe(heldLayer);
  expect(arriving).toBeGreaterThanOrEqual(BAND.start);
  // The held producer is untouched and still named by the ledger, on its own layer.
  expect(recordOf(r, 'live-2')?.held).toBe(true);
  expect(recordOf(r, 'live-2')?.producer).toBe(heldProducer);
  expect(layerOf(r, 'live-2')).toBe(heldLayer);
  // …and no two records share a slot — the ledger cannot lie about who owns what.
  const slots = (r.liveLayers().get('item-1') ?? []).map((x) => x.slot.layer);
  expect(new Set(slots).size, 'one record per slot').toBe(slots.length);

  // Switching BACK really re-shows live-2, which is the half the stale record used to eat.
  const before = (await recvLines()).length;
  await r.setActiveLook('item-1', 'a');
  const lines = await since(before);
  expect(recordOf(r, 'live-2')?.held ?? false).toBe(false);
  expect(recordOf(r, 'live-2')?.producer).toBe(heldProducer);
  /*
    It was held, not destroyed, so coming back is never a re-seat. Its rect is the SAME in
    look 'a' as it was when it was seated, so no `FILL`/`CLIP` is due either — the geometry
    genuinely did not move, and re-emitting it would be noise. What IS due is the volume: the
    hold muted it, so the plate's intent has to be re-asserted or a deliberately-raised source
    comes back silent.
  */
  expect(playsIn(lines)).toEqual([]);
  expect(lines).toContain(`MIXER 1-${String(heldLayer)} VOLUME 0`);
  expect(lines.some((l) => l.startsWith(`MIXER 1-${String(heldLayer)} FILL `))).toBe(false);
});

// ───────── REVIEW REGRESSIONS (session BC adversarial review) ─────────

it('🔴 an ON-AIR row with an EMPTY ledger still reconciles — status, not seat count', async () => {
  /*
    `setActiveLook` tested "the ledger is empty" and called it "nothing is seated, so
    recording the look IS the whole action". An empty ledger is a different fact:
    `registerLiveLayers` DELETES an item's entry when its record list is empty, and a row
    taken on the EMPTY look (valid — background alone) is on air with no records at all.

    Under the old spelling that row was told `ok` while NOTHING was sent: every hole in the
    look it switched to stayed dark, and only a re-take — a cut — repaired it.
  */
  const r = await boot({
    template: sixBoxTemplate({
      sources: ['live-1', 'live-2'],
      looks: [
        look('empty', {}),
        look('two', { 'live-1': GRID['live-1'], 'live-2': GRID['live-2'] }),
      ],
    }),
    assignments: assign([
      ['live-1', 'src-1'],
      ['live-2', 'src-2'],
    ]),
  });
  await r.load('item-1', 'debate', {});
  expect((await r.take('item-1')).accepted).toBe(true);
  // On air, and the ledger names nothing — the state the old guard mistook for "not on air".
  expect(r.liveLayers().has('item-1')).toBe(false);
  expect(r.activeLookId('item-1')).toBe('empty');
  const before = (await recvLines()).length;

  expect(await r.setActiveLook('item-1', 'two')).toEqual({ ok: true });

  const lines = await since(before);
  expect(playsIn(lines), 'both plates must actually be seated').toHaveLength(2);
  expect(layerSet(r)).toEqual([BAND.start, BAND.start + 1]);
  expect(recordOf(r, 'live-1')?.held ?? false).toBe(false);
});

it('🔴 an emergency swap is NOT refused because an UNRELATED plate lost its assignment', async () => {
  /*
    The reconcile resolves ALL declarations at TAKE — a plate one picker click from being on
    screen must not refuse mid-switch. Applying that same all-or-nothing rule to a LIVE action
    bricked the repair verb: an operator swapping a dead feed at 20:59 was refused because a
    DIFFERENT plate, one this look does not even show, had lost its assignment.
  */
  const r = await boot();
  await onAir(r);
  const layer = layerOf(r, 'live-1');

  // live-6's assignment disappears (a catalog edit, a cascade) while the row is on air.
  r.setSourceAssignments(assign(ROUTE_KEYS.slice(0, 5).map((k, i) => [k, `src-${String(i + 1)}`])));

  const before = (await recvLines()).length;
  const verdict = await r.swapLiveSource('item-1', 'live-1', 'src-sd');

  expect(verdict, 'the repair verb must still work').toEqual({ ok: true });
  expect(playsIn(await since(before))).toEqual([`PLAY 1-${String(layer)} "route://9"`]);
  // …and the unrelated plate is HELD, not destroyed: an unknown source form is not a reason
  // to tear down a picture that is working.
  expect(recordOf(r, 'live-6')).toBeDefined();
});

it('🔴 setLivePlateVolume does NOT put a HELD plate on air — the intent waits for the look', async () => {
  const r = await boot();
  await onAir(r);
  await r.setActiveLook('item-1', 'solo');
  const layer = layerOf(r, 'live-2');
  expect(recordOf(r, 'live-2')?.held).toBe(true);
  const before = (await recvLines()).length;

  expect(await r.setLivePlateVolume('item-1', 'live-2', 1)).toEqual({ ok: true });

  /*
    A held plate is seated but off-screen. Asserting a raise onto it would put a VOICE on air
    from a box nobody can see — and the hold's mute is a one-shot, so nothing would ever take
    it back down. The intent is recorded and applied when a look brings the plate back.
  */
  expect(await since(before)).toEqual([]);
  expect(mock?.layerState({ channel: 1, layer })?.volume).toBe(0);

  const back = (await recvLines()).length;
  await r.setActiveLook('item-1', 'six');
  expect(await since(back)).toContain(`MIXER 1-${String(layer)} VOLUME 1`);
  expect(mock?.layerState({ channel: 1, layer })?.volume).toBe(1);
});
