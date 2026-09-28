import * as dgram from 'node:dgram';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import { DEFAULT_LAYER_POLICY } from '@cg/caspar-client';
import {
  AUTHZ_ROLE_REFUSAL,
  LOCK_ENGAGED_REFUSAL,
  authzChannelRefusal,
  inputSourceId,
  mediaSourceId,
  type ConnectionConfig,
  type FixedLayerBank,
  type MediaPlateState,
  type MediaPlayback,
  type SourceAssignments,
  type SourceCatalog,
  type TemplateInfo,
} from '@cg/shared-ipc';
import type { AuditEntry } from '@cg/shared-schema';
import type { BridgeHandle } from '../src/index.js';
import { CasparRuntime } from '../src/caspar-runtime.js';
import { validateFixedBank } from '../src/fixed-layers-store.js';
import { LIVE_PLATE_NO_LAYER } from '../src/live-plate-seating.js';
import { PlayoutSources } from '../src/playout-sources.js';
import {
  expectRefusedWith,
  openClient,
  startAuthedBridge,
  type Client,
} from './support/auth-harness.js';
import type { FakeMediaItem, FakePlayout, IssueTokenOptions } from './support/fake-playout.js';
import { awaitChannelModeRead, HEALTH_MS } from './support/harness.js';
import { LocalPlayoutSources } from './support/local-playout-sources.js';
import { standardBank } from './support/two-channel-rig.js';

/**
 * 🔴 `MEDIA-PLATES-01` §4 — **A MEDIA CLIP IN A PLATE: WHAT IT DOES WHEN A LOOK HIDES IT, LOOP, THE
 * FREEZE AT ITS END, AND PLAY / PAUSE / RESTART ON AIR.**
 *
 * The station is shaped as a real one: channel 2, the bed on 2-59, plates in 60–79, templates in
 * 80–99. The Playout is the fake's (`LocalPlayoutSources`): `Studio 1` is an NDI input, and the media
 * library holds two clips — `پرومو` (30 s) and `Sting` (4 s). The owner's case is the fixture: a
 * two-box look with the clip in box 2, and a one-box look that does not show it.
 *
 * The AMCP mock plays a clip on ITS OWN CLOCK (`now`), which the test moves by hand, and reports the
 * clip's time over OSC as 2.5.0 does (`file/time`) — so the remaining time, the end and the freeze
 * are asserted without waiting on real seconds. Everything else is read off the wire the mock
 * RECEIVED. Every absence has its positive control.
 */

let mocks: MockHandle[] = [];
let runtimes: CasparRuntime[] = [];
let readers: PlayoutSources[] = [];
let traces: string[] = [];
let dirs: string[] = [];
let handle: BridgeHandle | null = null;
let playout: FakePlayout | null = null;

afterEach(async () => {
  await handle?.close();
  handle = null;
  await playout?.stop();
  playout = null;
  for (const reader of readers) reader.dispose();
  readers = [];
  for (const r of runtimes) await r.stop();
  runtimes = [];
  for (const m of mocks) await m.stop();
  mocks = [];
  for (const t of traces) if (fs.existsSync(t)) fs.rmSync(t);
  traces = [];
  for (const d of dirs) if (fs.existsSync(d)) fs.rmSync(d, { recursive: true, force: true });
  dirs = [];
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
const ROW = 'bed-59';
const BED_2 = { channel: 2, layer: 58 };
const ROW_2 = 'bed-58';
const BAND = { start: 60, end: 79 };

const PROMO: FakeMediaItem = {
  id: 'm-promo',
  name: 'پرومو',
  clip: 'C:/Media/promo.mp4',
  type: 'video',
  durationMs: 30_000,
  width: 1920,
  height: 1080,
  folder: 'Media',
  updatedAt: '2026-09-28T08:00:00Z',
};
const STING: FakeMediaItem = {
  id: 'm-sting',
  name: 'Sting',
  clip: 'C:/Media/sting.mov',
  type: 'video',
  durationMs: 4_000,
  width: 1920,
  height: 1080,
  folder: 'Media',
  updatedAt: '2026-09-28T08:00:00Z',
};
const MEDIA = [PROMO, STING];

const STUDIO = inputSourceId('li-studio1');
const NEWSCAM = inputSourceId('li-newscam');
const PROMO_ID = mediaSourceId(PROMO.id);
const STING_ID = mediaSourceId(STING.id);

const SCENE = { width: 1920, height: 1080 };
const CENTRED = { anchor: 'center' as const, offset: { x: 0, y: 0 } };
const FULL = { x: 0, y: 0, width: 1920, height: 1080 };
const LEFT = { x: 0, y: 0, width: 960, height: 1080 };
const RIGHT = { x: 960, y: 0, width: 960, height: 1080 };

function plate(id: string, rect: { x: number; y: number; width: number; height: number }) {
  return { elementId: `el-${id}`, sourceId: id, rect, expectedAspect: 16 / 9, dynamic: false };
}

/** The owner's case: `two` shows l1 and l2 side by side; `one` shows l1 alone. */
const TWO_BOX: TemplateInfo = {
  templateId: 'two-box',
  templateType: 'custom',
  fields: [],
  liveSources: {
    resolution: SCENE,
    defaultPosition: CENTRED,
    sources: [plate('l1', LEFT), plate('l2', RIGHT)],
    looks: [
      { id: 'two', name: 'two', entered: { mode: 'cut' }, rects: { l1: LEFT, l2: RIGHT } },
      { id: 'one', name: 'one', entered: { mode: 'cut' }, rects: { l1: FULL } },
    ],
    defaultLookId: 'two',
  },
};

/** The same two boxes, taken on the ONE-box look: the clip in box 2 is a PRESET nobody shows yet. */
const ONE_FIRST: TemplateInfo = {
  ...TWO_BOX,
  templateId: 'one-first',
  liveSources: { ...TWO_BOX.liveSources, defaultLookId: 'one' } as TemplateInfo['liveSources'],
};

/** One full-frame plate — a second row, for the band arithmetic. */
const SINGLE: TemplateInfo = {
  templateId: 'single',
  templateType: 'custom',
  fields: [],
  liveSources: { resolution: SCENE, defaultPosition: CENTRED, sources: [plate('p1', FULL)] },
};

function bind(entries: readonly (readonly [string, string, string])[]): SourceAssignments {
  return {
    assignments: entries.map(([templateId, plateId, sourceId]) => ({
      templateId,
      plateId,
      sourceId,
    })),
  };
}

/** The owner's case: the NDI input in box 1, the 30 s clip in box 2. */
const OWNERS_CASE = bind([
  ['two-box', 'l1', STUDIO],
  ['two-box', 'l2', PROMO_ID],
  ['one-first', 'l1', STUDIO],
  ['one-first', 'l2', PROMO_ID],
  ['single', 'p1', NEWSCAM],
]);

// ── The rig ──────────────────────────────────────────────────────────────────────────────────

interface Rig {
  readonly r: CasparRuntime;
  readonly mock: MockHandle;
  readonly sources: PlayoutSources;
  /** The mock's clip clock (ms) — moved by hand. */
  readonly clock: { t: number };
  readonly auditFile: string;
  mark(): Promise<number>;
  sentSince(from: number): Promise<string[]>;
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
    readonly assignments?: SourceAssignments;
    /** The clips' settings, set through the store before the take. */
    readonly playback?: Readonly<Record<string, MediaPlayback>>;
    /** `false` — the mock is told no clip's length, so it reports no `file/time` (no OSC time). */
    readonly clipTime?: boolean;
    readonly band?: { readonly start: number; readonly end: number };
  } = {},
): Promise<Rig> {
  const clock = { t: 0 };
  const provider = new LocalPlayoutSources({ media: MEDIA });
  const sources = new PlayoutSources({
    provider,
    signedIn: () => true,
    hostIsOurs: () => true,
    channelFor: (_host, channel) => channel,
    layerRange: options.band ?? BAND,
    log: () => undefined,
  });
  readers.push(sources);
  await sources.refresh(0);
  for (const id of [PROMO_ID, STING_ID])
    expect(await sources.ensureBound(id)).toEqual({ ok: true });
  for (const [id, playback] of Object.entries(options.playback ?? {})) {
    expect(sources.setMediaPlayback(id, playback)).not.toBeNull();
  }

  const oscPort = await freeUdpPort();
  const trace = path.join(
    os.tmpdir(),
    `cg-media-plates-${String(process.pid)}-${String(Date.now())}-${String(Math.round(performance.now() * 1000))}.ndjson`,
  );
  traces.push(trace);
  const lengths = new Map(MEDIA.map((m) => [m.clip, m.durationMs / 1000] as const));
  const mock = await createMock({
    amcpPort: 0,
    oscPort,
    oscHost: '127.0.0.1',
    oscHz: 40,
    channels: 2,
    tracePath: trace,
    now: () => clock.t,
    ...(options.clipTime === false ? {} : { clipLength: (file: string) => lengths.get(file) }),
  });
  mocks.push(mock);
  const auditDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-media-audit-'));
  dirs.push(auditDir);
  const auditFile = path.join(auditDir, 'bridge-audit.ndjson');
  const config: ConnectionConfig = {
    servers: { A: { host: '127.0.0.1', amcpPort: mock.amcpPort, oscPort } },
    strategy: 'mirror-sync',
    autoFailoverEnabled: false,
  };
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
      mediaStateTickMs: 40,
      auditLogPath: auditFile,
      sourceCatalog: sources.catalog(),
      sourceAssignments: options.assignments ?? OWNERS_CASE,
    },
  );
  runtimes.push(r);
  // The bridge's own wiring (`createBridge`), verbatim.
  sources.onCatalogChanged((catalog) => r.setResolvedSourceCatalog(catalog));
  r.setMediaPlaybackWriter((sourceId, playback) => sources.setMediaPlayback(sourceId, playback));
  r.start();
  await r.startServing();
  for (const template of [TWO_BOX, ONE_FIRST, SINGLE]) {
    r.templateImport(template, `<!doctype html><html><body>${template.templateId}</body></html>`);
  }
  await r.whenServerHealthy(HEALTH_MS);
  await awaitChannelModeRead(r);
  return {
    r,
    mock,
    sources,
    clock,
    auditFile,
    mark: async () => (await linesOf(mock, trace)).length,
    sentSince: async (from) => (await linesOf(mock, trace)).slice(from),
  };
}

async function take(r: CasparRuntime, templateId = 'two-box', bed = BED, row = ROW): Promise<void> {
  expect(await r.loadFixed(bed, row, templateId, {})).toEqual({ accepted: true });
  const verdict = await r.take(row);
  expect(verdict, JSON.stringify(verdict)).toEqual({ accepted: true });
}

const recordOf = (r: CasparRuntime, plateId: string, row = ROW) =>
  (r.liveLayers().get(row) ?? []).find((rec) => rec.sourceId === plateId);

function layerOf(r: CasparRuntime, plateId: string, row = ROW): number {
  const layer = recordOf(r, plateId, row)?.slot.layer;
  if (layer === undefined) throw new Error(`${plateId} holds no seat`);
  return layer;
}

/** Every line addressing one layer of channel 2 — its `CLEAR`s, `PLAY`s, `PAUSE`s, `MIXER`s. */
const on = (lines: readonly string[], layer: number): string[] =>
  lines.filter((l) => new RegExp(`^[A-Z]+ 2-${String(layer)}(\\s|$)`).test(l));

const clearsOn = (lines: readonly string[], layer: number): string[] =>
  on(lines, layer).filter((l) => l.startsWith('CLEAR ') || / CLEAR$/.test(l));

const stateOf = (r: CasparRuntime, plateId: string): MediaPlateState | undefined =>
  r.mediaPlateStates().find((s) => s.plateId === plateId);

/**
 * The audit rows ON DISK for one action, once at least `atLeast` of THAT action have landed (appends
 * are fire-and-forget; polling, so a slow box fails on the assertion and never on the wait).
 */
async function auditRows(
  file: string,
  action: AuditEntry['action'],
  atLeast: number,
): Promise<AuditEntry[]> {
  const deadline = Date.now() + 4000;
  for (;;) {
    const rows = (
      fs.existsSync(file)
        ? fs
            .readFileSync(file, 'utf-8')
            .split('\n')
            .filter((l) => l.length > 0)
            .map((l) => JSON.parse(l) as AuditEntry)
        : []
    ).filter((e) => e.action === action);
    if (rows.length >= atLeast || Date.now() > deadline) return rows;
    await delay(20);
  }
}

// ── §1.A — the settings live on the bound-media reference ────────────────────────────────────

describe('§1.A — a clip’s two settings live on its bound-media reference', () => {
  it('🔴 set once, they survive a re-read from the Playout and a restart of the reader; control: an unknown clip changes nothing', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-media-store-'));
    dirs.push(dir);
    const boundMediaPath = path.join(dir, 'bridge-bound-media.json');
    const provider = new LocalPlayoutSources({ media: MEDIA });
    const reader = (): PlayoutSources => {
      const r = new PlayoutSources({
        provider,
        signedIn: () => true,
        hostIsOurs: () => true,
        channelFor: (_host, channel) => channel,
        boundMediaPath,
        log: () => undefined,
      });
      readers.push(r);
      return r;
    };
    const entryOf = (r: PlayoutSources) => r.catalog().sources.find((s) => s.id === PROMO_ID);

    const first = reader();
    expect(await first.ensureBound(PROMO_ID)).toEqual({ ok: true });
    // A NEW reference is written with the defaults.
    expect(entryOf(first)?.media).toMatchObject({ loop: false, whenHidden: 'pause' });
    expect(first.setMediaPlayback(PROMO_ID, { loop: true, whenHidden: 'continue' })).toEqual({
      name: 'پرومو',
    });
    const reads = first.mediaReadCount;
    await first.refresh(0);
    expect(first.mediaReadCount, 'the bound item was read again').toBeGreaterThan(reads);
    expect(entryOf(first)?.media).toMatchObject({ loop: true, whenHidden: 'continue' });
    // …and a reader started from the persisted store has them too.
    expect(entryOf(reader())?.media).toMatchObject({ loop: true, whenHidden: 'continue' });

    expect(first.setMediaPlayback('md-m-nope', { loop: false, whenHidden: 'restart' })).toBeNull();
    expect(entryOf(first)?.media).toMatchObject({ loop: true, whenHidden: 'continue' });
  });
});

// ── §1.C — the look switch honours `whenHidden` ──────────────────────────────────────────────

describe('§1.C — `pause`, the default: hidden, paused and muted, still seated', () => {
  it('🔴 two boxes → one: `OPACITY 0` and the mute in the switch’s committed batch, then `PAUSE` — and no `CLEAR`; back: `RESUME` with its volume, on the same layer, before the commit', async () => {
    const { r, mock, mark, sentSince } = await boot();
    await take(r);
    const clip = layerOf(r, 'l2');
    expect(await r.setLivePlateVolume(ROW, 'l2', 0.8)).toMatchObject({ ok: true, sent: true });

    let from = await mark();
    expect(await r.setActiveLook(ROW, 'one')).toEqual({ ok: true });
    let lines = await sentSince(from);
    const mute = lines.indexOf(`MIXER 2-${String(clip)} VOLUME 0 DEFER`);
    const hide = lines.indexOf(`MIXER 2-${String(clip)} OPACITY 0 DEFER`);
    const commit = lines.indexOf('MIXER 2 COMMIT', Math.max(mute, hide));
    const pause = lines.indexOf(`PAUSE 2-${String(clip)}`);
    expect(mute, 'the mute').toBeGreaterThanOrEqual(0);
    expect(hide, 'the hide').toBeGreaterThanOrEqual(0);
    expect(commit, 'one commit after the hide').toBeGreaterThan(Math.max(mute, hide));
    expect(pause, 'the PAUSE follows the commit that hid it').toBeGreaterThan(commit);
    expect(clearsOn(lines, clip), 'a paused clip is not torn down').toEqual([]);
    expect(recordOf(r, 'l2')).toMatchObject({
      held: true,
      transport: { loop: false, paused: 'hidden' },
    });
    // Positive control: the fake CasparCG was actually paused — the instrument is live.
    expect(mock.layerState({ channel: 2, layer: clip })?.paused).toBe(true);

    from = await mark();
    expect(await r.setActiveLook(ROW, 'two')).toEqual({ ok: true });
    lines = await sentSince(from);
    const volume = lines.indexOf(`MIXER 2-${String(clip)} VOLUME 0.8 DEFER`);
    const reveal = lines.indexOf(`MIXER 2-${String(clip)} OPACITY 1 DEFER`);
    const resume = lines.indexOf(`RESUME 2-${String(clip)}`);
    const commitBack = lines.indexOf('MIXER 2 COMMIT', Math.max(resume, 0));
    expect(volume, 'its declared volume comes back').toBeGreaterThanOrEqual(0);
    expect(reveal, 'the reveal').toBeGreaterThanOrEqual(0);
    expect(resume, 'RESUME just before the reveal is committed').toBeGreaterThan(reveal);
    expect(commitBack).toBeGreaterThan(resume);
    // The SAME producer, resumed — never a fresh one.
    expect(on(lines, clip).filter((l) => l.startsWith('PLAY '))).toEqual([]);
    expect(layerOf(r, 'l2')).toBe(clip);
    expect(recordOf(r, 'l2')?.transport).toEqual({ loop: false });
    expect(mock.layerState({ channel: 2, layer: clip })?.paused).toBe(false);
  });

  it('🔴 shown again, it resumes from the SAME frame: the reported time stood still while it was hidden', async () => {
    const { r, clock } = await boot();
    await take(r);
    clock.t += 5_000;
    await waitFor(() => stateOf(r, 'l2')?.remainingMs === 25_000, 'the clip at 0:25');
    expect(await r.setActiveLook(ROW, 'one')).toEqual({ ok: true });
    await waitFor(() => stateOf(r, 'l2')?.paused === true, 'the paused state');
    clock.t += 10_000; // ten seconds hidden
    await delay(200);
    expect(stateOf(r, 'l2')).toMatchObject({ remainingMs: 25_000, paused: true, ended: false });
    expect(await r.setActiveLook(ROW, 'two')).toEqual({ ok: true });
    clock.t += 1_000;
    await waitFor(() => stateOf(r, 'l2')?.remainingMs === 24_000, 'the clip running on from 0:25');
    expect(stateOf(r, 'l2')?.paused).toBe(false);
  });

  it('control: `restart` tears it down as before, and switching back sends a fresh `PLAY`', async () => {
    const { r, mark, sentSince } = await boot({
      playback: { [PROMO_ID]: { loop: false, whenHidden: 'restart' } },
    });
    await take(r);
    const clip = layerOf(r, 'l2');
    let from = await mark();
    expect(await r.setActiveLook(ROW, 'one')).toEqual({ ok: true });
    let lines = await sentSince(from);
    expect(lines).toContain(`CLEAR 2-${String(clip)}`);
    expect(lines).toContain(`MIXER 2-${String(clip)} CLEAR`);
    expect(on(lines, clip).filter((l) => l.startsWith('PAUSE '))).toEqual([]);
    expect(recordOf(r, 'l2')).toBeUndefined();

    from = await mark();
    expect(await r.setActiveLook(ROW, 'two')).toEqual({ ok: true });
    lines = await sentSince(from);
    const back = layerOf(r, 'l2');
    expect(on(lines, back).filter((l) => l.startsWith('PLAY '))).toEqual([
      `PLAY 2-${String(back)} "C:/Media/promo.mp4"`,
    ]);
    expect(lines.some((l) => l.startsWith('RESUME '))).toBe(false);
  });
});

describe('§1.C — a PRESET clip: bound only in a look nobody shows at the take', () => {
  it('🔴 is seated hidden and PAUSED after the take’s commit, and the look that shows it resumes it — no second PLAY', async () => {
    const { r, mock, mark, sentSince } = await boot();
    let from = await mark();
    await take(r, 'one-first');
    const clip = layerOf(r, 'l2');
    let lines = await sentSince(from);
    const played = lines.indexOf(`PLAY 2-${String(clip)} "C:/Media/promo.mp4"`);
    const hidden = lines.indexOf(`MIXER 2-${String(clip)} OPACITY 0 DEFER`, played);
    const commit = lines.indexOf('MIXER 2 COMMIT', hidden);
    const pause = lines.indexOf(`PAUSE 2-${String(clip)}`);
    expect(played, 'the preset is seated').toBeGreaterThanOrEqual(0);
    expect(hidden, 'and kept hidden by its reveal line').toBeGreaterThan(played);
    expect(pause, 'paused after the commit that settled it').toBeGreaterThan(commit);
    expect(recordOf(r, 'l2')).toMatchObject({
      held: true,
      transport: { loop: false, paused: 'hidden' },
    });
    expect(mock.layerState({ channel: 2, layer: clip })?.paused).toBe(true);

    from = await mark();
    expect(await r.setActiveLook(ROW, 'two')).toEqual({ ok: true });
    lines = await sentSince(from);
    expect(lines).toContain(`RESUME 2-${String(clip)}`);
    expect(lines).toContain(`MIXER 2-${String(clip)} OPACITY 1 DEFER`);
    expect(on(lines, clip).filter((l) => l.startsWith('PLAY '))).toEqual([]);
    expect(mock.layerState({ channel: 2, layer: clip })?.paused).toBe(false);
  });
});

describe('§1.C — the reconnect re-send keeps a held clip hidden', () => {
  it('🔴 a held, paused clip is re-sent `OPACITY 0` and muted, and never un-paused; control: the shown plate gets `OPACITY 1`', async () => {
    const { r, mock, mark, sentSince } = await boot();
    await take(r);
    expect(await r.setActiveLook(ROW, 'one')).toEqual({ ok: true });
    const clip = layerOf(r, 'l2');
    const shown = layerOf(r, 'l1');
    const from = await mark();
    mock.closeAllAmcpConnections();
    await waitFor(() => r.health().primary.state !== 'healthy', 'the drop');
    await waitFor(() => r.health().primary.state === 'healthy', 'the reconnect');
    // The re-send is asynchronous after `healthy`: wait for the shown plate's line (the control).
    const deadline = Date.now() + 5_000;
    let lines = await sentSince(from);
    while (!lines.includes(`MIXER 2-${String(shown)} OPACITY 1 DEFER`) && Date.now() < deadline) {
      await delay(50);
      lines = await sentSince(from);
    }
    expect(lines).toContain(`MIXER 2-${String(shown)} OPACITY 1 DEFER`);
    expect(lines).toContain(`MIXER 2-${String(clip)} OPACITY 0 DEFER`);
    expect(lines).toContain(`MIXER 2-${String(clip)} VOLUME 0 DEFER`);
    expect(lines).not.toContain(`MIXER 2-${String(clip)} OPACITY 1 DEFER`);
    // A reconnect is mixer state only: the clip is neither re-played nor resumed.
    expect(on(lines, clip).filter((l) => /^(RESUME|PLAY|PAUSE|CALL) /.test(l))).toEqual([]);
    expect(recordOf(r, 'l2')?.transport?.paused).toBe('hidden');
    expect(mock.layerState({ channel: 2, layer: clip })?.paused).toBe(true);
  });
});

describe('§1.C — `continue`: it keeps playing, hidden and muted', () => {
  it('🔴 hiding sends `OPACITY 0` and the mute only — no `PAUSE`, no `CLEAR`; showing sends only the reveal', async () => {
    const { r, mock, mark, sentSince } = await boot({
      playback: { [PROMO_ID]: { loop: false, whenHidden: 'continue' } },
    });
    await take(r);
    const clip = layerOf(r, 'l2');
    let from = await mark();
    expect(await r.setActiveLook(ROW, 'one')).toEqual({ ok: true });
    let lines = await sentSince(from);
    expect(lines).toContain(`MIXER 2-${String(clip)} OPACITY 0 DEFER`);
    expect(lines).toContain(`MIXER 2-${String(clip)} VOLUME 0 DEFER`);
    expect(on(lines, clip).filter((l) => /^(PAUSE|CLEAR) /.test(l))).toEqual([]);
    expect(clearsOn(lines, clip)).toEqual([]);
    expect(mock.layerState({ channel: 2, layer: clip })?.paused).toBe(false);
    expect(recordOf(r, 'l2')).toMatchObject({ held: true, transport: { loop: false } });
    expect(recordOf(r, 'l2')?.transport?.paused).toBeUndefined();

    from = await mark();
    expect(await r.setActiveLook(ROW, 'two')).toEqual({ ok: true });
    lines = await sentSince(from);
    expect(lines).toContain(`MIXER 2-${String(clip)} OPACITY 1 DEFER`);
    expect(on(lines, clip).filter((l) => /^(RESUME|PLAY|PAUSE) /.test(l))).toEqual([]);
  });

  it('control: `pause` on the same switch sends the `PAUSE`', async () => {
    const { r, mark, sentSince } = await boot({
      playback: { [PROMO_ID]: { loop: false, whenHidden: 'pause' } },
    });
    await take(r);
    const clip = layerOf(r, 'l2');
    const from = await mark();
    expect(await r.setActiveLook(ROW, 'one')).toEqual({ ok: true });
    expect(await sentSince(from)).toContain(`PAUSE 2-${String(clip)}`);
  });
});

// ── §1.B — Loop, and the freeze at the end ───────────────────────────────────────────────────

describe('§1.B — Loop, and a clip that is not looping freezes on its last frame', () => {
  it('🔴 with Loop on, the `PLAY` carries `LOOP`; control: with it off, it does not', async () => {
    const looped = await boot({ playback: { [PROMO_ID]: { loop: true, whenHidden: 'pause' } } });
    let from = await looped.mark();
    await take(looped.r);
    let clip = layerOf(looped.r, 'l2');
    expect(on(await looped.sentSince(from), clip).filter((l) => l.startsWith('PLAY '))).toEqual([
      `PLAY 2-${String(clip)} "C:/Media/promo.mp4" LOOP`,
    ]);
    expect(recordOf(looped.r, 'l2')?.transport).toEqual({ loop: true });

    const plain = await boot();
    from = await plain.mark();
    await take(plain.r);
    clip = layerOf(plain.r, 'l2');
    expect(on(await plain.sentSince(from), clip).filter((l) => l.startsWith('PLAY '))).toEqual([
      `PLAY 2-${String(clip)} "C:/Media/promo.mp4"`,
    ]);
  });

  it('🔴 a Loop change reaches a clip already playing at once: `CALL 2-L LOOP 1`, then `LOOP 0`', async () => {
    const { r, mock, mark, sentSince, auditFile } = await boot();
    await take(r);
    const clip = layerOf(r, 'l2');
    let from = await mark();
    expect(await r.setMediaPlayback(PROMO_ID, { loop: true, whenHidden: 'pause' })).toEqual({
      ok: true,
    });
    expect(await sentSince(from)).toEqual([`CALL 2-${String(clip)} LOOP 1`]);
    expect(mock.layerState({ channel: 2, layer: clip })?.loop).toBe(true);
    expect(recordOf(r, 'l2')?.transport?.loop).toBe(true);
    // …and it is saved on the clip, so the catalogue carries it to every console.
    expect(r.sourceCatalog().sources.find((s) => s.id === PROMO_ID)?.media).toMatchObject({
      loop: true,
      whenHidden: 'pause',
    });

    from = await mark();
    expect(await r.setMediaPlayback(PROMO_ID, { loop: false, whenHidden: 'pause' })).toEqual({
      ok: true,
    });
    expect(await sentSince(from)).toEqual([`CALL 2-${String(clip)} LOOP 0`]);
    // Control: a `whenHidden` change alone sends nothing — it is read when a look hides the plate.
    from = await mark();
    expect(await r.setMediaPlayback(PROMO_ID, { loop: false, whenHidden: 'continue' })).toEqual({
      ok: true,
    });
    expect(await sentSince(from)).toEqual([]);
    // Every set is audited with the clip's NAME and what was asked; an unknown clip refuses.
    expect(await r.setMediaPlayback('md-m-nope', { loop: true, whenHidden: 'pause' })).toEqual({
      ok: false,
      reason: 'unknown-media',
      message: 'That clip is not bound on this station. Nothing was changed.',
    });
    const rows = await auditRows(auditFile, 'set-media-playback', 4);
    expect(rows.map((e) => [e.outcome, e.media, e.errorCode])).toEqual([
      ['ok', { name: 'پرومو', loop: true, whenHidden: 'pause' }, undefined],
      ['ok', { name: 'پرومو', loop: false, whenHidden: 'pause' }, undefined],
      ['ok', { name: 'پرومو', loop: false, whenHidden: 'continue' }, undefined],
      ['failed', undefined, 'unknown-media'],
    ]);
  });

  it('🔴 §0.2 — the 4 s clip, not looping, stands on its last frame at its end: `Ended`, nothing sent, never cleared', async () => {
    const { r, mock, clock, mark, sentSince } = await boot({
      assignments: bind([
        ['two-box', 'l1', STUDIO],
        ['two-box', 'l2', STING_ID],
      ]),
    });
    await take(r);
    const clip = layerOf(r, 'l2');
    const from = await mark();
    clock.t += 6_000; // two seconds past its end
    await waitFor(() => stateOf(r, 'l2')?.ended === true, 'the clip to end');
    expect(stateOf(r, 'l2')).toMatchObject({
      remainingMs: 0,
      ended: true,
      paused: false,
      loop: false,
    });
    // Nothing is sent to hold the frame — the producer does it, and it is still there.
    expect(on(await sentSince(from), clip)).toEqual([]);
    expect(mock.layerState({ channel: 2, layer: clip })?.producer).toBe('ffmpeg');
    expect(recordOf(r, 'l2')).toBeDefined();
  });

  it('control: the same clip LOOPING is never `Ended` — past its end it has wrapped round', async () => {
    const { r, clock } = await boot({
      assignments: bind([
        ['two-box', 'l1', STUDIO],
        ['two-box', 'l2', STING_ID],
      ]),
      playback: { [STING_ID]: { loop: true, whenHidden: 'pause' } },
    });
    await take(r);
    clock.t += 5_000; // one second into its second pass
    await waitFor(() => stateOf(r, 'l2')?.remainingMs === 3_000, 'the wrapped clip at 0:03');
    expect(stateOf(r, 'l2')).toMatchObject({ ended: false, loop: true });
  });
});

// ── §1.D — the transport verb ─────────────────────────────────────────────────────────────────

describe('§1.D — Play / Pause and Restart on an on-air row', () => {
  it('🔴 pause → `PAUSE`, play → `RESUME`, restart → `CALL … SEEK 0` then `RESUME`; each audited with the clip’s name', async () => {
    const { r, mock, clock, mark, sentSince, auditFile } = await boot();
    await take(r);
    const clip = layerOf(r, 'l2');

    let from = await mark();
    expect(await r.mediaPlateTransport(ROW, 'l2', 'pause')).toEqual({ ok: true });
    expect(await sentSince(from)).toEqual([`PAUSE 2-${String(clip)}`]);
    expect(recordOf(r, 'l2')?.transport).toEqual({ loop: false, paused: 'operator' });
    await waitFor(() => stateOf(r, 'l2')?.paused === true, 'the paused state');

    from = await mark();
    expect(await r.mediaPlateTransport(ROW, 'l2', 'play')).toEqual({ ok: true });
    expect(await sentSince(from)).toEqual([`RESUME 2-${String(clip)}`]);
    expect(recordOf(r, 'l2')?.transport).toEqual({ loop: false });

    clock.t += 7_000;
    await waitFor(() => stateOf(r, 'l2')?.remainingMs === 23_000, 'the clip at 0:23');
    from = await mark();
    expect(await r.mediaPlateTransport(ROW, 'l2', 'restart')).toEqual({ ok: true });
    expect(await sentSince(from)).toEqual([
      `CALL 2-${String(clip)} SEEK 0`,
      `RESUME 2-${String(clip)}`,
    ]);
    await waitFor(() => stateOf(r, 'l2')?.remainingMs === 30_000, 'the clip back at 0:30');
    expect(mock.layerState({ channel: 2, layer: clip })?.paused).toBe(false);

    const rows = await auditRows(auditFile, 'media-transport', 3);
    expect(rows.map((e) => [e.media?.transport, e.outcome])).toEqual([
      ['pause', 'ok'],
      ['play', 'ok'],
      ['restart', 'ok'],
    ]);
    for (const row of rows) {
      expect(row.media).toMatchObject({ name: 'پرومو', plateId: 'l2' });
      expect(row.slot).toMatchObject({ channel: 2, layer: clip });
    }
  });

  it('🔴 an OPERATOR’s pause survives a look switch; a look’s pause does not', async () => {
    const { r, mark, sentSince } = await boot();
    await take(r);
    const clip = layerOf(r, 'l2');
    expect(await r.mediaPlateTransport(ROW, 'l2', 'pause')).toEqual({ ok: true });
    expect(await r.setActiveLook(ROW, 'one')).toEqual({ ok: true });
    expect(recordOf(r, 'l2')?.transport?.paused).toBe('operator');
    const from = await mark();
    expect(await r.setActiveLook(ROW, 'two')).toEqual({ ok: true });
    // Shown again, still paused — the operator's press stands until they press Play.
    expect(on(await sentSince(from), clip).filter((l) => l.startsWith('RESUME '))).toEqual([]);
    expect(recordOf(r, 'l2')?.transport?.paused).toBe('operator');
  });

  it('🔴 refused with NOTHING sent: a live-input plate, a plate that is not seated, a row not on air — control: the same press on the clip lands', async () => {
    const { r, mark, sentSince, auditFile } = await boot();
    expect(await r.loadFixed(BED, ROW, 'two-box', {})).toEqual({ accepted: true });
    let from = await mark();
    expect(await r.mediaPlateTransport(ROW, 'l2', 'pause')).toMatchObject({
      ok: false,
      reason: 'not-on-air',
    });
    expect(await sentSince(from)).toEqual([]);

    const verdict = await r.take(ROW);
    expect(verdict).toEqual({ accepted: true });
    from = await mark();
    expect(await r.mediaPlateTransport(ROW, 'l1', 'pause')).toMatchObject({
      ok: false,
      reason: 'not-media',
    });
    expect(await r.mediaPlateTransport(ROW, 'l9', 'pause')).toMatchObject({
      ok: false,
      reason: 'not-seated',
    });
    expect(await sentSince(from)).toEqual([]);

    // Positive control — the instrument is live: the clip's own press reaches the wire.
    from = await mark();
    expect(await r.mediaPlateTransport(ROW, 'l2', 'pause')).toEqual({ ok: true });
    expect(await sentSince(from)).toEqual([`PAUSE 2-${String(layerOf(r, 'l2'))}`]);

    const rows = await auditRows(auditFile, 'media-transport', 4);
    expect(rows.map((e) => [e.outcome, e.errorCode])).toEqual([
      ['failed', 'not-on-air'],
      ['failed', 'not-media'],
      ['failed', 'not-seated'],
      ['ok', undefined],
    ]);
  });
});

// ── §1.E — the remaining time, from OSC only ──────────────────────────────────────────────────

describe('§1.E — the remaining time appears only while the server reports it', () => {
  it('🔴 with `file/time` reported: 0:30, pushed as it changes — control: with none, no number at all', async () => {
    const reported = await boot();
    const pushed: MediaPlateState[][] = [];
    reported.r.mediaStateChanged.subscribe((s) => pushed.push(s));
    await take(reported.r);
    await waitFor(() => stateOf(reported.r, 'l2')?.remainingMs === 30_000, 'the time at 0:30');
    reported.clock.t += 2_000;
    await waitFor(
      () => pushed.some((s) => s.find((p) => p.plateId === 'l2')?.remainingMs === 28_000),
      'a push at 0:28',
    );
    // Live inputs have no clock and no row here.
    expect(stateOf(reported.r, 'l1')).toBeUndefined();

    const silent = await boot({ clipTime: false });
    await take(silent.r);
    await delay(300);
    const state = stateOf(silent.r, 'l2');
    expect(state, 'the seated clip is still reported').toMatchObject({
      paused: false,
      ended: false,
      loop: false,
    });
    expect(state !== undefined && 'remainingMs' in state, 'a remaining time was invented').toBe(
      false,
    );
  });
});

// ── Take out ─────────────────────────────────────────────────────────────────────────────────

describe('take out clears everything, and a new take starts every clip from its beginning', () => {
  it('🔴 `out` clears the held, paused clip; the next take `PLAY`s it afresh and it reads 0:30', async () => {
    const { r, clock, mark, sentSince } = await boot();
    await take(r);
    const clip = layerOf(r, 'l2');
    clock.t += 9_000;
    expect(await r.setActiveLook(ROW, 'one')).toEqual({ ok: true });
    expect(recordOf(r, 'l2')?.transport?.paused).toBe('hidden');

    let from = await mark();
    expect((await r.out(ROW)).accepted).toBe(true);
    const lines = await sentSince(from);
    expect(lines).toContain(`CLEAR 2-${String(clip)}`);
    expect(lines).toContain(`MIXER 2-${String(clip)} CLEAR`);
    expect(r.liveLayers().get(ROW)).toBeUndefined();

    from = await mark();
    const verdict = await r.take(ROW);
    expect(verdict).toEqual({ accepted: true });
    const again = layerOf(r, 'l2');
    expect(on(await sentSince(from), again).filter((l) => l.startsWith('PLAY '))).toEqual([
      `PLAY 2-${String(again)} "C:/Media/promo.mp4"`,
    ]);
    await waitFor(() => stateOf(r, 'l2')?.remainingMs === 30_000, 'the clip from frame 0');
  });
});

// ── §0.6 — band capacity ──────────────────────────────────────────────────────────────────────

describe('§0.6 — a held clip keeps its band layer, exactly as a held live input does', () => {
  /** A two-layer band: the owner's row fills it, and a second row needs one more. */
  const TIGHT = { start: 60, end: 61 };

  async function secondRowAfterHiding(assignments: SourceAssignments, playback = {}) {
    const rig = await boot({ assignments, playback, band: TIGHT });
    await take(rig.r);
    expect(await rig.r.setActiveLook(ROW, 'one')).toEqual({ ok: true });
    expect(await rig.r.loadFixed(BED_2, ROW_2, 'single', {})).toEqual({ accepted: true });
    return rig.r.take(ROW_2);
  }

  it(`🔴 a held clip and a held live input are refused alike — \`${LIVE_PLATE_NO_LAYER}\` — control: a \`restart\` clip frees its layer`, async () => {
    const clipHeld = await secondRowAfterHiding(OWNERS_CASE);
    expect(clipHeld).toMatchObject({ accepted: false, errorCode: LIVE_PLATE_NO_LAYER });

    const inputHeld = await secondRowAfterHiding(
      bind([
        ['two-box', 'l1', STUDIO],
        ['two-box', 'l2', inputSourceId('li-multicast')],
        ['single', 'p1', NEWSCAM],
      ]),
    );
    expect(inputHeld).toMatchObject({ accepted: false, errorCode: LIVE_PLATE_NO_LAYER });

    const clipRestart = await secondRowAfterHiding(OWNERS_CASE, {
      [PROMO_ID]: { loop: false, whenHidden: 'restart' },
    });
    expect(clipRestart).toEqual({ accepted: true });
  });
});

// ── §1.F — live-input plates: byte-identical ─────────────────────────────────────────────────

describe('§1.F — a live-input plate’s hold, release and wire are byte-identical', () => {
  /*
    ⚠ THE EXPECTED LINES ARE MEASURED, NOT WRITTEN. The same take-and-switch was run against the
    bridge sources at `dbcd0b7b` (before this change) and against this change, through one probe
    and one mock, and the two recordings of every plate-layer line were byte-identical (1,096
    bytes each). They are also the lines `live-look-reconcile` and `B-154` pin in their own
    words: the hide first, one commit, the `PLAY`, the reveal; on a switch the shown plate re-fit,
    the hidden one muted and parked — and no `OPACITY` for a live input that is not a route.
  */
  it('🔴 two live inputs, two boxes → one → two: every plate-layer line, exactly as the existing suites pin them', async () => {
    const { r, mark, sentSince } = await boot({
      assignments: bind([
        ['two-box', 'l1', STUDIO],
        ['two-box', 'l2', inputSourceId('li-multicast')],
      ]),
    });
    const plateLines = (lines: readonly string[]): string[] =>
      lines.filter((l) => /^[A-Z]+ 2-6[01](\s|$)/.test(l) || l === 'MIXER 2 COMMIT');
    let from = await mark();
    await take(r);
    expect([layerOf(r, 'l1'), layerOf(r, 'l2')]).toEqual([60, 61]);
    expect(plateLines(await sentSince(from))).toEqual([
      'MIXER 2-60 OPACITY 0 DEFER',
      'MIXER 2-60 VOLUME 0 DEFER',
      'MIXER 2-60 FILL 0 0.25 0.5 0.5 DEFER',
      'MIXER 2-60 CLIP 0 0.25 0.5 0.5 DEFER',
      'MIXER 2-61 OPACITY 0 DEFER',
      'MIXER 2-61 VOLUME 0 DEFER',
      'MIXER 2-61 FILL 0.5 0.25 0.5 0.5 DEFER',
      'MIXER 2-61 CLIP 0.5 0.25 0.5 0.5 DEFER',
      'MIXER 2 COMMIT',
      'PLAY 2-60 [NDI] "STUDIO-PC (Cam 1)"',
      'PLAY 2-61 "udp://239.255.0.1:5000?reuse=1"',
      'MIXER 2-60 OPACITY 1 DEFER',
      'MIXER 2-60 VOLUME 0 DEFER',
      'MIXER 2-61 OPACITY 1 DEFER',
      'MIXER 2-61 VOLUME 0 DEFER',
      'MIXER 2 COMMIT',
    ]);

    from = await mark();
    expect(await r.setActiveLook(ROW, 'one')).toEqual({ ok: true });
    // The hold as `live-look-reconcile` and `B-154` pin it: re-fit the shown plate, mute and park
    // the hidden one, one commit — and NO `OPACITY`, `PAUSE` or `CLEAR` for a live input.
    expect(plateLines(await sentSince(from))).toEqual([
      'MIXER 2-60 FILL 0 0 1 1 DEFER',
      'MIXER 2-60 CLIP 0 0 1 1 DEFER',
      'MIXER 2-61 VOLUME 0 DEFER',
      'MIXER 2-61 FILL 2 2 0.5 0.5 DEFER',
      'MIXER 2-61 CLIP 0 0 1 1 DEFER',
      'MIXER 2 COMMIT',
    ]);

    from = await mark();
    expect(await r.setActiveLook(ROW, 'two')).toEqual({ ok: true });
    // The release as they pin it: both fits back, the held one's volume re-asserted, one commit.
    expect(plateLines(await sentSince(from))).toEqual([
      'MIXER 2-60 FILL 0 0.25 0.5 0.5 DEFER',
      'MIXER 2-60 CLIP 0 0.25 0.5 0.5 DEFER',
      'MIXER 2-61 FILL 0.5 0.25 0.5 0.5 DEFER',
      'MIXER 2-61 CLIP 0.5 0.25 0.5 0.5 DEFER',
      'MIXER 2-61 VOLUME 0 DEFER',
      'MIXER 2 COMMIT',
    ]);
  });
});

// ── §4 — the permission, the channel's grant and the lock, over a real socket ────────────────

describe('§1.D — the transport is an operator verb, scoped to the row’s channel, behind the lock', () => {
  const HOST = '127.0.0.1';
  const CATALOG: SourceCatalog = {
    sources: [
      {
        id: 'src-clip',
        name: 'Sting',
        format: '1080i5000',
        producer: { kind: 'media', file: 'sting.mov' },
      },
    ],
    layerRange: { start: 60, end: 69 },
  };
  const ASSIGNMENTS: SourceAssignments = {
    assignments: [{ templateId: 'single', plateId: 'p1', sourceId: 'src-clip' }],
  };
  let mock: MockHandle | null = null;
  let trace: string | null = null;

  afterEach(async () => {
    await mock?.stop();
    mock = null;
    if (trace !== null && fs.existsSync(trace)) fs.rmSync(trace);
    trace = null;
  });

  async function station(): Promise<void> {
    const oscPort = await freeUdpPort();
    trace = path.join(
      os.tmpdir(),
      `cg-media-authz-${String(process.pid)}-${String(Date.now())}-${String(Math.round(performance.now() * 1000))}.ndjson`,
    );
    mock = await createMock({
      amcpPort: 0,
      oscPort,
      oscHost: HOST,
      oscHz: 30,
      tracePath: trace,
      channels: 2,
    });
    const started = await startAuthedBridge({
      connection: {
        servers: { A: { host: HOST, amcpPort: mock.amcpPort, oscPort } },
        strategy: 'mirror-sync',
        autoFailoverEnabled: true,
      },
      fixedLayers: [standardBank(1), standardBank(2)],
      sourceCatalog: CATALOG,
      sourceAssignments: ASSIGNMENTS,
    });
    handle = started.handle;
    playout = started.playout;
    await handle.runtime.whenServerHealthy(HEALTH_MS);
    await awaitChannelModeRead(handle.runtime);
  }

  async function signedIn(options: IssueTokenOptions): Promise<Client> {
    if (handle === null || playout === null) throw new Error('no station');
    const client = await openClient(handle);
    const issued = await playout.issueToken(options);
    const res = await client.authenticate(`auth-${String(Math.random())}`, issued.token);
    if (res.error !== undefined) throw new Error(`fixture token rejected: ${res.error}`);
    return client;
  }

  async function pauses(): Promise<string[]> {
    if (mock === null || trace === null) throw new Error('no trace');
    return (await linesOf(mock, trace)).filter((l) => l.startsWith('PAUSE '));
  }

  it('🔴 a viewer, an operator without channel 2 and a locked console are refused, nothing sent — control: channel 2’s operator lands it', async () => {
    await station();
    const both = await signedIn({ user: 'bothChannels' });
    const html = '<!doctype html><html><body>single</body></html>';
    expect((await both.ask('i', 'templates.import', { template: SINGLE, html })).error).toBe(
      undefined,
    );
    const load = await both.ask('l', 'fixedLayers.load', {
      channel: 2,
      layer: 59,
      itemId: 'row-2',
      templateId: 'single',
      fields: {},
    });
    expect(load.error).toBe(undefined);
    const took = await both.ask('t', 'stack.take', { itemId: 'row-2' });
    expect(took.error).toBe(undefined);
    expect((took.payload as { accepted: boolean }).accepted, JSON.stringify(took.payload)).toBe(
      true,
    );
    const press = { itemId: 'row-2', plateId: 'p1', action: 'pause' };

    const viewer = await signedIn({ user: 'viewer' });
    const v = await viewer.ask('v', 'stack.media-plate-transport', press);
    expectRefusedWith(v.error, AUTHZ_ROLE_REFUSAL, 'a viewer pressed Pause');

    const channelOne = await signedIn({ user: 'operator' });
    const o = await channelOne.ask('o', 'stack.media-plate-transport', press);
    expectRefusedWith(o.error, authzChannelRefusal(2), 'channel 1’s operator paused channel 2');

    const channelTwo = await signedIn({ user: 'channelTwo' });
    expect((await channelTwo.ask('e', 'lock.engage', { pin: '4711' })).payload).toEqual({
      ok: true,
    });
    const locked = await both.ask('k', 'stack.media-plate-transport', press);
    expectRefusedWith(locked.error, LOCK_ENGAGED_REFUSAL, 'a locked console paused the clip');
    expect(await pauses(), 'a refused press reached the wire').toEqual([]);
    expect((await channelTwo.ask('u', 'lock.release', { pin: '4711' })).payload).toEqual({
      ok: true,
    });

    // Positive control — the same socket, granted channel 2, on the on-air row: accepted, and sent.
    const ok = await both.ask('p', 'stack.media-plate-transport', press);
    expect(ok.error).toBe(undefined);
    expect(ok.payload).toEqual({ ok: true });
    expect(await pauses()).toEqual(['PAUSE 2-60']);
  });

  it('🔴 `sources.set-media-playback` is operator-class: a viewer is refused; with no Playout media there is no clip to set', async () => {
    await station();
    const viewer = await signedIn({ user: 'viewer' });
    const setting = { mediaId: 'md-m-promo', loop: true, whenHidden: 'pause' };
    const v = await viewer.ask('v', 'sources.set-media-playback', setting);
    expectRefusedWith(v.error, AUTHZ_ROLE_REFUSAL, 'a viewer set a clip’s playback');
    const operator = await signedIn({ user: 'operator' });
    const o = await operator.ask('o', 'sources.set-media-playback', setting);
    expect(o.error).toBe(undefined);
    expect(o.payload).toMatchObject({ ok: false, reason: 'unknown-media' });
  });
});
