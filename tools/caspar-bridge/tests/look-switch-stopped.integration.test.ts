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
 * 🔴 **THE OWNER'S SEQUENCE: on air → STOP → switch the look while stopped → PLAY.**
 *
 * Reported 2026-08-31: the fills and the holes come up on DIFFERENT looks, and only a further
 * switch (or another stop-and-play) repairs it. What this file pins is the property the owner
 * actually asked for — _whichever look is in force, the fills and the holes agree_ — measured on
 * the wire rather than inferred: what the page was TOLD (the `__cg` control object in the `CG`
 * payload) and where the pictures ARE (the mock's layer state) are read separately and compared.
 */

let mock: MockHandle | null = null;
let runtime: CasparRuntime | null = null;
let tracePath: string | null = null;

const BAND = { start: 30, end: 35 };
const SCENE = { width: 1920, height: 1080 };
const CENTRED = { anchor: 'center' as const, offset: { x: 0, y: 0 } };

const GRID: Record<string, LiveSourceRect> = {
  'live-1': { x: 0, y: 0, width: 640, height: 360 },
  'live-2': { x: 640, y: 0, width: 640, height: 360 },
};
const ROUTE_KEYS = Object.keys(GRID);

/** TWO-BOX — both plates, side by side. */
const TWO: Record<string, LiveSourceRect> = {
  'live-1': { x: 0, y: 0, width: 960, height: 540 },
  'live-2': { x: 960, y: 0, width: 960, height: 540 },
};
/** SINGLE-BOX — one plate, full frame. Different MEMBERSHIP and different geometry. */
const ONE: Record<string, LiveSourceRect> = {
  'live-1': { x: 0, y: 0, width: 1920, height: 1080 },
};

function look(id: string, rects: Record<string, LiveSourceRect>): TemplateLook {
  return { id, name: id, entered: { mode: 'cut' }, rects };
}

function template(): TemplateInfo {
  return {
    templateId: 'debate',
    templateType: 'debate',
    fields: [],
    liveSources: {
      resolution: SCENE,
      defaultPosition: CENTRED,
      sources: ROUTE_KEYS.map((k) => ({
        elementId: `el-${k}`,
        sourceId: k,
        rect: GRID[k] as LiveSourceRect,
        dynamic: false,
      })),
      arrangements: [],
      looks: [look('two', TWO), look('one', ONE)],
      defaultLookId: 'two',
    },
  } as unknown as TemplateInfo;
}

const CATALOG = {
  layerRange: BAND,
  sources: [1, 2].map((n) => ({
    id: `src-${String(n)}`,
    name: `Studio ${String(n)}`,
    producer: { kind: 'decklink' as const, device: n },
  })),
} as unknown as SourceCatalog;

const ASSIGNMENTS: SourceAssignments = {
  assignments: ROUTE_KEYS.map((k, i) => ({
    templateId: 'debate',
    plateId: k,
    sourceId: `src-${String(i + 1)}`,
  })),
};

function singleServer(amcpPort: number, oscPort: number): ConnectionConfig {
  return {
    servers: { A: { host: '127.0.0.1', amcpPort, oscPort } },
    strategy: 'mirror-sync',
    autoFailoverEnabled: true,
  } as unknown as ConnectionConfig;
}

async function freeUdpPort(): Promise<number> {
  const dgram = await import('node:dgram');
  return new Promise((resolve) => {
    const s = dgram.createSocket('udp4');
    s.bind(0, '127.0.0.1', () => {
      const p = s.address().port;
      s.close(() => resolve(p));
    });
  });
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
 * The look the page was told, read off the wire. Every `CG` line that carries data — the `ADD`'s
 * payload and every `UPDATE` — encodes the reserved `__cg` control object, so this answers "what
 * does the page believe" without asking the bridge, which is the whole point.
 */
function lookToldOn(lines: readonly string[]): string | undefined {
  let told: string | undefined;
  for (const line of lines) {
    if (!line.startsWith('CG ')) continue;
    const match = /"__cg"\s*:\s*(\{.*?\})\s*[},]/.exec(line.replace(/\\"/g, '"'));
    if (match === null) continue;
    const look = /"look"\s*:\s*"([^"]+)"/.exec(match[1] ?? '');
    if (look !== null) told = look[1];
  }
  return told;
}

async function boot(): Promise<CasparRuntime> {
  const oscPort = await freeUdpPort();
  tracePath = path.join(
    os.tmpdir(),
    `cg-stopped-${String(process.pid)}-${String(Date.now())}-${String(
      Math.round(performance.now() * 1000),
    )}.ndjson`,
  );
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 30, tracePath });
  const r = new CasparRuntime(
    singleServer(mock.amcpPort, oscPort),
    {},
    {
      lookMixerHoldMs: 0,
      sweepMs: 150,
      sourceCatalog: CATALOG,
      sourceAssignments: ASSIGNMENTS,
    },
  );
  runtime = r;
  r.start();
  await r.startServing();
  r.templateImport(template(), '<!doctype html><html></html>');
  await r.whenServerHealthy(HEALTH_MS);
  await awaitChannelModeRead(r);
  await r.load('item-1', 'debate', {});
  expect((await r.take('item-1')).accepted).toBe(true);
  return r;
}

afterEach(async () => {
  await runtime?.stop();
  runtime = null;
  await mock?.stop();
  mock = null;
  if (tracePath !== null && fs.existsSync(tracePath)) fs.rmSync(tracePath);
  tracePath = null;
});

function fillOf(r: CasparRuntime, plateId: string): { x: number; y: number } | undefined {
  const record = (r.liveLayers().get('item-1') ?? []).find((rec) => rec.sourceId === plateId);
  if (record === undefined) return undefined;
  const state = mock?.layerState(record.slot);
  const fill = state?.fill;
  return fill === undefined ? undefined : { x: fill.x, y: fill.y };
}

it('STOP → switch the look while stopped → PLAY: the holes and the fills come up on the SAME look', async () => {
  const r = await boot();
  expect(r.activeLookId('item-1'), 'the fixture starts on the authored default').toBe('two');
  const onAirOnTwo = (await recvLines()).length;

  expect((await r.stopItem('item-1')).accepted).toBe(true);
  // Baselined AFTER the stop: its own teardown (`MIXER … CLEAR`, the `CG STOP`) is the stop's
  // traffic, and folding it into the switch's slice would make the assertion below meaningless.
  const stopped = (await recvLines()).length;
  expect((await r.setActiveLook('item-1', 'one')).ok, 'the picker works while stopped').toBe(true);
  expect(r.activeLookId('item-1'), 'the record follows the operator while stopped').toBe('one');
  /*
    🔴 THE SWITCH ITSELF STILL REACHES NO PLANT, and that is deliberate: `B-151` pins a look
    press on an off-air row to send nothing, which is what makes the rehearse control safe.
    The repair is at the TAKE, where both routes into air converge — asserted below.
  */
  const stoppedSwitch = (await recvLines()).slice(stopped);
  expect(
    stoppedSwitch.filter(
      (l) => l.startsWith('CG ') || l.startsWith('MIXER') || l.startsWith('PLAY'),
    ),
    'a stopped row is recorded, not played, filled or told',
  ).toEqual([]);

  const before = (await recvLines()).length;
  expect((await r.take('item-1')).accepted).toBe(true);
  const sent = (await recvLines()).slice(before);

  /*
    (a) THE PAGE. The POSITIVE CONTROL comes first and is not optional: `lookToldOn` returning
    `undefined` has to mean "nothing told the page a look", never "the parser missed" — so the
    same parser is made to answer for the FIRST take, where a `CG ADD` payload provably carries
    one. Without that, the assertion below would pass on a broken reader.
  */
  expect(
    lookToldOn((await recvLines()).slice(0, onAirOnTwo)),
    'parser control: the first take',
  ).toBe('two');
  /*
    The take is where the page is made to agree, and it is the ONLY place it can be on this
    route: `stop` leaves the producer resident, so there is no `CG ADD` to carry the look, and
    the switch itself is pinned silent above. Before this existed, the take's `CG … PLAY` went
    out carrying nothing and the graphic came back up punching the look it was stopped on.
  */
  expect(lookToldOn(sent), 'the take tells the page the look it is about to seat').toBe('one');

  // (b) THE PICTURES. `one` is one full-frame box, so `live-1` fills the channel; under `two` it
  //     is a half-width box at the origin, which is why the ORIGIN alone would not discriminate.
  const seat = (r.liveLayers().get('item-1') ?? []).find((rec) => rec.sourceId === 'live-1');
  expect(seat, 'live-1 must be seated after the take').toBeDefined();
  expect(fillOf(r, 'live-1'), 'live-1 at the origin').toEqual({ x: 0, y: 0 });
  expect(
    mock?.layerState(seat?.slot ?? { channel: 1, layer: 0 })?.fill?.width,
    'live-1 full width — the single-box look, not the two-box one',
  ).toBeCloseTo(1, 3);
});
