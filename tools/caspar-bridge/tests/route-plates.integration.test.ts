import * as dgram from 'node:dgram';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createMock, defaultHandlers, type MockHandle } from '@cg/amcp-mock';
import { DEFAULT_LAYER_POLICY } from '@cg/caspar-client';
import {
  inputSourceId,
  type ConnectionConfig,
  type FixedLayerBank,
  type SourceAssignments,
  type TemplateInfo,
} from '@cg/shared-ipc';
import { CasparRuntime } from '../src/caspar-runtime.js';
import { validateFixedBank } from '../src/fixed-layers-store.js';
import { PlayoutSources } from '../src/playout-sources.js';
import {
  ROUTE_EPOCH_STALE_CODE,
  ROUTE_LOADBG_MAX_MS,
  ROUTE_LOADBG_MIN_MS,
  ROUTE_WAITING_CODE,
  ROUTE_WINDOW_MISSED_CODE,
  type RouteClock,
} from '../src/route-plates.js';
import { FAKE_INPUTS, type FakeInput } from './support/fake-playout.js';
import { awaitChannelModeRead, HEALTH_MS } from './support/harness.js';
import { LocalPlayoutSources } from './support/local-playout-sources.js';

/**
 * 🔴 `ROUTE-PLATES-01` §2 — **A PLATE SEATED FROM THE PLAYOUT'S HOLDER CHANNEL, BY CONTRACT v1.3.**
 *
 * The station is shaped as a real one: channel 2, the bed on 2-59, plates in 60–79, templates in
 * 80–99. The Playout is the fake's (`LocalPlayoutSources`, answering what `FAKE_INPUTS` lists): its
 * holder channel is 9, `ورودی ۳` is `route://9-12` for channels 1 and 2, and `ورودی ۴` is
 * `route://9-13` for channel 1 only, and down. The runtime and the AMCP mock share ONE fake clock,
 * so a gap between two stamped lines is the gap the bridge waited.
 *
 * Everything is read off the wire the mock received. Every absence has its positive control.
 */

let mocks: MockHandle[] = [];
let runtime: CasparRuntime | null = null;
let readers: PlayoutSources[] = [];
let traces: string[] = [];

afterEach(async () => {
  for (const reader of readers) reader.dispose();
  readers = [];
  await runtime?.stop();
  runtime = null;
  for (const m of mocks) await m.stop();
  mocks = [];
  for (const t of traces) if (fs.existsSync(t)) fs.rmSync(t);
  traces = [];
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

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(cond: () => boolean, what: string, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!cond()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await delay(25);
  }
}

// ── The station ──────────────────────────────────────────────────────────────────────────────

const BANK: FixedLayerBank = { channel: 2, start: 80, count: 20, low: { start: 50, count: 10 } };
const BED = { channel: 2, layer: 59 };
const BAND = { start: 60, end: 79 };
const ROW = 'bed-59';

const INPUT_3 = inputSourceId('li-input3');
const INPUT_4 = inputSourceId('li-input4');
const INPUT_5 = inputSourceId('li-input5');
const INPUT_6 = inputSourceId('li-input6');
const MULTICAST = inputSourceId('li-multicast');

/** Two more holder inputs for channel 2, so a look can show two routes at once. */
function holderInput(id: string, name: string, layer: number): FakeInput {
  return {
    id,
    name,
    casparHost: '127.0.0.1',
    producer: { kind: 'route', channel: 9, layer },
    aspect: 1.7778,
    available: true,
    compatibleChannels: [{ casparHost: '127.0.0.1', casparChannel: 2 }],
  };
}
const INPUTS: readonly FakeInput[] = [
  ...FAKE_INPUTS,
  holderInput('li-input5', 'ورودی ۵', 14),
  holderInput('li-input6', 'ورودی ۶', 15),
];

const SCENE = { width: 1920, height: 1080 };
const CENTRED = { anchor: 'center' as const, offset: { x: 0, y: 0 } };
const FULL = { x: 0, y: 0, width: 1920, height: 1080 };
const third = (i: number) => ({ x: 640 * i, y: 0, width: 640, height: 1080 });

function plate(id: string, rect: { x: number; y: number; width: number; height: number }) {
  return { elementId: `el-${id}`, sourceId: id, rect, expectedAspect: 16 / 9, dynamic: false };
}

/** One full-frame plate, no looks. */
const SINGLE: TemplateInfo = {
  templateId: 'single',
  templateType: 'custom',
  fields: [],
  liveSources: { resolution: SCENE, defaultPosition: CENTRED, sources: [plate('l1', FULL)] },
};

/** Two plates side by side, no looks — both on screen at the take. */
const DUO: TemplateInfo = {
  templateId: 'duo',
  templateType: 'custom',
  fields: [],
  liveSources: {
    resolution: SCENE,
    defaultPosition: CENTRED,
    sources: [
      plate('l1', { x: 0, y: 0, width: 960, height: 1080 }),
      plate('l2', { x: 960, y: 0, width: 960, height: 1080 }),
    ],
  },
};

/** `look-1` shows l1 full frame; `look-3` shows l1, l2 and l3 in thirds. */
const TRIPLE: TemplateInfo = {
  templateId: 'triple',
  templateType: 'custom',
  fields: [],
  liveSources: {
    resolution: SCENE,
    defaultPosition: CENTRED,
    sources: [plate('l1', FULL), plate('l2', third(1)), plate('l3', third(2))],
    looks: [
      { id: 'look-1', name: 'look-1', entered: { mode: 'cut' }, rects: { l1: FULL } },
      {
        id: 'look-3',
        name: 'look-3',
        entered: { mode: 'cut' },
        rects: { l1: third(0), l2: third(1), l3: third(2) },
      },
    ],
    defaultLookId: 'look-1',
  },
};

function bind(templateId: string, plates: Record<string, string>): SourceAssignments {
  return {
    assignments: Object.entries(plates).map(([plateId, sourceId]) => ({
      templateId,
      plateId,
      sourceId,
    })),
  };
}

// ── The fake clock both sides read ───────────────────────────────────────────────────────────

interface FakeRouteClock extends RouteClock {
  t: number;
  /** Extra milliseconds the next `sleep`s overshoot by, in order — a late timer. */
  readonly overruns: number[];
  sleeps: number;
}

function fakeRouteClock(): FakeRouteClock {
  const clock: FakeRouteClock = {
    t: 1_000,
    overruns: [],
    sleeps: 0,
    now: () => clock.t,
    sleep: (ms) => {
      clock.sleeps += 1;
      clock.t += Math.max(0, ms) + (clock.overruns.shift() ?? 0);
      return Promise.resolve();
    },
  };
  return clock;
}

// ── The rig ──────────────────────────────────────────────────────────────────────────────────

type SeamSend = (
  line: string,
  options?: { readonly routeEpoch?: string },
) => Promise<{ ok: boolean; errorCode?: string }>;

interface Rig {
  readonly r: CasparRuntime;
  readonly mock: MockHandle;
  readonly backup: MockHandle | null;
  readonly provider: LocalPlayoutSources;
  readonly sources: PlayoutSources;
  readonly clock: FakeRouteClock;
  readonly seam: SeamSend;
  /** Everything the primary RECEIVED since `from`, in order. */
  sentSince(from: number): Promise<string[]>;
  mark(): Promise<number>;
  /** Everything the backup received, in order. */
  backupLines(): Promise<string[]>;
}

async function newMock(clock: FakeRouteClock, oscPort: number, amcpPort = 0) {
  const trace = path.join(
    os.tmpdir(),
    `cg-route-plates-${String(process.pid)}-${String(Date.now())}-${String(Math.round(performance.now() * 1000))}.ndjson`,
  );
  const mock = await createMock({
    amcpPort,
    oscPort,
    oscHost: '127.0.0.1',
    oscHz: 30,
    channels: 2,
    tracePath: trace,
    now: () => clock.t,
  });
  mocks.push(mock);
  traces.push(trace);
  return { mock, trace };
}

async function linesOf(m: MockHandle, trace: string): Promise<string[]> {
  await m.traceFlush();
  return fs
    .readFileSync(trace, 'utf-8')
    .split('\n')
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as { dir: string; line: string })
    .filter((e) => e.dir === 'recv')
    .map((e) => e.line);
}

async function boot(
  options: {
    readonly assignments: SourceAssignments;
    readonly provider?: LocalPlayoutSources;
    readonly backup?: boolean;
  } = { assignments: bind('single', { l1: INPUT_3 }) },
): Promise<Rig> {
  const clock = fakeRouteClock();
  const provider = options.provider ?? new LocalPlayoutSources({ inputs: INPUTS });
  const sources = new PlayoutSources({
    provider,
    signedIn: () => true,
    hostIsOurs: () => true,
    channelFor: (_host, channel) => channel,
    layerRange: BAND,
    log: () => undefined,
  });
  readers.push(sources);
  await sources.refresh(0);

  const oscPort = await freeUdpPort();
  const { mock, trace } = await newMock(clock, oscPort);
  let backup: { mock: MockHandle; trace: string } | null = null;
  let backupOsc = 0;
  if (options.backup === true) {
    backupOsc = await freeUdpPort();
    backup = await newMock(clock, backupOsc);
  }
  const config: ConnectionConfig = {
    servers: {
      A: { host: '127.0.0.1', amcpPort: mock.amcpPort, oscPort },
      ...(backup !== null
        ? { B: { host: '127.0.0.1', amcpPort: backup.mock.amcpPort, oscPort: backupOsc } }
        : {}),
    },
    strategy: 'mirror-sync',
    // A dying backup must never flip the primary mid-test.
    autoFailoverEnabled: false,
  };
  let seam: SeamSend | null = null;
  const r = new CasparRuntime(
    config,
    {},
    {
      fixedSlots: validateFixedBank(BANK, { policy: DEFAULT_LAYER_POLICY, reservedLayers: [] }),
      fixedBanks: [BANK],
      layerPolicy: DEFAULT_LAYER_POLICY,
      reservedLayers: [],
      lookMixerHoldMs: 0,
      sweepMs: 150,
      sourceCatalog: sources.catalog(),
      sourceAssignments: options.assignments,
      routeClock: clock,
      seamForTest: (send) => {
        seam = send;
      },
    },
  );
  runtime = r;
  // The bridge's own wiring (`createBridge`), verbatim.
  sources.onCatalogChanged((catalog) => r.setResolvedSourceCatalog(catalog));
  r.setInputsConfirmer((timeoutMs) => sources.confirmInputs(timeoutMs));
  r.start();
  await r.startServing();
  for (const template of [SINGLE, DUO, TRIPLE]) {
    r.templateImport(template, `<!doctype html><html><body>${template.templateId}</body></html>`);
  }
  await r.whenServerHealthy(HEALTH_MS);
  await awaitChannelModeRead(r);
  await delay(250);
  if (seam === null) throw new Error('the seam was not handed over');
  const backupHandle = backup;
  return {
    r,
    mock,
    backup: backupHandle?.mock ?? null,
    provider,
    sources,
    clock,
    seam,
    mark: async () => (await linesOf(mock, trace)).length,
    sentSince: async (from) => (await linesOf(mock, trace)).slice(from),
    backupLines: async () =>
      backupHandle === null ? [] : linesOf(backupHandle.mock, backupHandle.trace),
  };
}

/** Load the bed on `templateId`; take it. */
async function take(r: CasparRuntime, templateId: string): Promise<void> {
  expect(await r.loadFixed(BED, ROW, templateId, {})).toEqual({ accepted: true });
  const verdict = await r.take(ROW);
  expect(verdict, JSON.stringify(verdict)).toEqual({ accepted: true });
}

const layerOf = (r: CasparRuntime, plateId: string): number => {
  const layer = (r.liveLayers().get(ROW) ?? []).find((rec) => rec.sourceId === plateId)?.slot.layer;
  if (layer === undefined) throw new Error(`${plateId} holds no seat`);
  return layer;
};

const row = (r: CasparRuntime) => r.stackSnapshot().find((i) => i.itemId === ROW);

const routeLines = (lines: readonly string[]): string[] =>
  lines.filter((l) => /^LOADBG /.test(l) || /route:\/\//.test(l) || /^PLAY \d+-\d+$/.test(l));

// ── §1.G — the gate is gone ──────────────────────────────────────────────────────────────────

describe('§1.G — the gate is gone', () => {
  it('🔴 a take of “ورودی ۳” on channel 2 seats it: `LOADBG 2-60 "route://9-12"`, then the bare `PLAY 2-60`', async () => {
    const { r, mock, mark, sentSince } = await boot();
    const from = await mark();
    await take(r, 'single');
    const lines = await sentSince(from);
    const loaded = lines.indexOf('LOADBG 2-60 "route://9-12"');
    expect(loaded).toBeGreaterThanOrEqual(0);
    expect(lines.indexOf('PLAY 2-60')).toBeGreaterThan(loaded);
    expect(mock.layerState({ channel: 2, layer: 60 })?.producer).toBe('route');
    expect(row(r)?.takeRefusal).toBeUndefined();
  });
});

// ── §1.A — audio (rule 2) ────────────────────────────────────────────────────────────────────

describe('§1.A — rule 2: a route plate starts silent and is raised only by the operator', () => {
  it('🔴 `VOLUME 0` is committed before the `LOADBG` and the `PLAY`; no `VOLUME 1` reaches the plate from the take or the connect sweep', async () => {
    const { r, mark, sentSince } = await boot();
    const from = await mark();
    await take(r, 'single');
    // The WHOLE wire since the rig came up: the connect sweep included.
    const all = await sentSince(0);
    const lines = await sentSince(from);
    const mute = lines.indexOf('MIXER 2-60 VOLUME 0 DEFER');
    const hide = lines.indexOf('MIXER 2-60 OPACITY 0 DEFER');
    const commit = lines.indexOf('MIXER 2 COMMIT', Math.max(mute, hide));
    const loaded = lines.indexOf('LOADBG 2-60 "route://9-12"');
    const played = lines.indexOf('PLAY 2-60');
    expect(mute).toBeGreaterThanOrEqual(0);
    expect(hide).toBeGreaterThanOrEqual(0);
    expect(commit).toBeGreaterThan(Math.max(mute, hide));
    expect(loaded).toBeGreaterThan(commit);
    expect(played).toBeGreaterThan(loaded);
    expect(all.filter((l) => /^MIXER 2-60 VOLUME (?!0(\s|$))/.test(l))).toEqual([]);
    // Control: the PAGE's own layer is raised exactly as today.
    expect(lines.some((l) => /^MIXER 2-59 VOLUME 1(\s|$)/.test(l))).toBe(true);
  });

  it('🔴 an operator raise sends the declared value by a 25-frame ramp; control: PANIC is an immediate 0', async () => {
    const { r, mark, sentSince } = await boot();
    await take(r, 'single');
    let from = await mark();
    expect(await r.setLivePlateVolume(ROW, 'l1', 0.8)).toMatchObject({ ok: true });
    expect(await sentSince(from)).toContain('MIXER 2-60 VOLUME 0.8 25');
    from = await mark();
    await r.silenceAllLivePlates();
    const panic = (await sentSince(from)).filter((l) => l.startsWith('MIXER 2-60 VOLUME'));
    expect(panic).toEqual(['MIXER 2-60 VOLUME 0']);
  });
});

// ── §1.B — showing (rule 4, C2) ──────────────────────────────────────────────────────────────

describe('§1.B — rule 4: LOADBG, at least 40 ms, the bare PLAY — at most 200 ms in all', () => {
  it('🔴 on the shared clock: `LOADBG` → `PLAY` is ≥ 40 ms and ≤ 200 ms, the `PLAY` carries no transition, and the reveal follows it', async () => {
    const { r, mock } = await boot();
    const before = mock.receivedCommands().length;
    await take(r, 'single');
    const got = mock.receivedCommands().slice(before);
    const loaded = got.filter((c) => c.line === 'LOADBG 2-60 "route://9-12"');
    const played = got.filter((c) => c.line.startsWith('PLAY 2-60'));
    expect(loaded).toHaveLength(1);
    expect(played.map((c) => c.line)).toEqual(['PLAY 2-60']); // a CUT: no MIX, no argument
    const gap = (played[0]?.at ?? NaN) - (loaded[0]?.at ?? NaN);
    expect(gap).toBeGreaterThanOrEqual(ROUTE_LOADBG_MIN_MS);
    expect(gap).toBeLessThanOrEqual(ROUTE_LOADBG_MAX_MS);
    // The reveal is one or two ticks AFTER the PLAY, so the stale first frame passes hidden.
    const reveal = got.find((c) => c.line === 'MIXER 2-60 OPACITY 1 DEFER');
    expect(reveal?.at).toBeGreaterThan(played[0]?.at ?? Infinity);
  });

  it('🔴 a PLAY that cannot follow within 200 ms is not sent: the LOADBG is replaced by a fresh one, then the pair lands', async () => {
    const { r, mock, clock } = await boot();
    clock.overruns.push(250); // the first wait overshoots the window
    const before = mock.receivedCommands().length;
    await take(r, 'single');
    const got = mock.receivedCommands().slice(before);
    const pair = got.filter(
      (c) => c.line === 'LOADBG 2-60 "route://9-12"' || c.line === 'PLAY 2-60',
    );
    expect(pair.map((c) => c.line)).toEqual([
      'LOADBG 2-60 "route://9-12"',
      'LOADBG 2-60 "route://9-12"',
      'PLAY 2-60',
    ]);
    const gap = (pair[2]?.at ?? NaN) - (pair[1]?.at ?? NaN);
    expect(gap).toBeGreaterThanOrEqual(ROUTE_LOADBG_MIN_MS);
    expect(gap).toBeLessThanOrEqual(ROUTE_LOADBG_MAX_MS);
  });

  it('missed twice, the seat is refused like a refused PLAY — the take is refused and nothing of it stays', async () => {
    const { r, mock, clock, mark, sentSince } = await boot();
    clock.overruns.push(250, 250);
    expect(await r.loadFixed(BED, ROW, 'single', {})).toEqual({ accepted: true });
    const from = await mark();
    const verdict = await r.take(ROW);
    expect(verdict).toMatchObject({ accepted: false, errorCode: ROUTE_WINDOW_MISSED_CODE });
    const lines = await sentSince(from);
    expect(lines.filter((l) => l === 'PLAY 2-60')).toEqual([]);
    expect(lines).toContain('CLEAR 2-60');
    expect(mock.layerState({ channel: 2, layer: 60 })?.producer ?? 'empty').toBe('empty');
    expect(r.liveLayers().get(ROW) ?? []).toEqual([]);
  });

  it('control: a plate that is not a Playout route keeps its wire — no LOADBG, and the route clock never waits', async () => {
    const { r, clock, mark, sentSince } = await boot({
      assignments: bind('single', { l1: MULTICAST }),
    });
    const from = await mark();
    await take(r, 'single');
    const lines = await sentSince(from);
    expect(lines.filter((l) => l.startsWith('LOADBG'))).toEqual([]);
    expect(lines).toContain('PLAY 2-60 "udp://239.255.0.1:5000?reuse=1"');
    expect(clock.sleeps).toBe(0);
  });
});

describe('§1.B — multi-box: one hide COMMIT, the pairs, one reveal COMMIT, and never BEGIN', () => {
  it('🔴 a TAKE of two route plates: both hides in one COMMIT, two LOADBG/PLAY pairs, both reveals in one COMMIT', async () => {
    const { r, mark, sentSince } = await boot({
      assignments: bind('duo', { l1: INPUT_3, l2: INPUT_5 }),
    });
    const from = await mark();
    await take(r, 'duo');
    const lines = await sentSince(from);
    const [a, b] = [layerOf(r, 'l1'), layerOf(r, 'l2')];
    const commits = lines.flatMap((l, i) => (l === 'MIXER 2 COMMIT' ? [i] : []));
    expect(commits).toHaveLength(2);
    const [hideCommit, revealCommit] = commits as [number, number];
    for (const layer of [a, b]) {
      const hide = lines.indexOf(`MIXER 2-${String(layer)} OPACITY 0 DEFER`);
      const loaded = lines.findIndex((l) => l.startsWith(`LOADBG 2-${String(layer)} "route://9-`));
      const played = lines.indexOf(`PLAY 2-${String(layer)}`);
      const reveal = lines.indexOf(`MIXER 2-${String(layer)} OPACITY 1 DEFER`);
      expect(hide).toBeGreaterThanOrEqual(0);
      expect(hide).toBeLessThan(hideCommit);
      expect(loaded).toBeGreaterThan(hideCommit);
      expect(played).toBeGreaterThan(loaded);
      expect(played).toBeLessThan(revealCommit);
      expect(reveal).toBeGreaterThan(played);
      expect(reveal).toBeLessThan(revealCommit);
    }
    expect((await sentSince(0)).filter((l) => /^BEGIN\b/i.test(l))).toEqual([]);
  });

  it('🔴 a LOOK SWITCH that shows two new route plates: one hide COMMIT, two pairs, one reveal COMMIT; control: switching between looks that share their plates sends no PLAY', async () => {
    // At the take the two routes have no signal, so look-3's presets are not seated.
    const provider = new LocalPlayoutSources({ inputs: INPUTS });
    provider.setAvailable('li-input5', false, 'no signal');
    provider.setAvailable('li-input6', false, 'no signal');
    const { r, sources, mark, sentSince } = await boot({
      assignments: bind('triple', { l1: MULTICAST, l2: INPUT_5, l3: INPUT_6 }),
      provider,
    });
    await take(r, 'triple');
    expect((r.liveLayers().get(ROW) ?? []).map((rec) => rec.sourceId)).toEqual(['l1']);
    // …then they come up, and the operator shows look-3.
    provider.setAvailable('li-input5', true);
    provider.setAvailable('li-input6', true);
    await sources.refresh(0);
    let from = await mark();
    expect(await r.setActiveLook(ROW, 'look-3')).toEqual({ ok: true });
    let lines = await sentSince(from);
    const [b, c] = [layerOf(r, 'l2'), layerOf(r, 'l3')];
    const commits = lines.flatMap((l, i) => (l === 'MIXER 2 COMMIT' ? [i] : []));
    expect(commits).toHaveLength(2);
    const [hideCommit, revealCommit] = commits as [number, number];
    for (const layer of [b, c]) {
      const target = `2-${String(layer)}`;
      expect(lines.indexOf(`MIXER ${target} OPACITY 0 DEFER`)).toBeLessThan(hideCommit);
      const loaded = lines.findIndex((l) => l.startsWith(`LOADBG ${target} "route://9-`));
      expect(loaded).toBeGreaterThan(hideCommit);
      expect(lines.indexOf(`PLAY ${target}`)).toBeGreaterThan(loaded);
      expect(lines.indexOf(`PLAY ${target}`)).toBeLessThan(revealCommit);
      expect(lines.indexOf(`MIXER ${target} OPACITY 1 DEFER`)).toBeLessThan(revealCommit);
    }

    // Control: look-3 → look-1 → look-3 share their plates — no PLAY, no LOADBG, one COMMIT each.
    for (const look of ['look-1', 'look-3']) {
      from = await mark();
      expect(await r.setActiveLook(ROW, look)).toEqual({ ok: true });
      lines = await sentSince(from);
      expect(routeLines(lines)).toEqual([]);
      expect(lines.filter((l) => /^PLAY /.test(l))).toEqual([]);
      expect(lines.filter((l) => l === 'MIXER 2 COMMIT')).toHaveLength(1);
    }
    expect((await sentSince(0)).filter((l) => /^BEGIN\b/i.test(l))).toEqual([]);
  });
});

describe('§1.B — a held route plate stays playing, hidden, and comes back by the reveal alone', () => {
  async function onLookThree(): Promise<Rig> {
    const rig = await boot({
      assignments: bind('triple', { l1: MULTICAST, l2: INPUT_5, l3: INPUT_6 }),
    });
    await take(rig.r, 'triple');
    expect(await rig.r.setActiveLook(ROW, 'look-3')).toEqual({ ok: true });
    return rig;
  }

  it('🔴 held: `OPACITY 0` with the mute, never `PAUSE`, never a `BLEND` — and the layer keeps its producer', async () => {
    const { r, mock, mark, sentSince } = await onLookThree();
    const from = await mark();
    expect(await r.setActiveLook(ROW, 'look-1')).toEqual({ ok: true });
    const lines = await sentSince(from);
    for (const plateId of ['l2', 'l3']) {
      const target = `2-${String(layerOf(r, plateId))}`;
      expect(lines).toContain(`MIXER ${target} VOLUME 0 DEFER`);
      expect(lines).toContain(`MIXER ${target} OPACITY 0 DEFER`);
      expect(mock.layerState({ channel: 2, layer: layerOf(r, plateId) })?.producer).toBe('route');
    }
    const all = await sentSince(0);
    expect(all.filter((l) => /^PAUSE\b/.test(l))).toEqual([]);
    expect(all.filter((l) => /\bBLEND\b/.test(l))).toEqual([]);
  });

  it('🔴 showing it again when its input is no longer available refuses the switch, all or nothing; control: available, the reveal alone brings it back', async () => {
    const { r, provider, sources, mark, sentSince } = await onLookThree();
    expect(await r.setActiveLook(ROW, 'look-1')).toEqual({ ok: true });

    provider.setAvailable('li-input5', false, 'no signal');
    await sources.refresh(0);
    let from = await mark();
    expect(await r.setActiveLook(ROW, 'look-3')).toMatchObject({
      ok: false,
      reason: 'source-unavailable',
    });
    expect(await sentSince(from)).toEqual([]);
    expect(r.activeLookId(ROW)).toBe('look-1');

    provider.setAvailable('li-input5', true);
    await sources.refresh(0);
    from = await mark();
    expect(await r.setActiveLook(ROW, 'look-3')).toEqual({ ok: true });
    const lines = await sentSince(from);
    expect(routeLines(lines)).toEqual([]);
    for (const plateId of ['l2', 'l3']) {
      expect(lines).toContain(`MIXER 2-${String(layerOf(r, plateId))} OPACITY 1 DEFER`);
    }
  });

  it('🔴 a reconnect keeps a held route HIDDEN: the re-send carries its `OPACITY 0`; control: the shown plate gets its `OPACITY 1`', async () => {
    const { r, mock, mark, sentSince } = await onLookThree();
    expect(await r.setActiveLook(ROW, 'look-1')).toEqual({ ok: true });
    const from = await mark();
    mock.closeAllAmcpConnections();
    await waitFor(() => r.health().primary.state !== 'healthy', 'the drop');
    await waitFor(() => r.health().primary.state === 'healthy', 'the reconnect');
    const shown = `2-${String(layerOf(r, 'l1'))}`;
    /*
      🔴 `PLATE-BAND-01` / `P-057` — WAIT FOR THE RE-SEND'S OWN END: the row's one `MIXER 2 COMMIT`,
      which `#resendLiveMixerState` sends only once every `DEFER` line of the row has been answered
      (one row, one channel here, as `look-switch-all-or-nothing`'s "first commit after a reconnect").
      Waiting for the SHOWN plate's `OPACITY 1` — the first record's last line — read the held plates'
      lines before they were sent: the local gate at `1ce93cb1` read 9 lines and missed
      `MIXER 2-61 OPACITY 0 DEFER`, the same race `media-plates` had.
    */
    const deadline = Date.now() + 5_000;
    let lines = await sentSince(from);
    while (!lines.includes('MIXER 2 COMMIT') && Date.now() < deadline) {
      await delay(50);
      lines = await sentSince(from);
    }
    expect(lines, 'the re-send reached its commit').toContain('MIXER 2 COMMIT');
    expect(lines).toContain(`MIXER ${shown} OPACITY 1 DEFER`);
    for (const plateId of ['l2', 'l3']) {
      const target = `2-${String(layerOf(r, plateId))}`;
      expect(lines).toContain(`MIXER ${target} OPACITY 0 DEFER`);
      expect(lines).not.toContain(`MIXER ${target} OPACITY 1 DEFER`);
    }
    // …and no route was re-sent: a reconnect is mixer state only.
    expect(routeLines(lines)).toEqual([]);
  });
});

// ── §1.C — epoch (rule 5, C3) ────────────────────────────────────────────────────────────────

describe('§1.C — rule 5: a route is never sent from a stale or unknown epoch', () => {
  async function dropAndReconnect(r: CasparRuntime, drop: () => void): Promise<void> {
    drop();
    await waitFor(() => r.health().primary.state !== 'healthy', 'the drop');
    await waitFor(() => r.health().primary.state === 'healthy', 'the reconnect');
  }

  it('🔴 after a core restart as the Playout lives it (new epoch, holders renumbered, AMCP dropped): no route is re-sent, the row says it waits; a fresh take seats the NEW holder layer', async () => {
    const { r, mock, provider, mark, sentSince } = await boot();
    await take(r, 'single');
    const from = await mark();
    const epoch = provider.simulateCoreRestart({ dropAmcp: () => mock.closeAllAmcpConnections() });
    expect(epoch).toBe('epoch-2');
    await waitFor(() => r.health().primary.state !== 'healthy', 'the drop');
    await waitFor(() => row(r)?.takeRefusal?.code === ROUTE_WAITING_CODE, 'the waiting line');
    expect(row(r)?.takeRefusal).toMatchObject({ code: ROUTE_WAITING_CODE, plateId: 'l1' });
    expect(routeLines(await sentSince(from))).toEqual([]);

    // Today's restore: the operator takes the row again — from the fresh D10, the new layer.
    expect(await r.out(ROW)).toMatchObject({ accepted: true });
    const retake = await mark();
    expect(await r.take(ROW)).toEqual({ accepted: true });
    const lines = await sentSince(retake);
    expect(lines).toContain('LOADBG 2-60 "route://9-112"');
    expect(lines.filter((l) => l.includes('route://9-12"'))).toEqual([]);
    expect(row(r)?.takeRefusal).toBeUndefined();
  });

  it('🔴 a core that comes back EMPTY: the seat is dropped (`B-227`), PUT BACK ON AIR restores from the fresh D10 at the new layer', async () => {
    const { r, mock, provider, clock } = await boot();
    await take(r, 'single');
    const amcpPort = mock.amcpPort;
    const oscPort = r.config().servers.A.oscPort;
    provider.simulateCoreRestart();
    await mock.stop();
    mocks = mocks.filter((m) => m !== mock);
    await waitFor(() => r.health().primary.state !== 'healthy', 'the drop');
    const { mock: reborn, trace } = await newMock(clock, oscPort, amcpPort);
    await waitFor(() => r.health().primary.state === 'healthy', 'the reconnect');
    await waitFor(() => (r.liveLayers().get(ROW) ?? []).length === 0, 'B-227 to drop the seat');

    const restored = await r.restoreEmptiedAir([ROW]);
    expect(restored.results).toEqual([{ itemId: ROW, ok: true }]);
    const lines = await linesOf(reborn, trace);
    expect(lines).toContain('LOADBG 2-60 "route://9-112"');
    expect(lines.filter((l) => l.includes('route://9-12"'))).toEqual([]);
  });

  it('🔴 with the Playout’s API down at the reconnect, no route is sent — and a take waits too', async () => {
    const { r, mock, provider, mark, sentSince } = await boot();
    await take(r, 'single');
    provider.setFailing(true);
    const from = await mark();
    await dropAndReconnect(r, () => mock.closeAllAmcpConnections());
    await waitFor(() => row(r)?.takeRefusal?.code === ROUTE_WAITING_CODE, 'the waiting line');
    expect(await r.out(ROW)).toMatchObject({ accepted: true });
    expect(await r.take(ROW)).toMatchObject({ accepted: false, errorCode: ROUTE_WAITING_CODE });
    expect(routeLines(await sentSince(from))).toEqual([]);
  });

  it('control: a reconnect under the SAME epoch restores as today — mixer state only, no PLAY, no waiting line', async () => {
    const { r, mock, mark, sentSince } = await boot();
    await take(r, 'single');
    const from = await mark();
    await dropAndReconnect(r, () => mock.closeAllAmcpConnections());
    await waitFor(
      () => r.health().primary.state === 'healthy' && row(r) !== undefined,
      'the row after the reconnect',
    );
    await delay(300);
    const lines = await sentSince(from);
    expect(routeLines(lines)).toEqual([]);
    expect(lines).toContain('MIXER 2-60 OPACITY 1 DEFER');
    expect(row(r)?.takeRefusal).toBeUndefined();
    expect(mock.layerState({ channel: 2, layer: 60 })?.producer).toBe('route');
  });

  it('🔴 the send seam: a planted route line of a stale epoch is refused and NOTHING is sent; control: the current epoch passes', async () => {
    const { r, seam, mark, sentSince } = await boot();
    await take(r, 'single'); // confirms epoch-1 on this connection
    const from = await mark();
    expect(await seam('PLAY 2-61', { routeEpoch: 'epoch-0' })).toMatchObject({
      ok: false,
      errorCode: ROUTE_EPOCH_STALE_CODE,
    });
    expect(await seam('LOADBG 2-61 "route://9-12"', { routeEpoch: '' })).toMatchObject({
      ok: false,
      errorCode: ROUTE_EPOCH_STALE_CODE,
    });
    expect(await sentSince(from)).toEqual([]);
    expect(await seam('LOADBG 2-61 "route://9-12"', { routeEpoch: 'epoch-1' })).toMatchObject({
      ok: true,
    });
    expect(await sentSince(from)).toEqual(['LOADBG 2-61 "route://9-12"']);
  });
});

// ── §1.D — destination and availability (rule 1) ────────────────────────────────────────────

describe('§1.D — rule 1: only on a channel the input names, and only while it is available', () => {
  it('🔴 “ورودی ۴” (channel 1 only) on channel 2 is refused before any AMCP, naming the plate and the channel', async () => {
    const provider = new LocalPlayoutSources({ inputs: INPUTS });
    provider.setAvailable('li-input4', true);
    const { r, mark, sentSince } = await boot({
      assignments: bind('single', { l1: INPUT_4 }),
      provider,
    });
    expect(await r.loadFixed(BED, ROW, 'single', {})).toEqual({ accepted: true });
    const from = await mark();
    const verdict = await r.take(ROW);
    expect(verdict).toMatchObject({ accepted: false, errorCode: 'source-not-showable' });
    expect(verdict).toMatchObject({ message: 'Plate "l1": “ورودی ۴” can\'t be shown on CH 2.' });
    expect(await sentSince(from)).toEqual([]);
    expect(row(r)?.takeRefusal).toMatchObject({
      code: 'source-not-showable',
      plateId: 'l1',
      sourceName: 'ورودی ۴',
    });
  });

  it('🔴 an input with `available: false` is refused with the Playout’s reason, before any AMCP', async () => {
    const { r, mark, sentSince } = await boot({ assignments: bind('single', { l1: INPUT_4 }) });
    expect(await r.loadFixed(BED, ROW, 'single', {})).toEqual({ accepted: true });
    const from = await mark();
    const verdict = await r.take(ROW);
    expect(verdict).toMatchObject({ accepted: false, errorCode: 'source-unavailable' });
    expect(verdict).toMatchObject({ message: 'Plate "l1": “ورودی ۴” is unavailable: no signal' });
    expect(await sentSince(from)).toEqual([]);
  });

  it('control: “ورودی ۳” (channels 1 and 2) on channel 2 plays', async () => {
    const { r, mock } = await boot();
    await take(r, 'single');
    expect(mock.layerState({ channel: 2, layer: 60 })?.producer).toBe('route');
  });
});

// ── §1.E — the seam's guard (rule 3, C5) ─────────────────────────────────────────────────────

describe('§1.E — the send seam refuses what this station may never send', () => {
  it('🔴 planted `CLEAR 2`, `MIXER 2 CLEAR`, `SWAP`, `SET MODE`, a consumer `ADD` and `CLEAR 2-5` are each refused, and nothing reaches CasparCG; control: `CLEAR 2-60` on our own empty layer passes', async () => {
    const { seam, mark, sentSince } = await boot();
    const from = await mark();
    for (const line of [
      'CLEAR 2',
      'MIXER 2 CLEAR',
      'SWAP 2-60 2-61',
      'SET 2 MODE 1080i5000',
      'ADD 2 SCREEN',
      'CLEAR 2-5',
    ]) {
      const sent = await seam(line);
      expect(sent.ok, line).toBe(false);
      expect(sent.errorCode, line).toMatch(/^amcp-guard-/);
    }
    expect(await sentSince(from)).toEqual([]);
    expect(await seam('CLEAR 2-60')).toMatchObject({ ok: true });
    expect(await sentSince(from)).toEqual(['CLEAR 2-60']);
  });

  it('🔴 a planted command targeting channel 9 (the holder) is refused at the seam; control: channel 2 passes', async () => {
    const { seam, mark, sentSince } = await boot();
    const from = await mark();
    for (const line of ['MIXER 9-12 OPACITY 0', 'STOP 9-12', 'CLEAR 9-60', 'CALL 9-12 SEEK 0']) {
      expect(await seam(line), line).toMatchObject({ ok: false, errorCode: 'amcp-guard-channel' });
    }
    expect(await sentSince(from)).toEqual([]);
    expect(await seam('MIXER 2-70 OPACITY 1')).toMatchObject({ ok: true });
    expect(await sentSince(from)).toEqual(['MIXER 2-70 OPACITY 1']);
  });
});

// ── §1.F — backup (rule 1, C4) ───────────────────────────────────────────────────────────────

describe('§1.F — C4: a route plate is never mirrored to the backup', () => {
  it('🔴 no route command reaches server B, and the row says so; control: a stream plate mirrors as today', async () => {
    const { r, backupLines } = await boot({
      assignments: bind('duo', { l1: INPUT_3, l2: MULTICAST }),
      backup: true,
    });
    await take(r, 'duo');
    const onB = await backupLines();
    expect(routeLines(onB)).toEqual([]);
    const stream = layerOf(r, 'l2');
    expect(onB).toContain(`PLAY 2-${String(stream)} "udp://239.255.0.1:5000?reuse=1"`);
    await waitFor(() => row(r)?.backupUnmirrored === true, 'the backup line');
  });

  it('control: with no backup declared the row carries no backup line', async () => {
    const { r } = await boot();
    await take(r, 'single');
    await delay(100);
    expect(row(r)?.backupUnmirrored).toBeUndefined();
  });
});

// ── FIELD-FIXES-01-A, on route plates ────────────────────────────────────────────────────────

describe('FIELD-FIXES-01-A holds for route plates exactly as for any other', () => {
  function refuseBarePlay(m: MockHandle, target: string): void {
    const fallback = defaultHandlers().get('PLAY');
    if (fallback === undefined) throw new Error('no default PLAY');
    m.setHandler('PLAY', (req, ctx) =>
      req.raw === `PLAY ${target}` ? { kind: 'err', code: 404, verb: 'PLAY' } : fallback(req, ctx),
    );
  }

  it('🔴 a refused route PLAY on a fresh take undoes only this take’s layers — the page it added and the route it loaded', async () => {
    const { r, mock, mark, sentSince } = await boot();
    refuseBarePlay(mock, '2-60');
    expect(await r.loadFixed(BED, ROW, 'single', {})).toEqual({ accepted: true });
    const from = await mark();
    expect(await r.take(ROW)).toMatchObject({
      accepted: false,
      errorCode: 'amcp-404',
      command: 'PLAY 2-60',
      refusalOnRow: true,
    });
    const lines = await sentSince(from);
    // The LOADBG landed, so this take put a producer on 2-60 (in its background): it comes down.
    // The graphic this take ADDED comes off 2-59, as for any refused plate.
    expect(lines).toContain('CLEAR 2-60');
    expect(lines).toContain('CLEAR 2-59');
    expect(lines.filter((l) => /^CLEAR 2-(?!(59|60)$)/.test(l))).toEqual([]);
    expect(
      lines.some((l) => /^CG 2-59 PLAY/.test(l)),
      'the graphic never plays',
    ).toBe(false);
    expect(lines).not.toContain('MIXER 2-60 OPACITY 1 DEFER');
    for (const layer of [59, 60]) {
      const state = mock.layerState({ channel: 2, layer });
      expect(state?.producer ?? 'empty', `2-${String(layer)}`).toBe('empty');
      expect(state?.backgroundProducer ?? 'empty', `2-${String(layer)}`).toBe('empty');
    }
    expect(r.liveLayers().get(ROW) ?? []).toEqual([]);
    expect(row(r)?.takeRefusal).toMatchObject({
      code: 'amcp-404',
      plateId: 'l1',
      sourceName: 'ورودی ۳',
    });
  });

  it('🔴 a refused route SWAP leaves the old working producer on its layer', async () => {
    const { r, mock, mark, sentSince } = await boot({
      assignments: bind('single', { l1: MULTICAST }),
    });
    await take(r, 'single');
    expect(mock.layerState({ channel: 2, layer: 60 })?.producer).toBe('ffmpeg');
    refuseBarePlay(mock, '2-60');
    const from = await mark();
    const swapped = await r.swapLiveSource(ROW, 'l1', INPUT_3);
    expect(swapped.ok).toBe(false);
    const lines = await sentSince(from);
    expect(lines).toContain('LOADBG 2-60 "route://9-12"');
    expect(lines.filter((l) => l.startsWith('CLEAR 2-60'))).toEqual([]);
    expect(mock.layerState({ channel: 2, layer: 60 })?.producer).toBe('ffmpeg');
    // …and the ledger still names the stream: only the background changed (`loaded`).
    const seat = (r.liveLayers().get(ROW) ?? []).find((rec) => rec.sourceId === 'l1');
    expect(seat?.producer).toBe('"udp://239.255.0.1:5000?reuse=1"');
  });
});

// ── `PLAYOUT-FEATURES-01` B (`B-298`) — an NDI input that is a channel's own output ──────────────

describe('PLAYOUT-FEATURES-01 B (B-298) — `ownOutputOf`: refused on its own channel, offered on every other', () => {
  const ndi = (id: string, name: string, source: string, own?: number): FakeInput => ({
    id,
    name,
    casparHost: '127.0.0.1',
    producer: { kind: 'ndi', source },
    format: '1080i5000',
    aspect: 1.7778,
    // The loopback host names the Playout that listed it (their §3).
    ...(own !== undefined ? { ownOutputOf: { casparHost: '127.0.0.1', casparChannel: own } } : {}),
  });
  const WITH_OWN: readonly FakeInput[] = [
    ...INPUTS,
    ndi('li-ndi-own2', 'NDI کانالِ ۲', 'APASAI (APASAI-CGTEST2)', 2),
    ndi('li-ndi-own1', 'NDI کانالِ ۱', 'APASAI (APASAI)', 1),
  ];
  const OWN_2 = inputSourceId('li-ndi-own2');
  const OWN_1 = inputSourceId('li-ndi-own1');
  const STUDIO = inputSourceId('li-studio1');

  it('🔴 the own output of CH 2, taken on CH 2, is refused before any AMCP, naming it and the loop', async () => {
    const { r, sources, mark, sentSince } = await boot({
      assignments: bind('single', { l1: OWN_2 }),
      provider: new LocalPlayoutSources({ inputs: WITH_OWN }),
    });
    expect(sources.catalog().sources.find((s) => s.id === OWN_2)?.ownOutputOf).toBe(2);
    expect(await r.loadFixed(BED, ROW, 'single', {})).toEqual({ accepted: true });
    const from = await mark();
    const verdict = await r.take(ROW);
    expect(verdict).toMatchObject({
      accepted: false,
      errorCode: 'source-own-output',
      message: 'Plate "l1": “NDI کانالِ ۲” is the own output of CH 2 (would loop).',
    });
    expect(await sentSince(from)).toEqual([]);
    expect(row(r)?.takeRefusal).toMatchObject({
      code: 'source-own-output',
      plateId: 'l1',
      sourceName: 'NDI کانالِ ۲',
    });
  });

  it('control: the own output of CH 1 plays on CH 2, and an NDI input with no `ownOutputOf` plays too', async () => {
    const { r, mock, mark, sentSince } = await boot({
      assignments: bind('duo', { l1: OWN_1, l2: STUDIO }),
      provider: new LocalPlayoutSources({ inputs: WITH_OWN }),
    });
    const from = await mark();
    await take(r, 'duo');
    const lines = await sentSince(from);
    expect(lines.some((l) => /^PLAY 2-\d+ \[NDI\] "APASAI \(APASAI\)"$/.test(l))).toBe(true);
    expect(lines.some((l) => /^PLAY 2-\d+ \[NDI\] "STUDIO-PC \(Cam 1\)"$/.test(l))).toBe(true);
    expect(mock.layerState({ channel: 2, layer: layerOf(r, 'l1') })?.producer).toBeDefined();
  });

  it('🔴 a SWAP to the own output of CH 2, on CH 2, is refused and nothing is sent — control: a swap to the unmarked input lands', async () => {
    const { r, mark, sentSince } = await boot({
      assignments: bind('single', { l1: OWN_1 }),
      provider: new LocalPlayoutSources({ inputs: WITH_OWN }),
    });
    await take(r, 'single');
    const from = await mark();
    const refused = await r.swapLiveSource(ROW, 'l1', OWN_2);
    expect(refused.ok).toBe(false);
    expect(await sentSince(from)).toEqual([]);
    expect((await r.swapLiveSource(ROW, 'l1', STUDIO)).ok).toBe(true);
    expect((await sentSince(from)).some((l) => l.includes('[NDI] "STUDIO-PC (Cam 1)"'))).toBe(true);
  });
});

// ── `B-299` — the binding door asks rule 1 of a NEW binding, and only of a new one ─────────────

describe('B-299 — a swap to a route this channel may not show is refused; an unchanged binding is never refused for what became of its entry', () => {
  it('🔴 a swap to “ورودی ۴” (channel 1 only) on CH 2 is refused with rule 1’s clause and NOTHING is sent — control: a swap to “ورودی ۵” (CH 2) lands', async () => {
    const provider = new LocalPlayoutSources({ inputs: INPUTS });
    provider.setAvailable('li-input4', true);
    const { r, mark, sentSince } = await boot({
      assignments: bind('single', { l1: INPUT_3 }),
      provider,
    });
    await take(r, 'single');
    const from = await mark();
    const refused = await r.swapLiveSource(ROW, 'l1', INPUT_4);
    expect(refused).toMatchObject({
      ok: false,
      reason: 'source-not-showable',
      message: 'Plate "l1": “ورودی ۴” can\'t be shown on CH 2.',
    });
    expect(await sentSince(from)).toEqual([]);
    // Nothing was recorded either: the seat still names the route it had.
    const seat = (r.liveLayers().get(ROW) ?? []).find((rec) => rec.sourceId === 'l1');
    expect(seat?.producer).toBe('"route://9-12"');
    // CONTROL — a route that names CH 2 swaps in.
    expect((await r.swapLiveSource(ROW, 'l1', INPUT_5)).ok).toBe(true);
    expect(await sentSince(from)).toContain('LOADBG 2-60 "route://9-14"');
  });

  it('🔴 `B-298` — a mark added AFTER a plate was bound never refuses a change to its NEIGHBOUR — control: binding the marked input anew is refused', async () => {
    const studioOnce = inputSourceId('li-studio1');
    const provider = new LocalPlayoutSources({ inputs: INPUTS });
    const { r, sources, mark, sentSince } = await boot({
      assignments: bind('duo', { l1: studioOnce, l2: MULTICAST }),
      provider,
    });
    await take(r, 'duo');
    // The Playout now marks Studio 1 as CH 2's own output.
    provider.setInputs(
      INPUTS.map((i) =>
        i.id === 'li-studio1'
          ? { ...i, ownOutputOf: { casparHost: '127.0.0.1', casparChannel: 2 } }
          : i,
      ),
    );
    await sources.refresh(0);
    expect(sources.catalog().sources.find((s) => s.id === studioOnce)?.ownOutputOf).toBe(2);
    const from = await mark();
    // The neighbour's swap lands: l1's binding is unchanged, so its new mark is not asked of it.
    expect((await r.swapLiveSource(ROW, 'l2', INPUT_3)).ok).toBe(true);
    expect(await sentSince(from)).toContain(`LOADBG 2-${String(layerOf(r, 'l2'))} "route://9-12"`);
    // CONTROL — binding the marked input ANEW is refused: l1 moves off it, and back is a new binding.
    expect((await r.swapLiveSource(ROW, 'l1', INPUT_5)).ok).toBe(true);
    expect(await r.swapLiveSource(ROW, 'l1', studioOnce)).toMatchObject({
      ok: false,
      reason: 'source-own-output',
    });
  });
});
