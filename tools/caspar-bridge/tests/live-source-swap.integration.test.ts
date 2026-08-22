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
} from '@cg/shared-ipc';
import type { RetainedStackItem } from '@cg/shared-schema';
import { CasparRuntime } from '../src/caspar-runtime.js';
import { HEALTH_MS } from './support/harness.js';

/**
 * R-048 / C-015 phase 6 (6.9 / 6.9a / 6.9b / 6.9c / 6.9d) — **SWAP ONE PLATE'S
 * INPUT WHILE THE TEMPLATE IS ON AIR.**
 *
 * The case is a client requirement: a three-plate template is on air, one input
 * drops, that plate goes black, the other two are fine. Every assertion here is
 * about what the operator gets in that minute — the substitution lands, the
 * neighbours are untouched, and nothing is destroyed before the replacement is
 * known to have worked.
 *
 * ⚠ **THE ONE THING THESE TESTS DO NOT PROVE (task 6.9a).** The mock models `PLAY`
 * on an OCCUPIED layer as a substitution. Whether the plant's CasparCG **2.3.2**
 * does is UNMEASURED — so this file proves the code is self-consistent and proves
 * nothing about the server. That probe rides with design.md §3b's `DEFER`/`COMMIT`
 * question and 6.3a's `CLIP` intersection question, all three being AMCP probes on
 * the same build.
 */

let mock: MockHandle | null = null;
let runtime: CasparRuntime | null = null;
let tracePath: string | null = null;

const BAND = { start: 30, end: 32 };
const SCENE = { width: 1920, height: 1080 };
const CENTRED = { anchor: 'center' as const, offset: { x: 0, y: 0 } };
const BOX_A = { x: 100, y: 100, width: 400, height: 225 };
const BOX_B = { x: 600, y: 100, width: 400, height: 225 };

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

const TWO_PLATE_TEMPLATE: TemplateInfo = {
  templateId: 'lower-third',
  templateType: 'lower-third',
  fields: [],
  liveSources: {
    resolution: SCENE,
    defaultPosition: CENTRED,
    sources: [
      { elementId: 'el-1', sourceId: 'guest-1', rect: BOX_A, dynamic: false },
      { elementId: 'el-2', sourceId: 'guest-2', rect: BOX_B, dynamic: false },
    ],
  },
};

const CATALOG: SourceCatalog = {
  sources: [
    { id: 'src-a', name: 'Studio A', format: '1080i5000', producer: { kind: 'route', channel: 2 } },
    { id: 'src-b', name: 'Baku', format: '1080i5000', producer: { kind: 'route', channel: 3 } },
    // Session BM: a same-format source NO other plate is assigned, for the plain-substitution
    // tests. `src-b` is guest-2's, so pointing guest-1 at it is a §6.2 collision now.
    { id: 'src-c', name: 'Ganja', format: '1080i5000', producer: { kind: 'route', channel: 5 } },
    // A 4:3 source, so a swap onto it changes the CROP and 6.9b's refit is visible.
    { id: 'src-sd', name: 'Archive SD', format: 'PAL', producer: { kind: 'route', channel: 4 } },
    // A producer form the mock refuses, for the failure path.
    {
      id: 'src-bad',
      name: 'Broken',
      format: '1080i5000',
      producer: { kind: 'media', file: 'bogus://clip.mov' },
    },
  ],
  layerRange: BAND,
};

const ASSIGNMENTS: SourceAssignments = {
  assignments: [
    { templateId: 'lower-third', plateId: 'guest-1', sourceId: 'src-a' },
    { templateId: 'lower-third', plateId: 'guest-2', sourceId: 'src-b' },
  ],
};

async function boot(): Promise<CasparRuntime> {
  const oscPort = await freeUdpPort();
  tracePath = path.join(
    os.tmpdir(),
    `cg-liveswap-${String(process.pid)}-${String(Date.now())}-${String(Math.round(performance.now() * 1000))}.ndjson`,
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
  r.templateImport(TWO_PLATE_TEMPLATE, '<!doctype html><html><body>served</body></html>');
  await r.whenServerHealthy(HEALTH_MS);
  return r;
}

/** On air with both plates seated: guest-1 on 30, guest-2 on 31. */
async function onAir(r: CasparRuntime): Promise<void> {
  await r.load('item-1', 'lower-third', {});
  expect((await r.take('item-1')).accepted).toBe(true);
}

const layerOf = (r: CasparRuntime, plateId: string): number | undefined =>
  (r.liveLayers().get('item-1') ?? []).find((rec) => rec.sourceId === plateId)?.slot.layer;

it('🔴 the plate is REPLACED IN PLACE — no CLEAR, same layer, neighbour untouched', async () => {
  const r = await boot();
  await onAir(r);
  const layer = layerOf(r, 'guest-1');
  const neighbour = layerOf(r, 'guest-2');
  const before = (await recvLines()).length;

  expect(await r.swapLiveSource('item-1', 'guest-1', 'src-sd')).toEqual({ ok: true });

  const lines = (await recvLines()).slice(before);
  // A CLEAR then a PLAY that fails is the B-126 window arriving during an
  // emergency: a destructive step committed before the constructive one was known
  // to succeed. There must be NO clear of any kind.
  expect(lines.some((l) => l.startsWith('CLEAR '))).toBe(false);
  expect(lines.some((l) => l.startsWith(`PLAY 1-${String(layer ?? -1)} `))).toBe(true);
  expect(lines[lines.findIndex((l) => l.startsWith('PLAY '))]).toContain('route://4');
  // The neighbour is not disturbed — not re-played, not re-fitted, not cleared.
  expect(lines.some((l) => l.includes(`1-${String(neighbour ?? -1)}`))).toBe(false);
  // …and the template's own layer is untouched: the graphic never left air.
  expect(lines.some((l) => l.startsWith('CG 1-'))).toBe(false);
  expect(layerOf(r, 'guest-1')).toBe(layer);
});

it('6.9b — the FIT re-derives in the SAME action, with no second operator step', async () => {
  const r = await boot();
  await onAir(r);
  const layer = layerOf(r, 'guest-1') ?? 0;
  // 16:9 into a 16:9 hole: no crop, so the fill is exactly the hole.
  const before = mock?.layerState({ channel: 1, layer })?.fill;
  const beforeClip = mock?.layerState({ channel: 1, layer })?.clip;

  await r.swapLiveSource('item-1', 'guest-1', 'src-sd');

  const after = mock?.layerState({ channel: 1, layer })?.fill;
  // PAL is a 4:3 DISPLAY aspect, so crop-to-fill oversizes the picture on the HEIGHT axis to
  // cover a 16:9 hole. The point is that it changed at all without a second step.
  expect(after).not.toEqual(before);
  expect(after?.height).toBeGreaterThan(before?.height ?? 0);
  // The CLIP still masks to the HOLE, which did not move: the two rects come from
  // ONE computation, so a refit that moved the fill without re-emitting its mask
  // would leave the picture rendering nothing at all (design.md §3).
  const clipAfter = mock?.layerState({ channel: 1, layer })?.clip;
  expect(clipAfter).toEqual(beforeClip);
  expect(mock?.layerRenderedRect({ channel: 1, layer })).not.toBeNull();
});

it('🔴 6.9c — a deliberately RAISED plate is still audible after the swap', async () => {
  const r = await boot();
  await onAir(r);
  const layer = layerOf(r, 'guest-1') ?? 0;
  // Every bridge-created producer is born muted (6.5), so raising it is an
  // explicit recorded intent naming the layer — the only thing that may raise it.
  expect(await r.setLivePlateVolume('item-1', 'guest-1', 1)).toEqual({ ok: true });
  expect(mock?.layerState({ channel: 1, layer })?.volume).toBe(1);

  await r.swapLiveSource('item-1', 'guest-1', 'src-c');

  // The NEW producer was born muted like every other; the swap re-asserts the
  // PLATE's intent onto it. A swap that silently muted a guest would be its own
  // on-air fault, arriving at the moment the operator was fixing something else.
  expect(mock?.layerState({ channel: 1, layer })?.volume).toBe(1);
  expect(
    r
      .liveLayers()
      .get('item-1')
      ?.find((x) => x.sourceId === 'guest-1')?.intendedVolume,
  ).toBe(1);
});

it('6.9c — the intent belongs to the PLATE, so a RE-TAKE keeps it raised too', async () => {
  const r = await boot();
  await onAir(r);
  const layer = layerOf(r, 'guest-1') ?? 0;
  await r.setLivePlateVolume('item-1', 'guest-1', 1);

  await r.take('item-1');

  expect(mock?.layerState({ channel: 1, layer })?.volume).toBe(1);
  // …and its neighbour, which nobody raised, is still muted: the intent is
  // per-plate and not a property of the item.
  expect(mock?.layerState({ channel: 1, layer: layerOf(r, 'guest-2') ?? 0 })?.volume).toBe(0);
});

it('🔴 a REFUSED replace leaves the previous producer up, and records NO override', async () => {
  const r = await boot();
  await onAir(r);
  const layer = layerOf(r, 'guest-1') ?? 0;
  const beforeProducer = r.liveLayers().get('item-1')?.[0]?.producer;

  const verdict = await r.swapLiveSource('item-1', 'guest-1', 'src-bad');

  expect(verdict.ok).toBe(false);
  expect(verdict.message).toContain('still on its previous source');
  // Nothing was cleared, so the plate is still showing what it was showing.
  expect((await recvLines()).some((l) => l === `CLEAR 1-${String(layer)}`)).toBe(false);
  expect(r.liveLayers().get('item-1')?.[0]?.producer).toBe(beforeProducer);
  // 🔴 And the override is NOT recorded: a row claiming the new source while the
  // layer carries the old would be worse than the failure itself.
  expect(r.stackSnapshot().find((i) => i.itemId === 'item-1')?.sourceOverride).toBeUndefined();
});

it('the override is PER ITEM: the template assignment and the catalog are untouched', async () => {
  const r = await boot();
  await onAir(r);

  await r.swapLiveSource('item-1', 'guest-1', 'src-c');

  expect(r.sourceAssignments()).toEqual(ASSIGNMENTS);
  expect(r.sourceCatalog()).toEqual(CATALOG);
  expect(r.stackSnapshot().find((i) => i.itemId === 'item-1')?.sourceOverride).toEqual({
    'guest-1': 'src-c',
  });
});

it('a null sourceId REVERTS the plate to its template assignment', async () => {
  const r = await boot();
  await onAir(r);
  await r.swapLiveSource('item-1', 'guest-1', 'src-c');

  expect(await r.swapLiveSource('item-1', 'guest-1', null)).toEqual({ ok: true });

  const lines = await recvLines();
  expect(lines[lines.length - 4]).toContain('route://2');
  // An EMPTY override map is no override at all — a row back on its assignment
  // must not read as substituted.
  expect(r.stackSnapshot().find((i) => i.itemId === 'item-1')?.sourceOverride).toBeUndefined();
});

it('🔴 6.9d — the override SURVIVES a bridge restart, through retention', async () => {
  // The B-107 / B-109 class: retention dropping state it did not model. A blip
  // that lost this would silently revert the plate to the DEAD source the
  // operator patched around, with the row still showing the substitution.
  const r = await boot();
  await onAir(r);
  await r.swapLiveSource('item-1', 'guest-1', 'src-sd');
  const published = r.stackSnapshot().find((i) => i.itemId === 'item-1');
  expect(published?.sourceOverride).toEqual({ 'guest-1': 'src-sd' });

  // What the browser retains and hands back to a fresh bridge process.
  const retained: RetainedStackItem[] = [
    {
      itemId: 'item-1',
      templateId: 'lower-third',
      fields: {},
      state: 'on-air',
      ...(published?.sourceOverride !== undefined && {
        sourceOverride: published.sourceOverride,
      }),
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
  fresh.templateImport(TWO_PLATE_TEMPLATE, '<!doctype html><html><body>served</body></html>');
  await fresh.whenServerHealthy(HEALTH_MS);

  await fresh.restore(retained);

  expect(fresh.stackSnapshot().find((i) => i.itemId === 'item-1')?.sourceOverride).toEqual({
    'guest-1': 'src-sd',
  });
  // …and the next take seats the SUBSTITUTED source, which is the claim that
  // matters: a restored override nobody reads is not a restored override.
  await fresh.take('item-1');
  expect(
    fresh
      .liveLayers()
      .get('item-1')
      ?.find((x) => x.sourceId === 'guest-1')?.producer,
  ).toBe('"route://4"');
});

it('an unknown plate and an unknown source are refused by name, not silently ignored', async () => {
  const r = await boot();
  await onAir(r);

  const plate = await r.swapLiveSource('item-1', 'guest-9', 'src-b');
  expect(plate.reason).toBe('unknown-plate');
  expect(plate.message).toContain('guest-9');

  const source = await r.swapLiveSource('item-1', 'guest-1', 'src-nope');
  expect(source.reason).toBe('unknown-source');
  expect(source.message).toContain('src-nope');
});

it('a row that is not on air records the override and sends nothing', async () => {
  const r = await boot();
  await r.load('item-1', 'lower-third', {});
  const before = (await recvLines()).length;

  expect(await r.swapLiveSource('item-1', 'guest-1', 'src-c')).toEqual({ ok: true });

  // A list edit, exactly like setting a position on an idle row.
  expect((await recvLines()).slice(before)).toEqual([]);
  // …and the NEXT take seats the substituted source.
  await r.take('item-1');
  expect(
    r
      .liveLayers()
      .get('item-1')
      ?.find((x) => x.sourceId === 'guest-1')?.producer,
  ).toBe('"route://5"');
});
