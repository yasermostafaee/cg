import * as dgram from 'node:dgram';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import type {
  ConnectionConfig,
  SourceAssignments,
  SourceCatalog,
  TemplateInfo,
  TemplateLook,
} from '@cg/shared-ipc';
import { readCgControl, type LiveFitMode, type LiveSourceRect } from '@cg/shared-schema';
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
 * clean cut on the production 2.5.0 server remains a plant measurement, not a result.
 *
 * **The PAGE's half of the switch.** A look switch is two mutations on two machines: the
 * bridge moves the producers' geometry (here) and the page flips which look's instance is
 * visible and re-punches its holes (`@cg/template-runtime`'s `setActiveLook`). The transport
 * between them exists (`tasks.md` 6.7 — the look id on a `CG UPDATE`'s reserved key) and is
 * asserted here as a COMMAND, but a command is not a hole: what a real page does with that
 * payload is `looks-switch.test.ts`'s, and nothing in this file asserts a punched hole. The
 * bridge's own half of the mask IS asserted: `MIXER
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

/**
 * One look. `fits` is `B-178`'s per-look, per-routeKey fit modes — the map the AUTHOR's
 * element-level choice now travels in. Absent means "authored nothing", which resolves to the
 * `contain` default, so a caller that says nothing about fits gets the shipped behaviour.
 */
function look(
  id: string,
  rects: Record<string, LiveSourceRect>,
  fits?: Record<string, LiveFitMode>,
): TemplateLook {
  return { id, name: id, entered: { mode: 'cut' }, rects, ...(fits !== undefined && { fits }) };
}

/** Every routeKey in `rects` authored the SAME mode — the common fixture shape. */
const allFits = (
  rects: Record<string, LiveSourceRect>,
  mode: LiveFitMode,
): Record<string, LiveFitMode> => Object.fromEntries(Object.keys(rects).map((k) => [k, mode]));

/**
 * The multi-frame group as the bridge sees it: sources declared ONCE, looks referencing
 * them. `sources[].rect` is the source's rect in the DEFAULT look, which is what
 * `collectLookCarrier` emits and what a bridge that has not learned looks would seat.
 */
function sixBoxTemplate(
  over: {
    looks?: TemplateLook[];
    sources?: readonly string[];
    defaultLookId?: string;
    /**
     * ⭐ `C-028` — the AUTHOR's fit mode for every plate of this fixture.
     *
     * Defaults to `cover`, and that is a decision about THIS FILE rather than about the
     * product: these tests are a geometry suite whose assertions are written in crop
     * arithmetic — a fill wider than its mask, starting left of it — and the shipped
     * default is now `contain`, under which none of that happens. Pinning the fixture to
     * `cover` keeps them testing the reconcile they were written for (which look's
     * geometry reaches which layer, and when), and `C-028`'s own `contain` behaviour is
     * asserted in its own tests rather than by silently re-reading these.
     *
     * ⚠ **`B-178` moved WHERE this is stamped, not what it means.** It used to be written onto
     * each DECLARATION, which is the field the bug proved nothing ever writes and the bridge no
     * longer reads under a look group. It is now stamped onto every LOOK's `fits` map, which is
     * where an exported template really carries it. A caller passing per-look `looks` of its own
     * carries its own fits — that is what the two-mode test below does.
     */
    fitMode?: LiveFitMode;
  } = {},
) {
  const keys = over.sources ?? ROUTE_KEYS;
  const mode = over.fitMode ?? ('cover' as LiveFitMode);
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
        look('six', GRID, allFits(GRID, mode)),
        look('solo', SOLO, allFits(SOLO, mode)),
        look('moved', MOVED, allFits(MOVED, mode)),
        look('resized', RESIZED, allFits(RESIZED, mode)),
        look('empty', {}),
      ],
      defaultLookId: over.defaultLookId ?? 'six',
    },
  } satisfies TemplateInfo;
}

function catalog(over: Partial<SourceCatalog> = {}): SourceCatalog {
  return {
    sources: [
      ...ROUTE_KEYS.map((_k, i) => ({
        id: `src-${String(i + 1)}`,
        name: `Feed ${String(i + 1)}`,
        format: '1080i5000' as const,
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

async function boot(
  options: {
    template?: TemplateInfo;
    assignments?: SourceAssignments;
    /** `B-199` — TEST-ONLY: make the seating batch DIE after this many `MIXER` lines. */
    throwAfterMixerLines?: number;
  } = {},
) {
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
      // `B-174` — 0 keeps the page-first ORDER (which this suite pins) while skipping the
      // 40 ms sleep on each of this file's dozens of switches; the hold's DURATION has its
      // own timing tests in `look-switch-hold.integration.test.ts`.
      lookMixerHoldMs: 0,
      sourceCatalog: catalog(),
      sourceAssignments: options.assignments ?? DEFAULT_ASSIGNMENTS,
      ...(options.throwAfterMixerLines === undefined
        ? {}
        : { faultInjection: { throwAfterMixerLines: options.throwAfterMixerLines } }),
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
  recordOf(r, plateId, itemId)?.slot.layer ?? -1;

/**
 * The record for the seat this plate PUNCHES, falling back to one it merely labels.
 *
 * ⚠ Session BM: a plate can label two records — the seat it shows in the active look, and a
 * seat some other look binds its frame to. The on-screen one is what an assertion means, and
 * it is the same preference `setLivePlateVolume` makes for the same reason.
 */
const recordOf = (r: CasparRuntime, plateId: string, itemId = 'item-1') => {
  const records = r.liveLayers().get(itemId) ?? [];
  return (
    records.find((rec) => rec.sourceId === plateId && rec.held !== true) ??
    records.find((rec) => rec.sourceId === plateId)
  );
};

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
    expect(lines).toContain(`MIXER 1-${String(layer)} VOLUME 0 DEFER`);
    expect(mock?.layerState({ channel: 1, layer })?.volume).toBe(0);
  }
});

it('🔴 B-154 — a HELD plate must RENDER NOTHING, not keep its old clip under the new hole', async () => {
  /*
    THE DEFECT. §12.4's hold muted the plate and stopped the PAGE punching its hole — and
    stopped there. The producer stayed seated with the `MIXER FILL`/`CLIP` it was given for
    the look it left, so it went on rendering into its old cell.

    That is invisible only while the page covers that cell. It does not, as soon as the
    ACTIVE look punches a hole that overlaps it: CasparCG composites the band bottom-up and
    the page's hole is transparent to ALL of it, not to one layer. SOLO is the case in this
    very fixture — one full-frame hole over five held plates — so the operator switching a
    6-box to a solo saw the five feeds they had just left, tiled inside the solo box.

    🔴 The mask is the layer's OWN business, and this is the axis the phase-3 tests read as
    covered: they assert the held plate keeps its LAYER and its PRODUCER and loses its
    VOLUME. Nobody asked what it RENDERS.
  */
  const r = await boot();
  await onAir(r);
  const soloLayer = layerOf(r, 'live-1');
  const before = (await recvLines()).length;

  expect(await r.setActiveLook('item-1', 'solo')).toEqual({ ok: true });

  const lines = await since(before);
  // The hole SOLO punches is the whole raster, so every held plate's cell is inside it.
  expect(mock?.layerRenderedRect({ channel: 1, layer: soloLayer })).toEqual({
    x: 0,
    y: 0,
    width: 1,
    height: 1,
  });

  for (const key of ROUTE_KEYS.slice(1)) {
    const layer = layerOf(r, key);
    /*
      🔴 THE ASSERTION, through the mock's OWN predicate rather than a second copy of it.
      `layerRenderedRect` is `null` exactly when FILL and CLIP do not intersect — the
      measured spelling of "renders nothing at all" (`command-builder.ts`'s `mixerFit`
      note, design.md §3's last row). Asserting on `clip` alone cannot see this.
    */
    expect(mock?.layerRenderedRect({ channel: 1, layer }), `${key} still renders`).toBeNull();
    // …and it got there by a command, in the same batch discipline as every other fit.
    expect(lines.some((l) => l.startsWith(`MIXER 1-${String(layer)} FILL `))).toBe(true);
    expect(lines.some((l) => l.startsWith(`MIXER 1-${String(layer)} CLIP `))).toBe(true);
  }
  // Still a HOLD, not a teardown: same layers, same producers, nothing cleared.
  expect(playsIn(lines), 'blanking a held plate is not a re-seat').toEqual([]);
  expect(clearsIn(lines), 'blanking a held plate is not a teardown').toEqual([]);
  expect(r.liveLayers().get('item-1') ?? []).toHaveLength(6);
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

it('🔴 a swap of a HELD plate re-seats it OFF SCREEN, so the look that shows it is a CUT', async () => {
  /*
    🔴 THIS ASSERTION WAS INVERTED BY SESSION BM, AND THE INVERSION IS THE FEATURE.

    It used to read _"a swap of a HELD plate costs the wire NOTHING, and lands when a look
    shows it"_, on the reasoning that _"the active look has no rect for this plate, so the
    desired set does not place it and there is no seat to change."_ Correct while a seat was
    a plate the ACTIVE look showed — and it is exactly what made the owner's walk step 3
    impossible: the re-seat was merely POSTPONED to the switch, so entering the look paid a
    fresh `PLAY` and, on the plant, a visible re-acquire.

    Under (B′) the seat set is the union over every look, so the substitution happens NOW,
    off screen, where a re-acquire costs nothing — and the switch that shows it moves a
    `MIXER FILL` and no producer. Same two commands, opposite order, and the order is the
    whole point.
  */
  const r = await boot();
  await onAir(r);
  await r.setActiveLook('item-1', 'solo');
  expect(recordOf(r, 'live-2')?.held).toBe(true);
  const layer = layerOf(r, 'live-2');
  const before = (await recvLines()).length;

  expect(await r.swapLiveSource('item-1', 'live-2', 'src-sd')).toEqual({ ok: true });

  const lines = await since(before);
  // The substitution happens off screen, IN PLACE on the layer the plate never left — the
  // old producer is bound by no look any more, so its layer goes to what replaces it.
  expect(playsIn(lines)).toEqual([`PLAY 1-${String(layer)} "route://9"`]);
  expect(clearsIn(lines), 'a replace, not a CLEAR-then-ADD — B-126').toEqual([]);
  expect(layerOf(r, 'live-2')).toBe(layer);
  expect(recordOf(r, 'live-2')?.producer).toBe('"route://9"');
  // 🔴 …and it is INVISIBLE while it waits: parked, so the layer renders nothing at all.
  expect(recordOf(r, 'live-2')?.held, 'seated, muted and off screen').toBe(true);
  expect(mock?.layerRenderedRect({ channel: 1, layer })).toBeNull();
  expect(lines).toContain(`MIXER 1-${String(layer)} VOLUME 0 DEFER`);

  const back = (await recvLines()).length;
  await r.setActiveLook('item-1', 'six');

  // 🔴 THE PAYOFF, AND THE OWNER'S WALK STEP 3: showing it costs NO producer at all.
  expect(playsIn(await since(back)), 'the preset makes the switch a cut').toEqual([]);
  expect(recordOf(r, 'live-2')?.producer).toBe('"route://9"');
  expect(recordOf(r, 'live-2')?.held ?? false).toBe(false);
  expect(layerOf(r, 'live-2')).toBe(layer);
  expect(mock?.layerRenderedRect({ channel: 1, layer }), 'and it is on screen').not.toBeNull();
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
  /*
    🔴 **SUPERSEDED BY `tasks.md` 7.9 — this line used to assert `'both'`**, on the reasoning
    that "the look stands, so the next take enters what the operator asked for". It does not
    stand any more, and the reversal is the whole of 7.9: `#activeLooks` is what
    `#desiredPlateRects` resolves from, so a look left recorded after a refusal is not a note
    about the operator's wish — it is the geometry the NEXT reconcile will seat, from any
    caller, including a `swapLiveSource` that never mentioned looks.

    ⭐ `B-174` — WHY `'six'` IS STILL THE ANSWER, BY A DIFFERENT ROUTE. This used to read
    "the page was never told `'both'` (the switch died before the `CG UPDATE`)". Under the
    page-first order it IS told: the refusal here comes from the mock's WIRE (the `src-bad`
    fixture refuses at the `PLAY`), which can only arrive after the tell. The rollback then
    re-tells `'six'` through the same fused writer, so the record follows the last tell that
    landed — same answer, and now for the reason the code actually gives. Debugging a red
    here means looking at the REVERT tell, not for a path that skips the first one.
  */
  expect(r.activeLookId('item-1'), 'the rollback put the page back on "six"').toBe('six');
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
        look('a', {
          'live-1': GRID['live-1'] as LiveSourceRect,
          'live-2': GRID['live-2'] as LiveSourceRect,
        }),
        // …then live-2 is HELD, and live-3 arrives for the first time.
        look('c', {
          'live-1': GRID['live-1'] as LiveSourceRect,
          'live-3': GRID['live-3'] as LiveSourceRect,
        }),
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
    It was held, not destroyed, so coming back is never a re-seat. What IS due is the volume
    — the hold muted it, so the plate's intent has to be re-asserted or a deliberately-raised
    source comes back silent — and, since `B-154`, the GEOMETRY.

    🔴 THIS ASSERTION WAS INVERTED BY `B-154`, and the old reasoning is kept here because it
    was correct about the wrong premise. It read: _"its rect is the SAME in look 'a' as it was
    when it was seated, so no `FILL`/`CLIP` is due either — the geometry genuinely did not
    move, and re-emitting it would be noise."_ True of the plate's rect, and that was never
    the question: the HOLD now parks the seat's fill off the raster so it renders nothing
    (`parkedFit` — a held producer otherwise shows through whatever hole the active look
    punches over its cell). So the geometry DID move, on the way out, and coming back is
    exactly where it has to move back. A switch that re-punched the page's hole without
    re-emitting the fill would leave the box permanently empty.
  */
  expect(playsIn(lines)).toEqual([]);
  expect(lines).toContain(`MIXER 1-${String(heldLayer)} VOLUME 0 DEFER`);
  expect(lines.some((l) => l.startsWith(`MIXER 1-${String(heldLayer)} FILL `))).toBe(true);
  // …and it is back on screen, at the rect look 'a' gives it — not merely un-parked.
  expect(mock?.layerRenderedRect({ channel: 1, layer: heldLayer })).not.toBeNull();
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
        look('two', {
          'live-1': GRID['live-1'] as LiveSourceRect,
          'live-2': GRID['live-2'] as LiveSourceRect,
        }),
      ],
    }),
    // ⚠ NOTHING IS ASSIGNED AT TAKE, and under session BM that is what makes the ledger
    // genuinely empty. The seat set is now the union over EVERY look, so a template whose
    // OTHER look has resolvable plates pre-seats them and the row is never in the state this
    // regression is about. An unassigned pair resolves to no seat anywhere, which reaches the
    // same on-air-with-an-empty-ledger state the original fixture reached by a route that
    // (B′) closed.
    assignments: assign([]),
  });
  await r.load('item-1', 'debate', {});
  expect((await r.take('item-1')).accepted).toBe(true);
  // On air, and the ledger names nothing — the state the old guard mistook for "not on air".
  expect(r.liveLayers().has('item-1')).toBe(false);
  expect(r.activeLookId('item-1')).toBe('empty');
  /*
    🔴 **SESSION BP REBUILT THIS FIXTURE, AND THE SUBJECT IS UNCHANGED. Read this before
    "restoring" the old shape.**

    It used to assign the plates HERE, after the take, and prove the switch reconciled by
    counting the two `PLAY`s that followed. That fixture depended on the very mechanism `BP`
    abolished: an assignment edited while the row is on air reaching that row's next
    reconcile. The row now FREEZES level 2 at its take — it was taken with nothing assigned,
    so nothing is assigned for this run, and the edit below lands at its NEXT take.

    The subject of this test is not the assignment. It is that `setActiveLook` decides
    "is this row on air" from its STATUS and not from an empty ledger. That is asserted more
    sharply now than by counting sends: a short-circuit returns `{ok: true}` having sent
    NOTHING, so a REFUSAL naming the unassigned plates is positive proof the plan was built
    and evaluated. The old spelling could not tell "reconciled and seated" from "reconciled
    and refused"; this can, and both are correct outcomes for a row that reached the planner.
  */
  const before = (await recvLines()).length;

  const refused = await r.setActiveLook('item-1', 'two');
  expect(refused.ok, 'the reconcile RAN — a short-circuit would have said ok').toBe(false);
  expect(refused.reason).toBe('live-source-unassigned');
  expect(playsIn(await since(before)), 'and a refused switch seats nothing').toEqual([]);
  // 🔴 …and the row did NOT move: a refused switch records nothing (`tasks.md` 7.9).
  expect(r.activeLookId('item-1')).toBe('empty');

  /*
    THE POSITIVE CONTROL — the same row, the same switch, once the assignment is in force for
    it. This is where the two `PLAY`s the old spelling counted still get counted; what changed
    is only WHEN the assignment becomes this row's, which is now its own take.
  */
  r.setSourceAssignments(
    assign([
      ['live-1', 'src-1'],
      ['live-2', 'src-2'],
    ]),
  );
  const beforeRetake = (await recvLines()).length;
  expect((await r.take('item-1')).accepted).toBe(true);
  expect(await r.setActiveLook('item-1', 'two')).toEqual({ ok: true });

  /*
    ⚠ THE TWO `PLAY`s LAND ON THE RE-TAKE, NOT ON THE SWITCH, and that is (B′) working
    rather than a weaker assertion. The seat set is the union over EVERY look, so re-taking
    on `empty` seats both of `two`'s plates PARKED — and the switch that follows is then the
    pure `MIXER FILL` a switch is supposed to be. Baselining across both is what makes the
    count independent of which of the two actions does the seating.
  */
  const lines = await since(beforeRetake);
  expect(playsIn(lines), 'both plates must actually be seated').toHaveLength(2);
  expect(layerSet(r)).toEqual([BAND.start, BAND.start + 1]);
  // …and they are PUNCHED after the switch, not left parked.
  expect(recordOf(r, 'live-1')?.held ?? false).toBe(false);
  expect(recordOf(r, 'live-2')?.held ?? false).toBe(false);
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

  expect(await r.setLivePlateVolume('item-1', 'live-2', 1)).toEqual({ ok: true, sent: false });

  /*
    A held plate is seated but off-screen. Asserting a raise onto it would put a VOICE on air
    from a box nobody can see — and the hold's mute is a one-shot, so nothing would ever take
    it back down. The intent is recorded and applied when a look brings the plate back.
  */
  expect(await since(before)).toEqual([]);
  expect(mock?.layerState({ channel: 1, layer })?.volume).toBe(0);

  const back = (await recvLines()).length;
  await r.setActiveLook('item-1', 'six');
  expect(await since(back)).toContain(`MIXER 1-${String(layer)} VOLUME 1 DEFER`);
  expect(mock?.layerState({ channel: 1, layer })?.volume).toBe(1);
});

// ─────────────── tasks.md 6.7 — THE LOOK ID REACHES THE PAGE ───────────────

/**
 * The AMCP data argument of a `CG … UPDATE` line, back to the object the page will parse.
 *
 * The wire form carries the hardware-verified TWO-LAYER escape (B-041 take 2), so this undoes
 * it rather than guessing: what comes out is what `JSON.parse` sees inside the template.
 * Asserting the PAYLOAD — not merely that a command was sent — is the whole point of 6.7's
 * test: a correctly-shaped command carrying the WRONG look id would move the fills and the
 * holes to different looks, which is the defect itself.
 */
function dataArgOf(line: string, verb: 'UPDATE' | 'ADD'): Record<string, unknown> | undefined {
  const re =
    verb === 'UPDATE' ? /^CG \d+-\d+ UPDATE \d+ "(.*)"$/s : /^CG \d+-\d+ ADD \d+ ".*?" 0 "(.*)"$/s;
  const m = re.exec(line);
  if (m === null) return undefined;
  const unescaped = (m[1] ?? '').replace(/\\(.)/g, '$1');
  return JSON.parse(unescaped) as Record<string, unknown>;
}

const updateLines = (lines: readonly string[]): string[] =>
  lines.filter((l) => /^CG \d+-\d+ UPDATE /.test(l));

it('🔴 the switch tells the PAGE which look — the payload carries the id, beside the fills', async () => {
  const r = await boot();
  await onAir(r);
  const before = (await recvLines()).length;

  expect(await r.setActiveLook('item-1', 'solo')).toEqual({ ok: true });

  const lines = await since(before);
  const updates = updateLines(lines);
  /*
    🔴 `SKEW-INTERSECT-01` REPLACED "the page is told ONCE" with "the page is told TWICE, and
    the two say different things". The first tell carries `from`, so the page punches
    `outgoing ∩ entering` while the fills are in flight — no hole open over a geometry that
    does not fill it, in either direction. The second settles the mask onto the entering
    look's own holes once they are in place. Both are asserted, in order, because a switch
    that narrowed and never widened would leave the row showing less than the look asks for.
  */
  /*
    🔴 **`single-clock-look-switch` — ONE `CG UPDATE`, carrying ONE thing: the look id.**

    It used to be two, and both extras were about a MASK. The first tell carried `from` so the
    page could punch `outgoing ∩ entering` while the fills were in flight; the second settled
    it onto the entering look's own holes. `C-028`'s fit facts rode the same payload so the
    page could cut its holes where the picture would be. The page has no holes now — a
    plate-bearing package is composited BELOW its plates — so the fit that reaches air is the
    bridge's `MIXER FILL` / `CLIP` alone, and the page needs only to know which look to show.

    ⚠ **The tell is still SENT, and still FIRST**, because the page still flips its own
    per-look decoration. What is gone is the requirement that it land on a particular frame.

    Read back through the SAME codec the page uses, so the two halves cannot drift.
  */
  expect(updates, 'exactly ONE CG UPDATE — the look, told once').toHaveLength(1);
  const control = readCgControl(dataArgOf(updates[0] as string, 'UPDATE'));
  expect(control?.look).toBe('solo');
  // Nothing else rides the payload: `from` and `plates` went with the mask that read them.
  expect(Object.keys(control ?? {})).toEqual(['look']);

  /*
    🔴 ORDER — `B-174` REVERSED THIS: the page is told FIRST, then the fills move after the
    mixer hold. The old fills-first order put the holes 1–3 FIELDS behind the fills on air
    (the page's half is quantised to its own paint clock — measured by `tools/skew-harness`,
    20–60 ms, visible to the naked eye on the plant), so the switch now validates its plan,
    tells the page, holds one channel frame, and only then moves the fills. A lost
    `CG UPDATE` under this order aborts BEFORE any geometry command — nothing moves at all,
    which is strictly tighter than what fills-first left behind (moved fills under unmoved
    holes).
  */
  const firstFill = lines.findIndex((l) => /^MIXER 1-\d+ FILL /.test(l));
  expect(firstFill, 'the fills must have moved').toBeGreaterThanOrEqual(0);
  expect(
    lines.indexOf(updates[0] as string),
    'B-174: the page is told BEFORE any fill moves',
  ).toBeLessThan(firstFill);
});

/**
 * ⭐ **`B-178` — THE OWNER'S REPRO, AT THE WIRE.**
 *
 * Two live plates side by side, one authored `contain` and one authored `cover`. On the plant
 * both went to air `contain`, and the `CG ADD` payload said so:
 *
 * ```
 * "__cg":{"look":"look-2","plates":{
 *    "l1":{"aspect":1.7777777777777777,"mode":"contain"},
 *    "l2":{"aspect":1.7777777777777777,"mode":"contain"}}}
 * ```
 *
 * 🔴 **The assertion that matters is that the two modes DIFFER.** Every other property of this
 * payload was already correct — well-formed JSON, the right plate ids, a plausible aspect, a
 * legal mode — which is why nothing caught it: `contain` is both the shipped default and a
 * legitimate authored choice, so a payload dump could not be read as evidence either way.
 */
/**
 * 🔴 **THE OWNER'S OWN BOXES.** The six-box GRID is 480×270 — 16:9, the same shape as the
 * catalog's `1080i5000` sources — so `contain` and `cover` compute the SAME rect there and no
 * assertion written against it could ever tell the two apart. That is not a detail: a fixture
 * whose box already matches its source is exactly the fixture that cannot see this bug.
 *
 * These are the plant's real boxes, to the pixel: `943.6 × 1049.04` and `938.4 × 1049.04` in a
 * 1920×1080 scene on a 1920×1080 channel. Tall, narrow, and nothing like 16:9.
 */
const TALL: Record<string, LiveSourceRect> = {
  'live-1': { x: 0, y: 15.48, width: 943.6, height: 1049.04 },
  'live-2': { x: 943.6, y: 15.48, width: 938.4, height: 1049.04 },
};

it('🔴 B-178 — TWO plates in ONE look, authored differently, reach air with DIFFERENT geometry', async () => {
  const r = await boot({
    template: sixBoxTemplate({
      sources: ['live-1', 'live-2'],
      // The author's two choices on the two plates of ONE look — the case the shipped
      // per-declaration read could not express at all.
      looks: [look('six', TALL, { 'live-1': 'contain', 'live-2': 'cover' })],
      defaultLookId: 'six',
    }),
  });
  await onAir(r);

  const contained = mock?.layerState({ channel: 1, layer: layerOf(r, 'live-1') });
  const covered = mock?.layerState({ channel: 1, layer: layerOf(r, 'live-2') });

  /*
    🔴 THE POSITIVE CONTROL — a contained picture lies wholly inside its box, so FILL and CLIP
    are byte-identical. This is precisely what the owner measured for BOTH plates, and it is
    what proved the `cover` had been dropped: the two rects agreeing IS the `contain` signature.
  */
  expect(contained?.fill).toEqual(contained?.clip);

  // 🔴 AND THE DISCRIMINATOR — `cover` must overflow its box on the wide axis, so the two
  // rects MUST differ. Before this fix both plates produced the assertion above.
  expect(covered?.fill).not.toEqual(covered?.clip);

  /*
    BY VALUE, from the plant's own numbers. Box 938.4 × 1049.04, source 16:9:
      contain → 938.40 × 527.85
      cover   → 1864.96 × 1049.04
    926.56 px apart on the width — nothing about this is a rounding question. (The plant's two
    boxes differ slightly, so the OTHER plate's contain height is 530.78, asserted below; both
    are what the wire actually carried when the `cover` was dropped.)
  */
  expect((covered?.fill?.width ?? 0) * SCENE.width).toBeCloseTo(1864.96, 1);
  expect((covered?.fill?.height ?? 0) * SCENE.height).toBeCloseTo(1049.04, 1);
  // …while the CLIP stays AT the box: the overflow is masked away, never punched.
  expect((covered?.clip?.width ?? 0) * SCENE.width).toBeCloseTo(938.4, 1);
  expect((covered?.clip?.height ?? 0) * SCENE.height).toBeCloseTo(1049.04, 1);
  // …and the contained plate lands on the height the plant logged.
  expect((contained?.fill?.height ?? 0) * SCENE.height).toBeCloseTo(530.77, 1);
});

it('🔴 B-178 — the same source in TWO looks is fitted per look, and the switch tells the page', async () => {
  /*
    The reason the mode is per-look and not per-source: ONE routeKey in two differently-shaped
    boxes. A per-source answer would have to be wrong in one of them by construction — which is
    the same argument `C-028` used to refuse a per-catalog-source home, applied one level in.
  */
  const r = await boot({
    template: sixBoxTemplate({
      sources: ['live-1'],
      looks: [
        look('six', { 'live-1': TALL['live-1'] as LiveSourceRect }, { 'live-1': 'contain' }),
        look('solo', { 'live-1': TALL['live-1'] as LiveSourceRect }, { 'live-1': 'cover' }),
      ],
      defaultLookId: 'six',
    }),
  });
  await onAir(r);
  const layer = layerOf(r, 'live-1');
  const beforeSwitch = mock?.layerState({ channel: 1, layer });
  expect(beforeSwitch?.fill, 'look `six` authored contain').toEqual(beforeSwitch?.clip);

  const before = (await recvLines()).length;
  expect(await r.setActiveLook('item-1', 'solo')).toEqual({ ok: true });

  // The SAME plate, in the SAME box, is now fitted the way the SOLO look authored it.
  const after = mock?.layerState({ channel: 1, layer });
  expect(after?.fill).not.toEqual(after?.clip);
  /*
    …and the page is told the new LOOK. `single-clock-look-switch` — the resolved MODE no
    longer rides the payload: it used to, so the page could cut its hole at the same shape,
    and the page has no holes. The mode's effect is asserted where it now lands in full — on
    the wire, two lines up: `cover` is exactly the case in which `FILL` and `CLIP` differ.
  */
  const updates = updateLines(await since(before));
  const control = readCgControl(dataArgOf(updates[0] as string, 'UPDATE'));
  expect(control?.look).toBe('solo');
  expect(Object.keys(control ?? {})).toEqual(['look']);
});

it('🔴 B-178 — "nobody said" resolves to the DEFAULT, and the take SAYS SO as `default`', async () => {
  /*
    The third state, and the half `B-178` exists to make legible. A look whose `fits` map is
    absent authored nothing; that must resolve to `contain` at the ONE resolution point, and the
    readout must say `default` rather than dress it up as an authored choice.

    🔴 THE PROVENANCE IS ASSERTED, not just the geometry. `contain` is both the shipped default
    and a legitimate authored choice, so a test that checked only the picture would pass whether
    or not the signal existed — and an absent signal is the whole reason this bug took a plant
    walk to find. The stderr line is captured because it is the deliverable.
  */
  const written: string[] = [];
  const stderr = vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
    written.push(String(chunk));
    return true;
  });
  try {
    const r = await boot({
      template: sixBoxTemplate({
        sources: ['live-1'],
        looks: [look('six', { 'live-1': TALL['live-1'] as LiveSourceRect })],
        defaultLookId: 'six',
      }),
    });
    await onAir(r);
    const state = mock?.layerState({ channel: 1, layer: layerOf(r, 'live-1') });
    expect(state?.fill, 'the default really is contain').toEqual(state?.clip);

    const line = written.find((l) => l.includes('live-plate fit'));
    expect(line, 'the take reports every plate’s fit').toBeDefined();
    expect(line).toContain('live-1=contain (default)');
  } finally {
    stderr.mockRestore();
  }
});

it('🔴 B-178 — an AUTHORED `contain` reports `authored`, distinguishing it from the default', async () => {
  /*
    The other half of the same distinction, and the one that makes the readout worth having. The
    two produce an IDENTICAL picture, so only the provenance can tell an operator whether the
    author was heard — which is exactly the inference the owner had to make by hand from two
    plates agreeing when they had been set differently.
  */
  const written: string[] = [];
  const stderr = vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
    written.push(String(chunk));
    return true;
  });
  try {
    const r = await boot({
      template: sixBoxTemplate({
        sources: ['live-1'],
        looks: [
          look('six', { 'live-1': TALL['live-1'] as LiveSourceRect }, { 'live-1': 'contain' }),
        ],
        defaultLookId: 'six',
      }),
    });
    await onAir(r);
    const line = written.find((l) => l.includes('live-plate fit'));
    expect(line).toContain('live-1=contain (authored)');
    // 🔴 The MODE is identical to the test above; only the provenance differs. That is the point.
    expect(line).not.toContain('(default)');
  } finally {
    stderr.mockRestore();
  }
});

it('🔴 B-178 — the readout names EVERY plate, with each one’s own mode', async () => {
  const written: string[] = [];
  const stderr = vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
    written.push(String(chunk));
    return true;
  });
  try {
    const r = await boot({
      template: sixBoxTemplate({
        sources: ['live-1', 'live-2'],
        looks: [look('six', TALL, { 'live-1': 'contain', 'live-2': 'cover' })],
        defaultLookId: 'six',
      }),
    });
    await onAir(r);
    const line = written.find((l) => l.includes('live-plate fit'));
    expect(line).toContain('live-1=contain (authored)');
    expect(line).toContain('live-2=cover (authored)');
    // ONE line, and each plate named ONCE — two answers for one plateId is the confusion the
    // parked-seat guard exists to prevent.
    expect((line ?? '').match(/live-2=/g)).toHaveLength(1);
  } finally {
    stderr.mockRestore();
  }
});

it('🔴 B-178 — the DECLARATION’s fitMode is IGNORED under a look group', async () => {
  /*
    The bug's mirror image, pinned so it cannot come back by the other road. `LookSource.fitMode`
    is deleted, but `LiveSourceDeclaration.fitMode` still exists for the no-look carrier — and a
    hand-authored package could set it on a look-group template. It must NOT win there: the looks
    are the authority, and a declaration-level value would be a second home for one fact.
  */
  const template = sixBoxTemplate({
    sources: ['live-1'],
    looks: [look('six', { 'live-1': TALL['live-1'] as LiveSourceRect })],
    defaultLookId: 'six',
  });
  const withDeclFit = {
    ...template,
    liveSources: {
      ...template.liveSources,
      sources: template.liveSources.sources.map((s) => ({ ...s, fitMode: 'cover' as LiveFitMode })),
    },
  } satisfies TemplateInfo;

  const r = await boot({ template: withDeclFit });
  await onAir(r);
  const state = mock?.layerState({ channel: 1, layer: layerOf(r, 'live-1') });
  // The look says nothing, so the answer is the DEFAULT — not the declaration's `cover`.
  expect(state?.fill).toEqual(state?.clip);
});

it('🔴 a REFUSED switch leaves the page ON THE OLD LOOK — told back if it was told at all', async () => {
  /*
    🔴 `B-174` re-drew the line this test pins. The safety property is unchanged in
    substance — a refused switch ends with the old look whole, holes and fills agreeing —
    but the page-first order splits its enforcement in two:

    - every refusal the bridge can detect WITHOUT applying (an unassigned plate through the
      product's own doors, an unknown look, a collision) fires at the PLAN, before
      `beforeApply`, and the page hears nothing — that case is pinned by the plan-time test
      in look-switch-refusal ("NOTHING reaches the wire — every moving verb, enumerated");
    - a refusal only the WIRE can deliver arrives after the page moved, and the rollback
      RE-TELLS the previous look, so the page ENDS where the fills ended: on the old look.

    This fixture is the second kind by construction: `src-bad` is injected through the
    CONSTRUCTOR, bypassing both product doors that make it unrepresentable
    (`setSourceAssignments` refuses an unknown source; `createBridge` prunes one), so the
    plan sees a resolvable-looking binding and the refusal arrives from the mock's wire.
    What must hold is the END STATE, and the wire must SHOW the revert.
  */
  const r = await boot({
    template: sixBoxTemplate({
      sources: ['live-1', 'live-2'],
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
  const before = (await recvLines()).length;

  expect((await r.setActiveLook('item-1', 'both')).ok).toBe(false);

  const updates = updateLines(await since(before));
  const lastLook = readCgControl(dataArgOf(updates[updates.length - 1] as string, 'UPDATE'))?.look;
  expect(lastLook, 'whatever was said in between, the page ENDS on the old look').toBe('six');
  expect(r.activeLookId('item-1'), 'and the record agrees with the page').toBe('six');
});

it('a switch whose PRODUCER is gone records the look and sends no UPDATE', async () => {
  // B-070's rule, which this transport inherits: `CG UPDATE` needs a live PRODUCER and real
  // CasparCG 403s it on an empty layer. There is nothing to tell; the next take re-asserts it
  // through the `CG ADD` payload below.
  const r = await boot();
  await onAir(r);
  await r.out('item-1');
  const before = (await recvLines()).length;

  expect(await r.setActiveLook('item-1', 'solo')).toEqual({ ok: true });

  expect(updateLines(await since(before))).toEqual([]);
  expect(r.activeLookId('item-1')).toBe('solo');
});

it('🔴 the CG ADD payload carries the look too — a re-take cannot diverge from the bridge', async () => {
  /*
    The same gap by a different verb. A fresh build enters the AUTHORED DEFAULT look, decided
    page-side and synchronously, before anything can say otherwise — while the bridge seats
    whatever look the row is RECORDED on. So a row switched to solo and then re-taken (`out`
    destroys the producer; the next take re-ADDs) would come back with the FILLS on solo and
    the HOLES on the default: this session's defect, arriving by the load path.
  */
  const r = await boot();
  await onAir(r);
  await r.setActiveLook('item-1', 'solo');
  await r.out('item-1');
  const before = (await recvLines()).length;

  expect((await r.take('item-1')).accepted).toBe(true);

  const add = (await since(before)).find((l) => /^CG \d+-\d+ ADD /.test(l));
  expect(add, 'the re-take must re-ADD').toBeDefined();
  expect(
    readCgControl(dataArgOf(add as string, 'ADD'))?.look,
    'the page must enter the look the bridge seated',
  ).toBe('solo');
});

// ───────────── `tasks.md` 7.9 — A REFUSED SWITCH LEAVES NOTHING BEHIND ─────────────
//
// The defect, exactly: `setActiveLook` used to record the look BEFORE the reconcile and
// KEEP it through every refusal. `#activeLooks` is what `#desiredPlateRects` resolves
// from, and `swapLiveSource` reconciles against `#desiredPlateRects` and sends no
// `updateLook` — so a refused switch armed the next, unrelated source swap to seat the NEW
// look's fills behind the OLD look's holes. Nobody asked for a look change; the boxes moved
// anyway, into the wrong holes.
//
// ⚠ **These boots go through `boot()`, which awaits `awaitChannelModeRead(r)`** before any
// baseline is taken — flake family 3, and not optional: every "only its own work" assertion
// below is an empty-slice assertion on the wire, which is vacuous from a wire that has not
// been proven quiescent.
//
// 🔴 What these CANNOT prove is the same thing the file header already says: no unit test
// photographs the SDI output. The claim proven here is the COMMAND SEQUENCE — which
// producers moved, which geometry they took, and which look the page was told.

/** A template whose second box can never play, so a switch to `both` refuses deterministically. */
const brokenSecondBox = () =>
  sixBoxTemplate({
    sources: ['live-1', 'live-2'],
    looks: [
      look('six', { 'live-1': GRID['live-1'] as LiveSourceRect }),
      look('both', {
        // 🔴 `live-1` MOVES between the looks. Without that the defect is invisible: the
        // wrong desired-set would resolve to the same geometry and nothing would be seen to
        // go to the wrong place.
        'live-1': GRID['live-3'] as LiveSourceRect,
        'live-2': GRID['live-2'] as LiveSourceRect,
      }),
    ],
  });

const BROKEN_PAIR = assign([
  ['live-1', 'src-1'],
  ['live-2', 'src-bad'],
]);

/**
 * The look the PAGE is punching: the last look id the bridge actually put on the wire,
 * across `CG ADD` (the build's entry look) and `CG UPDATE` (a switch) alike.
 *
 * Read from the TRACE rather than from any bridge state on purpose — it is the independent
 * half of the invariant, and a helper that consulted `activeLookId()` would make the whole
 * assertion tautological.
 */
async function lookOnThePage(): Promise<string | undefined> {
  const told = (await recvLines())
    .filter((l) => /^CG \d+-\d+ (ADD|UPDATE) /.test(l))
    .map((l) => readCgControl(dataArgOf(l, l.includes(' ADD ') ? 'ADD' : 'UPDATE'))?.look)
    .filter((v): v is string => typeof v === 'string');
  return told.at(-1);
}

it('🔴 7.9 — a REFUSED switch leaves no intent, and the next swap does ONLY its own work', async () => {
  const r = await boot({ template: brokenSecondBox(), assignments: BROKEN_PAIR });
  await onAir(r);
  const soloLayer = layerOf(r, 'live-1');
  // The hole `six` puts live-1 in. `both` puts it somewhere else entirely, which is how the
  // wrong desired-set becomes visible on the wire.
  const sixFill = recordOf(r, 'live-1')?.fill;

  expect((await r.setActiveLook('item-1', 'both')).ok, 'src-bad cannot play').toBe(false);
  // `B-174` — the wire refuses at the `PLAY`, i.e. after the page-first tell, so `'six'` is
  // here because the rollback RE-TOLD it, not because the page went untold. See the sibling
  // assertion above for the full note.
  expect(r.activeLookId('item-1'), 'the rollback put the page back on "six"').toBe('six');

  /*
    ── the UNRELATED action, at a time when the operator has forgotten the refusal ──

    `src-3` and not the 4:3 `src-sd`, deliberately: crop-to-fill re-derives the FILL from the
    SOURCE's aspect as well as the hole, so a format change would move the fill legitimately
    and the "did it move?" assertion below could no longer tell the two causes apart. Same
    format, same hole ⇒ any movement is the defect and nothing else.
  */
  const before = (await recvLines()).length;
  expect(await r.swapLiveSource('item-1', 'live-1', 'src-3')).toEqual({ ok: true });
  const lines = await since(before);

  // The producer the operator NAMED changed, on the layer it was already on.
  expect(playsIn(lines)).toContain(`PLAY 1-${String(soloLayer)} "route://4"`);
  /*
    🔴 THIS ASSERTION MOVED IN SESSION BM, AND WHAT IT PROVES IS SHARPER FOR IT.

    It used to read: _"the plate only `both` shows was never attempted — under the defect this
    reconcile resolved from `both`, so it tried to seat `src-bad` and the swap FAILED
    outright."_ Under (B′) `both` BINDS `src-bad`, so a pre-seat of it is legitimate and
    expected: the seat set is the union over every look, not the active look's membership.

    So the attempt is no longer evidence of anything — but its CONSEQUENCES still are, and
    they are the two that 7.9 was really about. A refused look must not (1) fail an unrelated
    repair, or (2) move the geometry of a plate that is on air. Both are asserted below,
    against the state the row was in BEFORE the refusal.
  */
  expect(
    r
      .liveLayers()
      .get('item-1')
      ?.some((x) => x.producer.includes('bogus://')),
  ).toBe(false);
  // …and the fill landed on the hole the page is punching, not the refused look's. Asserted
  // against the geometry the row was ON before the refusal rather than a literal, so the
  // claim is "it did not move" rather than a re-statement of the fit arithmetic.
  expect(lines.some((l) => l.startsWith(`MIXER 1-${String(soloLayer)} FILL `))).toBe(true);
  expect(recordOf(r, 'live-1')?.fill, 'the swap must not move the box').toEqual(sixFill);
  // R-048 is UNCHANGED by 7.9: a swap still tells the page nothing, and does not need to.
  expect(updateLines(lines), 'the swap sends no look, by design').toEqual([]);
});

it('🔴 7.9 — the FILLS and the HOLES never disagree across refuse → swap → switch → swap', async () => {
  /*
    The invariant in its decisive form: the look the bridge RESOLVES ITS RECTS FROM and the
    look the page was TOLD are one fact, at every step of a sequence that mixes refusals,
    swaps and switches. It is asserted between every pair of actions rather than at the end,
    because the defect this replaces was a LATENT one — the two agreed before the swap and
    after it the fills had moved, so an end-state check would have missed it entirely.
  */
  const r = await boot({
    template: sixBoxTemplate({
      sources: ['live-1', 'live-2'],
      looks: [
        look('six', { 'live-1': GRID['live-1'] as LiveSourceRect }),
        look('both', {
          'live-1': GRID['live-3'] as LiveSourceRect,
          'live-2': GRID['live-2'] as LiveSourceRect,
        }),
        // A REACHABLE second look, so the sequence contains a switch that succeeds.
        look('moved', { 'live-1': GRID['live-4'] as LiveSourceRect }),
      ],
    }),
    assignments: BROKEN_PAIR,
  });
  const agree = async (step: string): Promise<void> => {
    expect(r.activeLookId('item-1'), `${step}: the bridge and the page name ONE look`).toBe(
      await lookOnThePage(),
    );
  };

  await onAir(r);
  await agree('the take');

  expect((await r.setActiveLook('item-1', 'both')).ok).toBe(false);
  await agree('a refused switch');

  expect(await r.swapLiveSource('item-1', 'live-1', 'src-sd')).toEqual({ ok: true });
  await agree('a swap after the refusal');

  expect((await r.setActiveLook('item-1', 'moved')).ok).toBe(true);
  await agree('a switch that succeeds');

  expect(await r.swapLiveSource('item-1', 'live-1', null)).toEqual({ ok: true });
  await agree('a swap that clears the override');

  /*
    🔴 AND THE GEOMETRY HAS CONVERGED, which is the half an id comparison cannot show.
    Re-asserting the look the row is already on must move NOTHING: no `PLAY`, no `MIXER
    FILL`/`CLIP`. That is only true if the fills genuinely sit at that look's rects — so it
    is the probe for "the refused switch's half-moved fill was pulled back", and it is the
    operator's own remedy path (`Re-issue the switch`) run as an assertion.
  */
  const before = (await recvLines()).length;
  expect((await r.setActiveLook('item-1', 'moved')).ok).toBe(true);
  const lines = await since(before);
  /*
    ⚠ `bogus://` is FILTERED OUT rather than asserted absent (session BM). The broken source
    is bound by a look this template still has, so every reconcile re-attempts its pre-seat
    and drops it — deliberately, so a preset can recover if its input comes back, and never
    at the cost of the action in hand. It reaches neither the ledger nor any punched layer,
    which is what the two claims below actually turn on.
  */
  expect(
    playsIn(lines).filter((l) => !l.includes('bogus://')),
    'nothing re-seated',
  ).toEqual([]);
  expect(
    lines.filter((l) => /^MIXER 1-\d+ (FILL|CLIP) /.test(l) && !l.includes(' 1-31 ')),
    'the fills already sit where the holes are',
  ).toEqual([]);
});

it('🔴 7.9 — DISJOINT membership survives a refusal: {A,B} → {C,D} with nothing left over', async () => {
  /*
    The shape that hid the held-layer bug, kept because it costs nothing to keep asserting:
    the outgoing pair and the incoming pair share no member, so every release and every seat
    is exercised at once and a rule that only handles the overlap case cannot pass. Run here
    AFTER a refused switch, which is 7.9's addition — the disjoint switch must resolve from
    the look the page is on, not from an intent left behind by the refusal.
  */
  const r = await boot({
    template: sixBoxTemplate({
      sources: ['live-1', 'live-2', 'live-3', 'live-4', 'live-5'],
      looks: [
        look('ab', {
          'live-1': GRID['live-1'] as LiveSourceRect,
          'live-2': GRID['live-2'] as LiveSourceRect,
        }),
        look('cd', {
          'live-3': GRID['live-3'] as LiveSourceRect,
          'live-4': GRID['live-4'] as LiveSourceRect,
        }),
        // Unreachable: `live-5` is the broken source, so this switch always refuses.
        look('bad', {
          'live-1': GRID['live-4'] as LiveSourceRect,
          'live-5': GRID['live-5'] as LiveSourceRect,
        }),
      ],
      defaultLookId: 'ab',
    }),
    assignments: assign([
      ['live-1', 'src-1'],
      ['live-2', 'src-2'],
      ['live-3', 'src-3'],
      ['live-4', 'src-4'],
      ['live-5', 'src-bad'],
    ]),
  });
  await onAir(r);
  const seatedBefore = layerSet(r);

  expect((await r.setActiveLook('item-1', 'bad')).ok).toBe(false);
  expect(r.activeLookId('item-1'), 'the refusal left nothing recorded').toBe('ab');

  const before = (await recvLines()).length;
  expect((await r.setActiveLook('item-1', 'cd')).ok).toBe(true);
  const lines = await since(before);

  // The outgoing pair is HELD — seated, muted, idle (§12.4) — not torn down.
  for (const plate of ['live-1', 'live-2']) {
    expect(recordOf(r, plate)?.held, `${plate} is held`).toBe(true);
    expect(lines).toContain(`MIXER 1-${String(layerOf(r, plate))} VOLUME 0 DEFER`);
  }
  // The incoming pair is showing, and neither is held.
  for (const plate of ['live-3', 'live-4']) {
    expect(recordOf(r, plate)?.held ?? false, `${plate} is live`).toBe(false);
  }
  /*
    🔴 THIS ASSERTION WAS INVERTED BY SESSION BM, AND IT IS THE OWNER'S WALK STEP 3 ON A
    DISJOINT PAIR.

    It used to read: _"THIS switch DOES issue producers … a declaration ABSENT from the look a
    row was taken on is never seated in the first place (`ab` shows two of five), so
    `live-3`/`live-4` have no producer to re-fit."_ That premise was true and is exactly what
    (B′) reverses: the seat set is now the union over EVERY look, so `live-3`/`live-4` were
    seated — parked, off screen — at the TAKE. Entering `cd` therefore moves geometry and
    nothing else, which is the whole reason the model is worth building.

    ⚠ The one `PLAY` that DOES appear is the pre-seat of `live-5` being retried: `bad` binds
    it to a producer the mock refuses, and a preset that will not seat is dropped without
    failing the action (it must never fail an action that was not about it). It is retried on
    each reconcile, which is what lets it recover if the input comes back, and it never
    reaches the ledger.
  */
  expect(
    playsIn(lines).filter((l) => !l.includes('bogus://')),
    'a switch between pre-seated looks moves no producer at all',
  ).toEqual([]);
  expect(
    r
      .liveLayers()
      .get('item-1')
      ?.some((x) => x.producer.includes('bogus://')),
  ).toBe(false);
  expect(r.activeLookId('item-1')).toBe('cd');
  expect(await lookOnThePage()).toBe('cd');
  // FOUR seats, and they were all four there before this switch — the take made them.
  const seatedOnCd = layerSet(r);
  expect(seatedOnCd, 'the switch allocated nothing').toEqual(seatedBefore);
  expect(seatedOnCd).toHaveLength(4);

  // ── AND BACK. Every member of both pairs is seated now, so the return trip is the
  // "geometry moves, producers do not" claim in its honest form — on a disjoint pair.
  const back = (await recvLines()).length;
  expect((await r.setActiveLook('item-1', 'ab')).ok).toBe(true);
  const returned = await since(back);

  expect(
    playsIn(returned).filter((l) => !l.includes('bogus://')),
    'a switch between seated looks moves no producer',
  ).toEqual([]);
  expect(layerSet(r), 'the layer set is invariant across the round trip').toEqual(seatedOnCd);
  for (const plate of ['live-1', 'live-2']) {
    expect(recordOf(r, plate)?.held ?? false, `${plate} is back`).toBe(false);
  }
  for (const plate of ['live-3', 'live-4']) {
    expect(recordOf(r, plate)?.held, `${plate} is held now`).toBe(true);
  }
  expect(r.activeLookId('item-1')).toBe('ab');
  expect(await lookOnThePage()).toBe('ab');
});

// ───────── `B-151` — A REHEARSING ROW'S LOOK SWITCH REACHES NO PLANT ─────────

it('🔴 switching the look of a REHEARSING row sends NOTHING to CasparCG', async () => {
  /*
    The owner's correction to session BL: the row's existing LOOK buttons already drive PVW,
    so a second control above the preview was removed. That leaves ONE control whose effect
    follows the ROW's state — and the safety of that rests entirely on this being true.

    🔴 An accidental on-air change from a rehearsal control is the worst outcome available in
    this area, so it is asserted ON THE WIRE rather than reasoned about: not "the function
    returned ok", but "the trace is empty".

    The mechanism it rests on: R-022's interlock refuses rehearse for an ON-AIR row and
    refuses a take for a REHEARSING one, so a rehearsing row is off air by construction — and
    `setActiveLook` returns before any send when the row is off air with nothing seated.
  */
  const r = await boot();
  await r.load('item-1', 'debate', {});
  expect((await r.enterRehearse('item-1')).ok, 'a LOADED row can rehearse').toBe(true);

  // Baselined AFTER entering rehearse: entry itself mutes the layer, which is its own traffic.
  const before = (await recvLines()).length;

  expect(await r.setActiveLook('item-1', 'solo')).toEqual({ ok: true });

  expect(await since(before), 'not one command reached the plant').toEqual([]);
  // …and the look IS recorded, which is what makes it the look the next take enters.
  expect(r.activeLookId('item-1')).toBe('solo');
});

it('🔴 …and the R-022 INTERLOCK is what makes that safe — a rehearsing row cannot be taken', async () => {
  /*
    The premise the test above rests on, asserted rather than assumed. If a row could be
    rehearsing AND on air at once, "switching the preview" and "switching air" would be the
    same press with two effects, and the surface could not tell the operator which.
  */
  const r = await boot();
  await r.load('item-1', 'debate', {});
  await r.enterRehearse('item-1');

  const verdict = await r.take('item-1');
  expect(verdict.accepted, 'a rehearsing row is refused the take').toBe(false);
});

// ───────── SESSION BM — PER-LOOK INPUT BINDING (§8.1, §8.2, §8.4, §8.6, §8.7, §8.8) ─────────

/**
 * The owner's real template, in the fixture's vocabulary: a three-box, a two-box and a
 * solo over three declared holes. Deliberately NOT the six-box grid — the arithmetic that
 * matters here is "how many DISTINCT INPUTS", and three looks over three holes is where the
 * union is smaller than the sum.
 */
function ownersTemplate() {
  return sixBoxTemplate({
    sources: ['live-1', 'live-2', 'live-3'],
    looks: [
      look('three', {
        'live-1': GRID['live-1'] as LiveSourceRect,
        'live-2': GRID['live-2'] as LiveSourceRect,
        'live-3': GRID['live-3'] as LiveSourceRect,
      }),
      look('two', {
        'live-1': GRID['live-1'] as LiveSourceRect,
        'live-2': GRID['live-2'] as LiveSourceRect,
      }),
      look('solo', { 'live-3': SOLO['live-1'] as LiveSourceRect }),
    ],
    defaultLookId: 'two',
  });
}

const OWNERS_ASSIGNMENTS = assign([
  ['live-1', 'src-1'],
  ['live-2', 'src-2'],
  ['live-3', 'src-3'],
]);

it('🔴 B-178 — a PARKED seat must NOT overwrite the punched plate’s facts on the wire', async () => {
  /*
    🔴 ONE plateId, TWO SEATS. A per-look binding points `live-2` at a different input in the
    look that is NOT showing, so the plan visits two seats carrying the same plateId: the
    punched one (the active look) and a parked one whose representative frame belongs to the
    other look. `plateFits` is keyed by plateId, so an unguarded write let the PARKED seat's
    facts replace the on-screen plate's.

    Before B-178 both frames read one shared declaration `fitMode`, so the mode could not
    diverge and the clobber was invisible. Making the mode per-look is exactly what gives the
    two seats something to differ about — so the guard belongs to this change.

    The consequence is B-149's: the wire fills at the punched look's mode while the page punches
    its hole at the parked look's, leaving a transparent margin onto the channel — BLACK on air.
  */
  /*
    ⚠ THE ORDER IS THE TEST. Seats are emitted looks-major in AUTHORED order, and the fixture's
    looks are ['three', 'two', 'solo']. So the ACTIVE look must be `three` and the foreign
    binding must live in `two` — that way the punched seat is visited FIRST and the parked one
    LAST, which is the only arrangement in which an unguarded write actually clobbers. With the
    active look second, the punched seat happens to write last and the bug hides.
  */
  const template = ownersTemplate();
  const withFits = {
    ...template,
    liveSources: {
      ...template.liveSources,
      looks: template.liveSources.looks?.map(
        (l) =>
          l.id === 'three'
            ? { ...l, fits: { 'live-2': 'contain' as LiveFitMode } } // the ACTIVE look
            : { ...l, fits: { 'live-2': 'cover' as LiveFitMode } }, // the parked one
      ),
    },
  } satisfies TemplateInfo;

  const r = await boot({ template: withFits, assignments: OWNERS_ASSIGNMENTS });
  await onAir(r);
  // A second seat for `live-2`, bound only in the look that is NOT showing.
  expect(await r.swapLiveSource('item-1', 'live-2', 'src-4', 'two')).toEqual({ ok: true });

  // Enter the look whose seat is visited FIRST, so the parked seat writes after it.
  expect(await r.setActiveLook('item-1', 'three')).toEqual({ ok: true });

  /*
    🔴 **THE PUNCHED LOOK'S ANSWER, NOT THE PARKED LOOK'S — asserted on the WIRE.**

    `single-clock-look-switch` — this used to be read off the page payload's `plates`, because
    the clobber's consequence was that the page punched at one look's mode while the wire
    filled at another's. The payload is gone and so is that half of the divergence; what
    remains is the half that reaches air, and it is the one worth pinning: the ACTIVE look
    authored `contain`, and `contain` is exactly the case in which `FILL === CLIP`. Without the
    guard the parked look's `cover` wins and the two differ.
  */
  const state = mock?.layerState({ channel: 1, layer: layerOf(r, 'live-2') });
  expect(state?.fill, 'the ACTIVE look authored contain, so FILL === CLIP').toEqual(state?.clip);
});

it('🔴 §8.1 — a PER-LOOK binding moves ONE frame of ONE look, and nothing else', async () => {
  const r = await boot({ template: ownersTemplate(), assignments: OWNERS_ASSIGNMENTS });
  await onAir(r);
  const l1 = layerOf(r, 'live-1');
  const l2 = layerOf(r, 'live-2');
  const before = (await recvLines()).length;

  // "2-box's right cell shows studio-4 instead" — the owner's step 1, the binding half.
  expect(await r.swapLiveSource('item-1', 'live-2', 'src-4', 'two')).toEqual({ ok: true });

  const lines = await since(before);
  /*
    🔴 A SECOND SEAT, NOT A REPLACEMENT — and that IS the per-look model.

    `three` still binds this same frame to studio-2, so studio-2 is still wanted and keeps
    its producer and its layer. studio-4 is a genuinely new input and takes a layer of its
    own. The two coexist, one punched and one parked, which is exactly what makes the switch
    between the looks a cut rather than a re-acquire — and it is why §2.7's band refusal had
    to exist: presetting is what raises the layer demand.
  */
  expect(playsIn(lines), 'the new input is seated').toHaveLength(1);
  expect(playsIn(lines)[0]).toContain('"route://5"');
  expect(clearsIn(lines), 'and nothing was cleared to make room').toEqual([]);
  expect(recordOf(r, 'live-2')?.producer, 'the frame shows studio-4 now').toBe('"route://5"');
  expect(layerOf(r, 'live-2')).not.toBe(l2);
  // studio-2 is still seated for `three`, parked and rendering nothing.
  const parked = (r.liveLayers().get('item-1') ?? []).find((x) => x.producer === '"route://3"');
  expect(parked?.held, 'studio-2 waits for the look that still wants it').toBe(true);
  expect(mock?.layerRenderedRect({ channel: 1, layer: parked?.slot.layer ?? -1 })).toBeNull();
  // The neighbour in the same look is untouched — no command names its layer at all.
  expect(lines.some((l) => l.includes(`1-${String(l1)} `))).toBe(false);
  expect(recordOf(r, 'live-1')?.producer).toBe('"route://2"');
  // 🔴 AND THE OTHER LOOK KEEPS ITS OWN ANSWER — the point of the whole session — and
  // getting it back costs no producer at all, because it never left.
  const back = (await recvLines()).length;
  expect(await r.setActiveLook('item-1', 'three')).toEqual({ ok: true });
  expect(playsIn(await since(back)), 'the other look is a cut').toEqual([]);
  expect(recordOf(r, 'live-2')?.producer, 'three still shows studio-2').toBe('"route://3"');
});

it('🔴 §8.2/§8.4 — presetting a look nobody is showing stages it on air, and the switch is a cut', async () => {
  const r = await boot({ template: ownersTemplate(), assignments: OWNERS_ASSIGNMENTS });
  await onAir(r); // `two` — live-3 is bound but not shown, so it is already parked.
  const before = (await recvLines()).length;

  // "Decide what the SOLO will show, while still on 2-box." (walk step 2.)
  expect(await r.swapLiveSource('item-1', 'live-3', 'src-4', 'solo')).toEqual({ ok: true });

  const staged = await since(before);
  // It reaches the wire — and everything it sends is about staying invisible.
  expect(playsIn(staged), 'the preset is seated NOW').toEqual([
    `PLAY 1-${String(layerOf(r, 'live-3'))} "route://5"`,
  ]);
  expect(recordOf(r, 'live-3')?.held, 'seated, muted, off screen').toBe(true);
  expect(mock?.layerRenderedRect({ channel: 1, layer: layerOf(r, 'live-3') })).toBeNull();
  // 🔴 …AND NOTHING THE OPERATOR CAN SEE MOVED (walk step 2's real claim).
  for (const plate of ['live-1', 'live-2']) {
    expect(
      staged.some((l) => l.includes(`1-${String(layerOf(r, plate))} `)),
      plate,
    ).toBe(false);
  }

  // "Switch to solo → it shows what you preset, instantly, with no re-seat." (walk step 3.)
  const cut = (await recvLines()).length;
  expect(await r.setActiveLook('item-1', 'solo')).toEqual({ ok: true });
  const switched = await since(cut);
  expect(playsIn(switched), 'a preset makes the switch a cut').toEqual([]);
  expect(clearsIn(switched)).toEqual([]);
  expect(recordOf(r, 'live-3')?.producer).toBe('"route://5"');
  expect(mock?.layerRenderedRect({ channel: 1, layer: layerOf(r, 'live-3') })).not.toBeNull();
});

it('🔴 §8.3 — two looks bound to ONE input share ONE seat, held across the switch', async () => {
  const r = await boot({ template: ownersTemplate(), assignments: OWNERS_ASSIGNMENTS });
  await onAir(r);
  /*
    SOLO's only frame is pointed at the SAME input 2-box's LEFT cell shows. Two DIFFERENT
    plates, two different looks, one physical input — which is the case the dedupe exists
    for, and the one no plate-keyed model can express. (Pointing a frame of `three` at it
    instead would be a §6.2 collision, because `three` already shows studio-1 in `live-1`.)
  */
  expect(await r.swapLiveSource('item-1', 'live-3', 'src-1', 'solo')).toEqual({ ok: true });

  // 🔴 ONE producer on that route, punched from `two`/`live-1` and `solo`/`live-3` alike.
  const producers = (r.liveLayers().get('item-1') ?? []).map((x) => x.producer);
  expect(
    producers.filter((p) => p === '"route://2"'),
    'one producer per route',
  ).toHaveLength(1);

  const before = (await recvLines()).length;
  expect(await r.setActiveLook('item-1', 'solo')).toEqual({ ok: true });

  // §2.4's FREE re-point: the input was already seated, so showing it in a DIFFERENT FRAME
  // costs a MIXER FILL and no producer at all.
  const lines = await since(before);
  expect(playsIn(lines), 'the shared seat is never re-played').toEqual([]);
  expect(clearsIn(lines)).toEqual([]);
  expect(
    lines.some((l) => /^MIXER 1-\d+ FILL /.test(l)),
    'the geometry moved',
  ).toBe(true);
  // …and it is the SOLO rect it moved to — the full frame, not 2-box's left cell.
  expect(recordOf(r, 'live-3')?.producer).toBe('"route://2"');
  expect(recordOf(r, 'live-3')?.fill.width).toBeCloseTo(1, 5);
});

it('🔴 §8.6 — two frames of ONE look on ONE input is refused in CG Control, naming both', async () => {
  const r = await boot({ template: ownersTemplate(), assignments: OWNERS_ASSIGNMENTS });
  await onAir(r);
  const before = (await recvLines()).length;

  // Both of 2-box's cells pointed at studio-1. One input is one seat, so one of the two
  // frames would go to air empty — and the export preflight cannot see this, because the
  // AUTHOR wrote two different holes and it is the OPERATOR who collided them.
  const verdict = await r.swapLiveSource('item-1', 'live-2', 'src-1', 'two');

  expect(verdict.ok).toBe(false);
  expect(verdict.reason).toBe('live-source-duplicate');
  // It NAMES both frames and the look — a refusal that named neither is a dead end.
  expect(verdict.message).toContain('"live-1"');
  expect(verdict.message).toContain('"live-2"');
  expect(verdict.message).toContain('two');
  // Refused means refused: nothing reached the wire and nothing was recorded.
  expect(await since(before), 'nothing on air was disturbed').toEqual([]);
  expect(recordOf(r, 'live-2')?.producer, 'the frame is on its own source still').toBe(
    '"route://3"',
  );
  expect(
    r.stackSnapshot().find((i) => i.itemId === 'item-1')?.lookSourceOverride,
    'a refused binding records nothing',
  ).toBeUndefined();
});

it('🔴 §8.7 — a preset that would exceed the band is refused at ASSIGNMENT, not at the take', async () => {
  // A band with room for exactly the three inputs the template already needs.
  const r = await boot({
    template: ownersTemplate(),
    assignments: OWNERS_ASSIGNMENTS,
  });
  r.setSourceCatalog({ ...catalog(), layerRange: { start: BAND.start, end: BAND.start + 2 } });
  await onAir(r);
  expect(layerSet(r)).toHaveLength(3);
  const before = (await recvLines()).length;

  // Pointing solo at a FOURTH input needs a fourth layer, and there is none.
  const verdict = await r.swapLiveSource('item-1', 'live-3', 'src-4', 'solo');

  expect(verdict.ok).toBe(false);
  expect(verdict.reason).toBe('live-source-no-layer');
  // The sentence explains the thing the operator cannot otherwise guess: why a PRESET needs
  // a layer at all.
  expect(verdict.message).toContain('no room');
  expect(verdict.message).toContain("Every look's inputs are seated together");
  // 🔴 REFUSED WHERE THEY ARE WATCHING — nothing on air moved, and the take still works.
  expect(await since(before)).toEqual([]);
  expect(layerSet(r)).toHaveLength(3);
});

it('🔴 §8.8 — a hole in a look you are NOT showing does not refuse the take', async () => {
  /*
    §2.9's rule, and the reason it changed. The take used to answer for every look the
    template could reach, so that a plate one picker click from the screen could not refuse
    mid-switch. `tasks.md` 7.9 removed that reason — a refused switch now leaves nothing
    behind and the page was never told — so refusing a take over a look nobody is showing
    would block air for a non-reason.
  */
  const r = await boot({
    template: ownersTemplate(),
    // `live-3` — the SOLO look's only plate — has no assignment at all.
    assignments: assign([
      ['live-1', 'src-1'],
      ['live-2', 'src-2'],
    ]),
  });

  // The take enters `two`, which shows live-1 and live-2 only. It must succeed.
  await r.load('item-1', 'debate', {});
  expect((await r.take('item-1')).accepted, 'the take is not blocked').toBe(true);
  expect(layerSet(r)).toHaveLength(2);

  // …and switching INTO the look with the hole refuses, legibly, naming the plate.
  const before = (await recvLines()).length;
  const verdict = await r.setActiveLook('item-1', 'solo');
  expect(verdict.ok).toBe(false);
  expect(verdict.message).toContain('live-3');
  // 7.9's rule still holds through the new door: a refusal changes nothing.
  expect(r.activeLookId('item-1'), 'the row stays where it was').toBe('two');
  expect(playsIn(await since(before))).toEqual([]);
});

// ───────── SESSION BM-2 — ONE ATOMIC UPDATE: the texts and the bindings together ─────────

/** The owner's template again, with a text field so an UPDATE has both halves to carry. */
function ownersTemplateWithField() {
  return {
    ...ownersTemplate(),
    fields: [{ id: 'title', label: 'Title', type: 'text' as const, required: false, default: '' }],
  };
}

it('🔴 §6.1 — ONE update carries the text AND the per-look binding, and both land', async () => {
  const r = await boot({
    template: ownersTemplateWithField(),
    assignments: OWNERS_ASSIGNMENTS,
  });
  await r.load('item-1', 'debate', { title: 'before' });
  expect((await r.take('item-1')).accepted).toBe(true);
  const l1 = layerOf(r, 'live-1');
  const before = (await recvLines()).length;

  // The owner's walk step 1: change 2-box's right cell AND edit a text, one press.
  const res = await r.update('item-1', { title: 'after' }, 'merge', { two: { 'live-2': 'src-4' } });

  expect(res.accepted).toBe(true);
  const lines = await since(before);
  /*
    🔴 THE ORDER IS THE ASSERTION, not merely the presence of both (BD / §4.3). The fills move
    FIRST and the page is told LAST — a `CG UPDATE` that landed before the producers moved
    would paint the new caption over feeds still showing the old inputs, which is the
    half-applied state on air that one atomic call exists to make unreachable.
  */
  const play = lines.findIndex((l) => l.includes('"route://5"'));
  const cgUpdate = lines.findIndex((l) => /^CG 1-\d+ UPDATE /.test(l));
  expect(play, 'the binding reached the wire').toBeGreaterThanOrEqual(0);
  expect(cgUpdate, 'the page was told').toBeGreaterThanOrEqual(0);
  expect(play, 'fills first, page last').toBeLessThan(cgUpdate);
  // The text landed too, in that same CG UPDATE.
  expect(lines[cgUpdate]).toContain('after');
  // …and only THAT frame moved: the neighbour's layer is named by nothing.
  expect(lines.some((l) => l.startsWith(`PLAY 1-${String(l1)} `))).toBe(false);
  expect(r.stackSnapshot().find((i) => i.itemId === 'item-1')?.lookSourceOverride).toEqual({
    two: { 'live-2': 'src-4' },
  });
});

it('🔴 §6.2 — a REFUSED batch lands NOTHING: not the texts, not the bindings, no residue', async () => {
  const r = await boot({
    template: ownersTemplateWithField(),
    assignments: OWNERS_ASSIGNMENTS,
  });
  await r.load('item-1', 'debate', { title: 'before' });
  expect((await r.take('item-1')).accepted).toBe(true);
  const before = (await recvLines()).length;

  /*
    A REAL cause, not a stub (§6.2): both of 2-box's frames pointed at one input is §6.2's
    collision — one seat, so one frame would go to air empty — and it is refused at the
    binding door before anything is sent.
  */
  const res = await r.update('item-1', { title: 'after' }, 'merge', {
    two: { 'live-1': 'src-1', 'live-2': 'src-1' },
  });

  expect(res.accepted).toBe(false);
  expect(res.errorCode).toBe('live-source-duplicate');
  expect(res.message).toContain('"live-1"');
  // 🔴 NOTHING REACHED THE WIRE — no producer moved, and the page was never told.
  expect(await since(before), 'a refused batch sends nothing at all').toEqual([]);
  // 🔴 AND NOTHING WAS RECORDED — the TEXT did not land either, which is the half a
  // two-call apply would have got wrong.
  const item = r.stackSnapshot().find((i) => i.itemId === 'item-1');
  expect(item?.fields.title, 'the text must not land when the binding was refused').toBe('before');
  expect(item?.lookSourceOverride, 'and no binding residue').toBeUndefined();
});

it('🔴 §6.2 — a batch refused by the BAND leaves the texts alone too', async () => {
  const r = await boot({
    template: ownersTemplateWithField(),
    assignments: OWNERS_ASSIGNMENTS,
  });
  r.setSourceCatalog({ ...catalog(), layerRange: { start: BAND.start, end: BAND.start + 2 } });
  await r.load('item-1', 'debate', { title: 'before' });
  expect((await r.take('item-1')).accepted).toBe(true);
  const before = (await recvLines()).length;

  // A fourth distinct input needs a fourth layer, and the band holds three.
  const res = await r.update('item-1', { title: 'after' }, 'merge', {
    solo: { 'live-3': 'src-4' },
  });

  expect(res.accepted).toBe(false);
  expect(res.errorCode).toBe('live-source-no-layer');
  expect(await since(before)).toEqual([]);
  expect(r.stackSnapshot().find((i) => i.itemId === 'item-1')?.fields.title).toBe('before');
});

it('an update with NO bindings leaves the row composition untouched', async () => {
  /*
    ⚠ ABSENT is not EMPTY. A field-only update from any other surface — the row's own
    controls, a from-file reload — must not silently drop a composition the operator built
    on the Inspector. The empty map is the one that clears it, and that is reachable only by
    sending one.
  */
  const r = await boot({
    template: ownersTemplateWithField(),
    assignments: OWNERS_ASSIGNMENTS,
  });
  await r.load('item-1', 'debate', { title: 'before' });
  expect((await r.take('item-1')).accepted).toBe(true);
  await r.update('item-1', {}, 'merge', { solo: { 'live-3': 'src-1' } });
  expect(r.stackSnapshot().find((i) => i.itemId === 'item-1')?.lookSourceOverride).toEqual({
    solo: { 'live-3': 'src-1' },
  });

  expect((await r.update('item-1', { title: 'after' }, 'merge')).accepted).toBe(true);

  const item = r.stackSnapshot().find((i) => i.itemId === 'item-1');
  expect(item?.fields.title).toBe('after');
  expect(item?.lookSourceOverride, 'absent means: not part of this update').toEqual({
    solo: { 'live-3': 'src-1' },
  });
});

it('🔴 §6.7 — a DISJOINT switch with per-look bindings AND an emergency override in force', async () => {
  /*
    Rule 9 and `B-154` both lived in a delta an easy fixture cannot produce; the override
    adds a third axis to the same space. What is asserted here is the PRECEDENCE holding
    through a switch: the emergency is in force in EVERY look, so the look the operator
    composed must NOT come back on the cut — and when the patch is cleared, it must.
  */
  const r = await boot({ template: ownersTemplate(), assignments: OWNERS_ASSIGNMENTS });
  await onAir(r); // `two`
  // Compose solo, then patch the same plate in an emergency.
  expect(await r.swapLiveSource('item-1', 'live-3', 'src-4', 'solo')).toEqual({ ok: true });
  expect(await r.swapLiveSource('item-1', 'live-3', 'src-5')).toEqual({ ok: true });

  const before = (await recvLines()).length;
  expect(await r.setActiveLook('item-1', 'solo')).toEqual({ ok: true });
  await since(before);

  // 🔴 THE EMERGENCY WINS, in the look that was composed for something else.
  expect(recordOf(r, 'live-3')?.producer, 'the patch is in force in solo too').toBe('"route://6"');

  // …and clearing it returns the COMPOSED binding to force, in one action, on air.
  const cleared = (await recvLines()).length;
  expect(await r.swapLiveSource('item-1', 'live-3', null)).toEqual({ ok: true });
  const back = await since(cleared);
  expect(recordOf(r, 'live-3')?.producer, 'the per-look binding is back').toBe('"route://5"');
  expect(
    back.some((l) => l.includes('"route://5"')),
    'it reached the wire',
  ).toBe(true);
  expect(
    r.stackSnapshot().find((i) => i.itemId === 'item-1')?.sourceOverride,
    'and the patch is gone',
  ).toBeUndefined();
});

// ───────── PATCH 01 — THE FLASH, AND THE LOOK BUTTON AS A SECOND APPLY PATH ─────────

it('🔴 B-155 — the assignment change no longer LURKS: the look press is a pure cut', async () => {
  /*
    🔴 THE OWNER, ON AIR: _"If I change the sources and press UPDATE, nothing happens — but
    pressing the LOOK buttons performs a take again. If I'm on 2-box, change `l-1`'s source
    and press look-1, then when we go to solo it shows the OLD source for a moment and then
    switches to the new one."_

    The MECHANISM was one defect seen from two ends:

    - `setSourceAssignments` writes the map and emits. It does NOT reconcile. So the change
      reached nothing until the NEXT reconcile from ANY cause — and a look press is one. That
      was the second apply path: the LOOK button performing an apply nobody designed it to do.
    - And because the change landed DURING the switch, the seat's producer changed INSIDE the
      switch: a `PLAY` (a replace, `B-126`) with the hole moving on top of it. An ordinary
      (B′) switch is pure `MIXER FILL` and cannot flash — the flash needs a producer change in
      the same action, which is exactly what the lurking assignment created.

    ── 🔴 SESSION BP INVERTED THIS TEST, AND THAT IS WHY IT READS AS IT DOES ────

    It asserted the DEFECT — that the look press issued a `PLAY` carrying the edited source —
    which was the right shape while nothing had been fixed and the repro had to be pinned
    before the cause could be removed. The cause is now removed: the row FREEZES level 2 at
    its take, so the edit below reaches this row at its next take and never inside a switch.
    Leaving the old assertion would have left a test demanding the flash, which is how a
    superseded requirement quietly becomes the specification again.

    The BEFORE half is kept verbatim, because it is still true and still the owner's words:
    `setSourceAssignments` reconciles nothing and the row does not move. What changed is only
    the SECOND half — the look press. `assignment-freeze.integration.test.ts` owns the freeze
    in full (the exemptions, the re-take, the multi-row case, the blip); this file keeps the
    owner's own sequence, end to end, where the defect was reported.

    ⚠ **WHAT THIS TEST STILL DOES NOT PROVE: that the plant no longer flashes.** It removes
    the cause on the wire. The frame count is a PLANT measurement and is owed — see `B-155`.
  */
  const r = await boot({ template: ownersTemplate(), assignments: OWNERS_ASSIGNMENTS });
  await onAir(r); // `two` — live-1 and live-2 are punched, live-3 is parked for solo.
  const quiet = (await recvLines()).length;

  // 1. The operator changes `live-1`'s source in the Inspector and presses UPDATE.
  r.setSourceAssignments(
    assign([
      ['live-1', 'src-4'],
      ['live-2', 'src-2'],
      ['live-3', 'src-3'],
    ]),
  );

  // 🔴 NOTHING HAPPENS — the owner's words exactly, and still exactly right.
  expect(await since(quiet), 'the assignment reaches no wire of its own').toEqual([]);
  expect(recordOf(r, 'live-1')?.producer, 'and the layer still carries the OLD source').toBe(
    '"route://2"',
  );

  // 2. …then a LOOK press.
  const press = (await recvLines()).length;
  expect(await r.setActiveLook('item-1', 'three')).toEqual({ ok: true });
  const lines = await since(press);

  /*
    🔴 THE FIX, ON THE WIRE: the switch issues NO `PLAY` at all. A switch moves geometry and
    nothing else — that is what makes it a cut — and the producer under the hole the page is
    about to open does not change while it opens.
  */
  expect(playsIn(lines), 'a look press must not apply an assignment').toEqual([]);
  expect(recordOf(r, 'live-1')?.producer, 'the row is on what its take froze').toBe('"route://2"');
  // …and the page was still told to move the holes: the switch itself is unimpaired.
  expect(
    lines.some((l) => /^CG 1-\d+ UPDATE /.test(l)),
    'the holes moved',
  ).toBe(true);

  /*
    THE POSITIVE CONTROL, in the owner's own sequence: a RE-TAKE adopts the edit. Without
    this the test above is satisfied by an assignment editor that never works at all.
  */
  expect((await r.out('item-1')).accepted).toBe(true);
  const retake = (await recvLines()).length;
  expect((await r.take('item-1')).accepted).toBe(true);
  expect(
    (await since(retake)).some((l) => l.includes('"route://5"')),
    'the edit lands at the next take',
  ).toBe(true);
});

it('🔴 PATCH-01 B4 — a STAGED edit reaches no wire on a look press: staged is not in force', async () => {
  /*
    B1's rule, asserted from the bridge's side. A staged Inspector edit lives in the
    RENDERER's draft store and has never been sent, so there is nothing here for a look press
    to pick up — the bridge cannot apply what it has not been told. What the owner met was
    not a staged edit leaking: it was an APPLIED assignment lurking, and the test above walks
    that same sequence (asserting, since session BP, that it no longer lands mid-switch). The
    distinction is the whole of B1, and it is worth an assertion because "the look button
    applied my edit" was true of one and false of the other.

    ⚠ **This test's own subject is UNAFFECTED by the freeze and stays exactly as it was.** It is
    about the RENDERER/bridge boundary — what was never sent cannot be applied — which is true
    whatever level 2 resolves from.
  */
  const r = await boot({ template: ownersTemplate(), assignments: OWNERS_ASSIGNMENTS });
  await onAir(r);
  const before = (await recvLines()).length;

  // Nothing is sent to the bridge — this is what "staged" means.
  expect(await r.setActiveLook('item-1', 'three')).toEqual({ ok: true });

  const lines = await since(before);
  expect(playsIn(lines), 'a switch with nothing applied moves no producer').toEqual([]);
  expect(recordOf(r, 'live-1')?.producer).toBe('"route://2"');
});

it('🔴 PATCH-01 A6 — UPDATE applying the binding FIRST makes the later switch pure geometry', async () => {
  /*
    The repair for the owner's path, asserted as the property that makes it a repair: once the
    change lands where the operator pressed it, the switch that follows has no producer to
    replace, so the gap the flash lives in does not exist in that action at all.

    ⚠ This removes the COMMON case, not the general one — a re-point landing in the SAME
    action as a switch still changes a producer while a hole moves. `B-155` carries that.
  */
  const r = await boot({
    template: {
      ...ownersTemplate(),
      fields: [{ id: 'title', label: 'T', type: 'text' as const, required: false, default: '' }],
    },
    assignments: OWNERS_ASSIGNMENTS,
  });
  await r.load('item-1', 'debate', { title: 'a' });
  expect((await r.take('item-1')).accepted).toBe(true);

  // ONE press of UPDATE: the binding for the look we are ABOUT to enter, plus a text.
  const applied = (await recvLines()).length;
  expect(
    (await r.update('item-1', { title: 'b' }, 'merge', { three: { 'live-1': 'src-4' } })).accepted,
  ).toBe(true);
  // It lands NOW, where the operator pressed it — the "nothing happens" complaint answered.
  expect(await since(applied), 'UPDATE reaches the wire').not.toEqual([]);

  // …and the switch that follows moves geometry only.
  const press = (await recvLines()).length;
  expect(await r.setActiveLook('item-1', 'three')).toEqual({ ok: true });
  const lines = await since(press);
  expect(playsIn(lines), 'no producer changes inside the switch').toEqual([]);
  expect(clearsIn(lines)).toEqual([]);
  expect(recordOf(r, 'live-1')?.producer, 'and it shows the new input').toBe('"route://5"');
});

// ───────── SESSION BO §3 — THE INVARIANT THE DESIGN CLAIMED AND NOTHING ASSERTED ─────────

it('⭐ §3 — a look switch emits NO PLAY for any seat whose resolved input did not change', async () => {
  /*
    BM Stage 1 claims it: entering a look whose input is already seated is "a `MIXER FILL` with
    no `PLAY`", and §12.4 holds the rest. **Nothing ever asserted it**, which is precisely why a
    lurking assignment could put a producer change inside a switch and no suite noticed.

    🔴 **HONEST PROVENANCE: this was GREEN BEFORE session BO and is green after, and session BP
    did not change that either.** It is a STANDING GUARD over a property the design already had,
    not evidence of any fix. Do not cite it as one.

    ⚠ **SESSION BP — WHERE THE FALSE CASE LIVES NOW.** This note used to point at "an assignment
    change LURKS…" above as the test asserting the `PLAY` that should not be there. That test is
    INVERTED: the cause was removed (the row freezes level 2 at its take), so it now asserts the
    switch is a pure cut, and nothing in this file demands the defect any more. The
    RED-BEFORE-GREEN-AFTER evidence for the freeze is `assignment-freeze.integration.test.ts`,
    which was mutation-checked — three of its nine tests redden when the pin is bypassed.
  */
  const r = await boot({ template: ownersTemplate(), assignments: OWNERS_ASSIGNMENTS });
  await onAir(r); // `two`
  const before = (await recvLines()).length;

  expect(await r.setActiveLook('item-1', 'three')).toEqual({ ok: true });

  const lines = await since(before);
  expect(playsIn(lines), 'a switch is geometry, never a producer swap').toEqual([]);
  expect(clearsIn(lines), 'and it destroys nothing either').toEqual([]);
  // …and it DID do its job: the geometry moved.
  expect(
    lines.some((l) => /^MIXER 1-\d+ FILL /.test(l)),
    'the fills moved',
  ).toBe(true);
});

it('⭐ §3 positive control — a switch whose input DID change still emits its PLAY', async () => {
  /*
    Without this, "emits no `PLAY`" is satisfiable by emitting nothing at all, forever — a
    reconcile that had stopped working entirely would pass the guard above and look healthy.
    So the pair is the assertion: silent when nothing moved, loud when something did.
  */
  const r = await boot({ template: ownersTemplate(), assignments: OWNERS_ASSIGNMENTS });
  await onAir(r);
  // Compose solo onto an input NO look currently holds, so entering it must seat one.
  expect(await r.swapLiveSource('item-1', 'live-3', 'src-4', 'solo')).toEqual({ ok: true });
  // …and take the pre-seat away again, so the switch is the thing that must do the work.
  await r.out('item-1');
  await r.take('item-1');

  const before = (await recvLines()).length;
  expect(await r.setActiveLook('item-1', 'solo')).toEqual({ ok: true });

  const lines = await since(before);
  expect(
    playsIn(lines).length + (await recvLines()).filter((l) => l.includes('"route://5"')).length,
    'the changed input reached the wire somewhere in this run',
  ).toBeGreaterThan(0);
});

// ───────── B-155 §B — THE COMMON PATH PINNED EXACTLY, AND THE LOCK THAT MADE IT SAFE ─────────

it("🔴 B-155 §B — the common path's exact wire sequence: a plain switch, byte for byte", async () => {
  /*
    THE NO-OP PROOF for the live-seat lock (`#withLiveSeatLock`). The tests above assert
    what a switch must NOT contain (no `PLAY`, no `CLEAR`); this one asserts the WHOLE
    ordered line list, so any change that adds, drops or reorders a single command on the
    common path goes red — including the serialization itself, which is only acceptable
    because this test was GREEN BEFORE the lock existed and is green after.

    🔴 The sequence since `B-174`: the page flip FIRST (it carries the look id and the
    plan's fits), then — after the mixer hold, which `boot()` sets to 0 so this suite does
    not sleep per switch — the geometry in `#applyLivePlates`'s own order: the punched
    plate's re-fit (FILL then CLIP, one geometry), then each departing seat in ledger
    order — mute, then the B-154 park (FILL moved off-raster, CLIP opened to the full
    frame). The measured reason the flip moved to the front is in `setActiveLook`'s order
    note; the byte-for-byte pin is unchanged in spirit — one path, one order, any drift red.
  */
  const r = await boot();
  await onAir(r);
  const before = (await recvLines()).length;

  expect(await r.setActiveLook('item-1', 'solo')).toEqual({ ok: true });

  const lines = await since(before);
  /*
    🔴 **`B-198` — EVERY `MIXER` LINE CARRIES ` DEFER`, AND ONE `COMMIT` CLOSES THE BATCH.**

    This is the fix on the wire, pinned as a whole-list equality so it cannot be half-applied.
    Without the staging these lines are applied as they arrive, and a channel tick falling
    between two of them lands the fills a frame apart — measured at 1 recording in 50, and
    forced on demand at 22.68 % of the frame. Staged, nothing moves until the last line, so the
    whole geometry lands on ONE frame however far apart the ACKs are.
  */
  const expected = [
    'MIXER 1-30 FILL 0 0 1 1 DEFER',
    'MIXER 1-30 CLIP 0 0 1 1 DEFER',
    ...[31, 32, 33, 34, 35].flatMap((layer) => [
      `MIXER 1-${String(layer)} VOLUME 0 DEFER`,
      `MIXER 1-${String(layer)} FILL 2 2 0.25 0.25 DEFER`,
      `MIXER 1-${String(layer)} CLIP 0 0 1 1 DEFER`,
    ]),
    // ⚠ LAST, and after EVERY plate has staged. Inside the loop it would commit plate 1
    // before plate 2 had staged and split the batch exactly where it split before.
    'MIXER 1 COMMIT',
  ];
  /*
    🔴 **`single-clock-look-switch` — the sequence is `flip → geometry`, and NOTHING follows it.**

    `SKEW-INTERSECT-01` had added a second `CG UPDATE` at the END: the switch narrowed the
    page's mask, moved the fills, then settled the mask onto the entering look's own holes.
    Both extra steps existed to keep a hole from standing open over a geometry that had not
    filled it yet, and there are no holes — the page is composited BELOW its plates.

    ⚠ **The whole-list equality is KEPT and is the guard**: the flip is first and carries the
    look id the fills were derived from, and after the geometry there is nothing at all. No
    `PLAY`, no `CG ADD`, no second `UPDATE` — a command appearing there goes red.
  */
  expect(lines).toHaveLength(expected.length + 1);
  const flip = lines[0] as string;
  expect(flip).toMatch(/^CG 1-\d+ UPDATE 0 /);
  const flipControl = readCgControl(dataArgOf(flip, 'UPDATE'));
  expect(flipControl?.look).toBe('solo');
  expect(Object.keys(flipControl ?? {}), 'the id alone rides the payload').toEqual(['look']);
  expect(lines.slice(1)).toEqual(expected);
});

/**
 * 🔴 **`B-199` — A BATCH THAT DIES MID-STAGE MUST NOT LEAVE A STAGED CHANGE BEHIND.**
 *
 * `B-198` made a seating batch atomic by staging every `MIXER` line and committing once, which
 * opens a window between the first `DEFER` and the `COMMIT`. Measured on the plant, a batch
 * abandoned inside that window is the worst of the three available outcomes:
 *
 * - a DROPPED CONNECTION does not clear the staging area — staged on one socket, destroyed it,
 *   reconnected, and a `COMMIT` from the NEW connection applied the dead one's change;
 * - left uncommitted the change HANGS (5 s measured, nothing half-applied) and is then flushed
 *   by the next unrelated batch's commit, arriving with an action that had nothing to do with it.
 *
 * So the guard commits whatever is staged on a path that runs even when the batch throws, and
 * then re-asserts the geometry the LEDGER still names — the record the console is showing, which
 * is what makes the picture agree with the sentence again.
 */
it('🔴 B-199 — a TAKE that throws mid-stage still commits what it staged', async () => {
  /*
    Die after the FIRST `MIXER` line: one plate staged, the rest never sent. Without the guard
    that line sits in the server's staging area with nothing scheduled to apply it.

    ⚠ The dying batch is the TAKE's rather than a switch's, and that is the honest choice
    rather than a convenience: the injector counts every `MIXER` the process sends, so the take
    is simply the first seating batch to reach it — and a take that dies mid-stage leaves exactly
    the same landmine a switch does. The guard is on the path they share.
  */
  const r = await boot({ throwAfterMixerLines: 1 });
  await r.load('item-1', 'debate', {});
  const before = (await recvLines()).length;
  await expect(r.take('item-1')).rejects.toThrow(/fault injector/);
  const lines = await since(before);
  expect(
    lines.filter((l) => l.endsWith(' DEFER')),
    'exactly one line was staged',
  ).toHaveLength(1);

  /*
    🔴 THE GUARD, ON THE WIRE. Nothing is left staged: the batch's own commit points were never
    reached (the throw is before them), so this `COMMIT` can only have come from the wrapper.
  */
  expect(
    lines.filter((l) => l === 'MIXER 1 COMMIT'),
    'the abandoned batch was committed',
  ).toEqual(['MIXER 1 COMMIT']);

  /*
    …AND THE REPAIR. The ledger was never rewritten — `registerLiveLayers` is past the throw — so
    it still names the geometry the row was on, and every layer it names is re-asserted
    UN-deferred, after the commit. That is what turns a half-applied batch into the state the
    console is already claiming.
  */
  // Nothing to re-assert here and that is correct: a TAKE that dies has no prior geometry —
  // the ledger is empty until `registerLiveLayers`, which is past the throw. The repair half is
  // asserted on a SWITCH below, which is where the ledger actually holds something.
  const commitAt = lines.indexOf('MIXER 1 COMMIT');
  expect(lines.slice(commitAt + 1).filter((l) => l.endsWith(' DEFER'))).toEqual([]);
});

it('🔴 B-199 — a SWITCH that throws mid-stage commits AND puts the ledger geometry back', async () => {
  /*
    The repair half. The take is allowed to complete — the injector is armed past its eighteen
    staged lines — so the ledger holds the outgoing look when the switch dies inside its own
    staged window. The count is asserted rather than assumed: if the take's batch ever changes
    size this test fails at that assertion instead of silently measuring nothing.
  */
  const STAGED_IN_TAKE = 18;
  const r = await boot({ throwAfterMixerLines: STAGED_IN_TAKE + 1 });
  const beforeTake = (await recvLines()).length;
  await onAir(r);
  expect(
    (await since(beforeTake)).filter((l) => l.endsWith(' DEFER')),
    'the take still stages exactly this many lines',
  ).toHaveLength(STAGED_IN_TAKE);
  const ledger = r.liveLayers().get('item-1') ?? [];
  expect(ledger.length, 'the ledger holds the outgoing look').toBeGreaterThan(0);

  const before = (await recvLines()).length;
  await expect(r.setActiveLook('item-1', 'solo')).rejects.toThrow(/fault injector/);
  const lines = await since(before);

  // Nothing is left staged: the batch's own commit points are past the throw.
  expect(lines.filter((l) => l === 'MIXER 1 COMMIT')).toEqual(['MIXER 1 COMMIT']);

  /*
    …AND THE REPAIR, after it. Every layer the LEDGER still names is re-asserted UN-deferred —
    the ledger was never rewritten, so it is the geometry the console is claiming, and putting
    the picture back on it is what makes the two agree again.
  */
  const afterCommit = lines.slice(lines.indexOf('MIXER 1 COMMIT') + 1);
  for (const record of ledger) {
    expect(afterCommit, `layer ${String(record.slot.layer)} is put back`).toContain(
      `MIXER 1-${String(record.slot.layer)} FILL ${[
        record.fill.x,
        record.fill.y,
        record.fill.width,
        record.fill.height,
      ]
        .map((n) => String(Number(n.toFixed(6))))
        .join(' ')}`,
    );
  }
  // Un-deferred: a repair path does not need to be atomic, and deferring it would need a commit
  // of its own inside a path that is already unwinding.
  expect(afterCommit.filter((l) => l.endsWith(' DEFER'))).toEqual([]);
});

it('🔴 B-155 §B — a swap arriving MID-SWITCH is serialized after it and resolves the ENTERED look', async () => {
  /*
    THE RESIDUAL PATH §A FOUND, closed. `bridge.ts` dispatches requests without awaiting
    the previous one, so a `swapLiveSource` can arrive while a `setActiveLook` is parked
    on an AMCP ack. Unserialized, the swap planned against the OUTGOING look
    (`#activeLooks` is written only when the page has been told) and the PRE-SWITCH
    ledger — its `PLAY` and its `MIXER FILL` at the OLD look's geometry landing between
    the switch's fills and its page flip: a producer change inside a moving hole, which
    is `B-155`'s shape arriving by concurrency instead of by the closed assignment lurk.

    Under `#withLiveSeatLock` the swap runs strictly AFTER the switch — page flip
    included — so it plans against the look the page is punching.

    ⚠ What this cannot prove: what the REPLACE looks like on the plant while the new
    producer acquires. `@cg/amcp-mock` models `PLAY` on an occupied layer as an in-place
    substitution (6.9a, unverified on the production 2.5.0), so a green run here says the
    ORDER is right and nothing about frames. The plant walk carries that half.
  */
  const r = await boot();
  await onAir(r);
  const live1Layer = layerOf(r, 'live-1');
  const before = (await recvLines()).length;

  // Fired back to back WITHOUT awaiting the first — the two-console interleaving.
  const switchP = r.setActiveLook('item-1', 'solo');
  const swapP = r.swapLiveSource('item-1', 'live-1', 'src-sd'); // 4:3, so the fit must re-derive
  expect(await switchP).toEqual({ ok: true });
  expect(await swapP).toEqual({ ok: true });

  const lines = await since(before);
  const flipAt = lines.findIndex((l) => /^CG 1-\d+ UPDATE 0 /.test(l));
  const playAt = lines.findIndex((l) => l === `PLAY 1-${String(live1Layer)} "route://9"`);
  expect(flipAt, 'the switch completed through its page flip').toBeGreaterThanOrEqual(0);
  expect(playAt, 'the swap issued its replace').toBeGreaterThanOrEqual(0);
  // EVERY switch line precedes EVERY swap line — the producer change happens strictly
  // after the hole stopped moving.
  expect(playAt).toBeGreaterThan(flipAt);

  // …and the swap re-derived its fit against SOLO's full-frame hole, not the 6-box cell
  // the outgoing look would have given it: a 4:3 feed covering a 16:9 frame overflows
  // VERTICALLY (fill height > 1), where the 6-box cell's fill height is 0.33.
  const rec = recordOf(r, 'live-1');
  expect(rec?.producer).toBe('"route://9"');
  expect(rec?.clip).toEqual({ x: 0, y: 0, width: 1, height: 1 });
  expect(rec?.fill.height ?? 0).toBeGreaterThan(1);
});

// ─────────────── `B-161` — UPDATE IS A CONFIGURATION VERB, NEVER A PLAYOUT VERB ───────────────
//
// 🔴 The owner, on the plant 2026-08-22: he STOPPED several plates, SWAPPED their inputs, and
// pressed UPDATE only — no play, no take. **The boxes went to AIR: the videos played, with no
// template above them.** No background, no strokes, none of the page's chrome — because no page
// had been taken.
//
// The rule, decided: **a configuration verb is NEVER a playout verb.** `UPDATE` puts values IN
// FORCE; only a TAKE puts content ON AIR. A row that is not on air must produce no `PLAY`, no
// un-mute and no fill on any live layer — the binding lands in STATE, and the next take seats it.
//
// ⚠ **The gate is at the ROW, never at the look or the visible hole.** On a row that IS on air the
// UNION pre-seat must survive exactly as it is today — every look's inputs stay seated, including
// the looks that are not punched. That pre-seating is what makes a switch pure `MIXER FILL`;
// narrowing it would put a `PLAY` back inside a switch and reintroduce `B-155` case 3, which
// session BT closed on `4777b724`. `neighbour 1` therefore asserts the whole seat SET, not the one
// box a reader would think to look at.
//
// `src-4` is route 5 and is bound by no look in `ownersTemplate()`, so binding it forces a genuine
// new seat rather than deduping onto one that already exists — which is what makes "did anything
// reach the wire" a real question in every one of these.

/** Every `MIXER 1-<layer> VOLUME …` this action put on the wire — the AUDIO half. */
const volumesIn = (lines: readonly string[]): string[] =>
  lines.filter((l) => /^MIXER 1-\d+ VOLUME/.test(l));

/** Every `MIXER 1-<layer> FILL|CLIP …` — the GEOMETRY half. */
const fitsIn = (lines: readonly string[]): string[] =>
  lines.filter((l) => /^MIXER 1-\d+ (FILL|CLIP)/.test(l));

const NEW_BINDING = { two: { 'live-2': 'src-4' } } as const;

it('🔴 B-161 — a row that is NOT ON AIR: UPDATE with new bindings reaches NO live layer at all', async () => {
  const r = await boot({ template: ownersTemplateWithField(), assignments: OWNERS_ASSIGNMENTS });
  // LOADED, never taken. This row is configured and cued and NOT on air, which is the whole
  // question: `isOnAirStatus` is false for `loaded`.
  await r.load('item-1', 'debate', { title: 'before' });
  expect(layerSet(r), 'a loaded row seats nothing before the update').toEqual([]);

  const before = (await recvLines()).length;
  const res = await r.update('item-1', { title: 'after' }, 'merge', NEW_BINDING);
  const lines = await since(before);

  // The edit is ACCEPTED — an operator's configuration change is never refused for this. It
  // simply must not play.
  expect(res.accepted).toBe(true);

  /*
    🔴 ONE assertion carrying THREE facts, deliberately. Three different commands can put a
    picture on air — the `PLAY` that creates the producer, the `VOLUME` that un-mutes it, and the
    `FILL`/`CLIP` that sizes it — and separate `expect`s would stop at the first, hiding whether
    the other two also fired. The defect report needs all three halves in one reading, and
    "bare video is bad, bare video WITH SOUND is worse" is only answerable if the audio half is
    never masked by the video half failing first.
  */
  expect({
    plays: playsIn(lines),
    volumes: volumesIn(lines),
    fits: fitsIn(lines),
    seats: layerSet(r),
  }).toEqual({ plays: [], volumes: [], fits: [], seats: [] });
});

it('🔴 B-161 — …and the edit is NOT LOST: the next TAKE comes up with the new binding in force', async () => {
  const r = await boot({ template: ownersTemplateWithField(), assignments: OWNERS_ASSIGNMENTS });
  await r.load('item-1', 'debate', { title: 'before' });
  expect((await r.update('item-1', {}, 'merge', NEW_BINDING)).accepted).toBe(true);

  // The STATE half must actually have been written, or the gate trades an on-air defect for a
  // silently-lost edit — the worse bug of the two, and the one a "just don't send anything"
  // fix would introduce.
  const before = (await recvLines()).length;
  expect((await r.take('item-1')).accepted).toBe(true);
  const lines = await since(before);
  expect(
    playsIn(lines).some((l) => /route:\/\/5\b/.test(l)),
    'the take must seat the input the off-air UPDATE bound (src-4 → route 5)',
  ).toBe(true);
});

it('B-161 neighbour 1 — an ON-AIR row still re-points immediately, and KEEPS THE UNION PRE-SEAT', async () => {
  const r = await boot({ template: ownersTemplateWithField(), assignments: OWNERS_ASSIGNMENTS });
  await r.load('item-1', 'debate', { title: 'before' });
  expect((await r.take('item-1')).accepted).toBe(true);
  // The whole seat set BEFORE — every look's inputs, including the looks not punched.
  const seatsBefore = layerSet(r);
  expect(seatsBefore.length, 'the fixture must actually pre-seat something').toBeGreaterThan(0);

  const before = (await recvLines()).length;
  expect((await r.update('item-1', { title: 'after' }, 'merge', NEW_BINDING)).accepted).toBe(true);
  const lines = await since(before);

  // BM-2 §4 step 4 — the FEATURE, unchanged: changing a live row's input changes it quickly.
  expect(playsIn(lines).length, 'an on-air row still re-points on the wire').toBeGreaterThan(0);
  // 🔴 The union never NARROWS. A gate placed at the look or at the visible hole would drop the
  // seats the unpunched looks hold, which is a `PLAY` pushed back inside the next switch —
  // `B-155` case 3, closed by session BT. Asserting a superset (not equality) is deliberate: a
  // new binding legitimately ADDS a seat, it must never remove one.
  expect(layerSet(r), 'the UNION pre-seat must survive a re-point').toEqual(
    expect.arrayContaining(seatsBefore),
  );
});

it('B-161 neighbour 2 — a REHEARSING row still seats: the gate must not be "on air" alone', async () => {
  const r = await boot({ template: ownersTemplateWithField(), assignments: OWNERS_ASSIGNMENTS });
  await r.load('item-1', 'debate', { title: 'before' });
  expect((await r.enterRehearse('item-1')).ok, 'a loaded row can enter rehearse').toBe(true);

  const before = (await recvLines()).length;
  expect((await r.update('item-1', {}, 'merge', NEW_BINDING)).accepted).toBe(true);
  const lines = await since(before);

  // 🔴 Rehearsing is NOT on air, but it is not stopped either: it OWNS its layers, on PVW. A gate
  // that asked `isOnAirStatus` ALONE would silently break rehearse, which is exactly why this
  // test sits beside the off-air one rather than in a file of its own.
  expect(playsIn(lines).length, 'a rehearsing row still seats its plates').toBeGreaterThan(0);
});
