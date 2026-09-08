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
 * 🔴 **`RUNTIME-REDESIGN-01` §4 — A LOOK SWITCH PRESERVES THE SOURCE-TO-FRAME RELATIONSHIP.
 * Switch away and back: the same source is on the same frame.** Red-first, source stashed.
 *
 * ── WHAT IS ASSERTED, AND WHY AT THE WIRE ────────────────────────────────────
 *
 * The relationship is a per-frame triple — this PLATE, this PRODUCER (the wire argument the
 * seat was created with), at this RECT (what the mock server actually renders for the layer).
 * It is read on look A, the row is switched to a DISJOINT look B and back to A, and the triple
 * is asserted identical for every frame A places. Every reading is on the mock's real AMCP
 * state and the bridge's ledger, never on a UI: `live-look-reconcile` proves the reconcile's
 * plumbing; this proves the property an operator relies on when they press a look and press
 * it back.
 *
 * ── WHY THE ROUND TRIP CARRIES A PER-LOOK BINDING ───────────────────────────
 *
 * If every frame resolved to the template's assignment (level 2), a switch that FORGOT the
 * row's composition and re-derived the frames from the template would still put the same
 * source back — the property would pass for the wrong reason. So look A carries a LEVEL-3
 * binding (`swapLiveSource(…, lookId)` — _"left will show the preset feed on frame 1"_), which
 * only survives the round trip if the switch preserves the ROW's relationship rather than
 * recomputing the TEMPLATE's. That is the defect this is red against: with the switch dropping
 * the row's per-look map, frame 1 comes back on `src-1` instead of `src-preset`.
 *
 * ── THE POSITIVE CONTROL ────────────────────────────────────────────────────
 *
 * A "nothing changed" assertion is void until the instrument is shown live (a negative
 * observation needs a positive control): the middle reading, on look B, must show frame 1 NOT
 * rendered and frames 3 and 4 rendered — the switch really moved the picture before it was
 * moved back.
 */

let mock: MockHandle | null = null;
let runtime: CasparRuntime | null = null;
let tracePath: string | null = null;

const BAND = { start: 30, end: 35 };
const SCENE = { width: 1920, height: 1080 };
const CENTRED = { anchor: 'center' as const, offset: { x: 0, y: 0 } };
const KEYS = ['live-1', 'live-2', 'live-3', 'live-4'] as const;

const box = (x: number, y: number): LiveSourceRect => ({ x, y, width: 480, height: 270 });

/** LEFT places {1,2}; RIGHT places {3,4}. Disjoint, so the switch away really moves them. */
const LEFT: Record<string, LiveSourceRect> = { 'live-1': box(0, 0), 'live-2': box(480, 0) };
const RIGHT: Record<string, LiveSourceRect> = { 'live-3': box(960, 0), 'live-4': box(0, 270) };

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
      sock.close(() => {
        resolve(port);
      });
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

const look = (id: string, rects: Record<string, LiveSourceRect>): TemplateLook => ({
  id,
  name: id,
  entered: { mode: 'cut' },
  rects,
});

function template(): TemplateInfo {
  const all = { ...LEFT, ...RIGHT };
  return {
    templateId: 'debate',
    templateType: 'debate',
    fields: [],
    liveSources: {
      resolution: SCENE,
      defaultPosition: CENTRED,
      sources: KEYS.map((k) => ({
        elementId: `el-${k}`,
        sourceId: k,
        rect: all[k] ?? box(0, 0),
        dynamic: false,
      })),
      looks: [look('left', LEFT), look('right', RIGHT)],
      defaultLookId: 'left',
    },
  };
}

function catalog(): SourceCatalog {
  return {
    sources: [
      ...KEYS.map((_k, i) => ({
        id: `src-${String(i + 1)}`,
        name: `Feed ${String(i + 1)}`,
        format: '1080i5000' as const,
        producer: { kind: 'route' as const, channel: i + 2 },
      })),
      {
        id: 'src-preset',
        name: 'Preset Feed',
        format: '1080i5000',
        producer: { kind: 'route' as const, channel: 9 },
      },
    ],
    layerRange: BAND,
  };
}

const ASSIGNMENTS: SourceAssignments = {
  assignments: KEYS.map((k, i) => ({
    templateId: 'debate',
    plateId: k,
    sourceId: `src-${String(i + 1)}`,
  })),
};

async function boot(): Promise<CasparRuntime> {
  const oscPort = await freeUdpPort();
  tracePath = path.join(
    os.tmpdir(),
    `cg-look-rt-${String(process.pid)}-${String(Date.now())}-${String(Math.round(performance.now() * 1000))}.ndjson`,
  );
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 30, tracePath });
  const r = new CasparRuntime(
    singleServer(mock.amcpPort, oscPort),
    {},
    {
      sweepMs: 150,
      lookMixerHoldMs: 0,
      sourceCatalog: catalog(),
      sourceAssignments: ASSIGNMENTS,
    },
  );
  runtime = r;
  r.start();
  await r.startServing();
  r.templateImport(template(), '<!doctype html><html></html>');
  await r.whenServerHealthy(HEALTH_MS);
  await awaitChannelModeRead(r);
  return r;
}

/** One frame's relationship: the producer seated for this plate and the rect it renders at. */
interface FrameReading {
  producer: string | undefined;
  layer: number;
  rendered: unknown;
}

function frameOf(r: CasparRuntime, plateId: string): FrameReading {
  const rec = (r.liveLayers().get('item-1') ?? []).find((x) => x.sourceId === plateId);
  const layer = rec?.slot.layer ?? -1;
  return {
    producer: rec?.producer,
    layer,
    rendered: layer < 0 ? null : (mock?.layerRenderedRect({ channel: 1, layer }) ?? null),
  };
}

/** Every frame LEFT places, keyed by plate — the relationship as one comparable value. */
function leftFrames(r: CasparRuntime): Record<string, FrameReading> {
  return Object.fromEntries(Object.keys(LEFT).map((p) => [p, frameOf(r, p)]));
}

it('🔴 §4 — switch away and back: the same source is on the same frame, per-look binding included', async () => {
  const r = await boot();
  await r.load('item-1', 'debate', {});
  expect((await r.take('item-1')).accepted).toBe(true);

  // LEVEL 3 — the row's own composition for look LEFT: frame 1 shows the preset feed. This is
  // what a switch that re-derived frames from the TEMPLATE would lose.
  expect((await r.swapLiveSource('item-1', 'live-1', 'src-preset', 'left')).ok).toBe(true);

  const before = leftFrames(r);
  // Non-empty FIRST, then identity (`PROMPT.md` §11): a reading of nothing compared with a
  // reading of nothing would pass vacuously.
  expect(before['live-1']?.producer, 'frame 1 is seated').toBeDefined();
  expect(before['live-1']?.producer, 'frame 1 carries the per-look binding').toContain('9');
  expect(before['live-1']?.rendered, 'frame 1 is on screen in LEFT').not.toBeNull();
  expect(before['live-2']?.rendered, 'frame 2 is on screen in LEFT').not.toBeNull();

  // AWAY — to a look that places NEITHER of LEFT's frames.
  expect((await r.setActiveLook('item-1', 'right')).ok).toBe(true);
  // POSITIVE CONTROL: the instrument is live — the picture really moved.
  expect(frameOf(r, 'live-1').rendered, 'frame 1 is off screen in RIGHT').toBeNull();
  expect(frameOf(r, 'live-3').rendered, 'frame 3 is on screen in RIGHT').not.toBeNull();

  // …AND BACK.
  expect((await r.setActiveLook('item-1', 'left')).ok).toBe(true);
  expect(r.stackSnapshot().find((i) => i.itemId === 'item-1')?.activeLookId).toBe('left');

  // 🔴 THE PROPERTY. Same producer on the same layer rendering the same rect, for every frame
  // LEFT places — including the one whose source is the row's own per-look binding.
  expect(leftFrames(r)).toEqual(before);
});

it('§4 — a switch away and back sends no PLAY: the relationship is kept, not rebuilt', async () => {
  /*
    The mechanism behind the property, pinned so it cannot be "fixed" by re-seating: coming
    back is geometry (`MIXER FILL`), never a new producer. A `PLAY` here would mean the frame's
    source was re-acquired — the same picture, perhaps, but a visible re-acquire on every
    switch back, and a relationship that was recomputed rather than preserved.
  */
  const r = await boot();
  await r.load('item-1', 'debate', {});
  expect((await r.take('item-1')).accepted).toBe(true);
  expect((await r.swapLiveSource('item-1', 'live-1', 'src-preset', 'left')).ok).toBe(true);
  await r.setActiveLook('item-1', 'right');

  if (mock === null || tracePath === null) throw new Error('no trace');
  await mock.traceFlush();
  const mark = fs.readFileSync(tracePath, 'utf-8').split('\n').length;

  expect((await r.setActiveLook('item-1', 'left')).ok).toBe(true);

  await mock.traceFlush();
  const lines = fs
    .readFileSync(tracePath, 'utf-8')
    .split('\n')
    .slice(mark - 1)
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as { dir: string; line: string })
    .filter((e) => e.dir === 'recv')
    .map((e) => e.line);
  expect(lines.filter((l) => /MIXER .* FILL/.test(l)).length, 'the fills moved').toBeGreaterThan(0);
  expect(
    lines.filter((l) => /^PLAY /.test(l)),
    'no producer was rebuilt',
  ).toEqual([]);
  expect(frameOf(r, 'live-1').producer).toContain('9');
});
