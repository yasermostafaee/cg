import * as dgram from 'node:dgram';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import { DEFAULT_LAYER_POLICY } from '@cg/caspar-client';
import {
  fixedBanksSlots,
  mediaSourceId,
  type ConnectionConfig,
  type FixedLayerBank,
  type SourceAssignments,
  type TemplateInfo,
} from '@cg/shared-ipc';
import { BackupMediaLookup } from '../src/backup-media.js';
import { CasparRuntime } from '../src/caspar-runtime.js';
import { validateFixedBank } from '../src/fixed-layers-store.js';
import { PlayoutSources } from '../src/playout-sources.js';
import {
  fakeFingerprint,
  startFakePlayout,
  type FakeMediaItem,
  type FakePlayout,
} from './support/fake-playout.js';
import { awaitChannelModeRead, HEALTH_MS } from './support/harness.js';
import { LocalPlayoutSources } from './support/local-playout-sources.js';

/**
 * 🔴 `PLAYOUT-FEATURES-01` A (`B-286`) — **SERVER B GETS THE BACKUP'S OWN CLIP, FOUND BY FINGERPRINT IN THE
 * BACKUP PLAYOUT'S OWN D11 — OR NOTHING.**
 *
 * Two AMCP mocks (server A, server B) under `mirror-sync`; the PRIMARY's D11 is the local provider's, the
 * BACKUP's is a real fake Playout over HTTP whose library keeps the same items (the same fingerprints) at
 * OTHER paths — and lacks one. The bridge's own wiring: a `BackupMediaLookup` handed to the runtime. Read
 * off the wire each mock RECEIVED. Every absence has its control.
 */

let mocks: MockHandle[] = [];
let runtimes: CasparRuntime[] = [];
let readers: PlayoutSources[] = [];
let lookups: BackupMediaLookup[] = [];
let playouts: FakePlayout[] = [];
let traces: string[] = [];

afterEach(async () => {
  for (const l of lookups) l.dispose();
  lookups = [];
  for (const reader of readers) reader.dispose();
  readers = [];
  for (const r of runtimes) await r.stop();
  runtimes = [];
  for (const m of mocks) await m.stop();
  mocks = [];
  for (const p of playouts) await p.stop();
  playouts = [];
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

// ── The station ──────────────────────────────────────────────────────────────────────────────

const BANK: FixedLayerBank = { channel: 2, start: 80, count: 20, low: { start: 50, count: 10 } };
const BED = { channel: 2, layer: 59 };
const ROW = 'bed-59';
const BAND = { start: 60, end: 79 };

const item = (id: string, name: string, clip: string, fingerprint?: string): FakeMediaItem => ({
  id,
  name,
  clip,
  type: 'video',
  durationMs: 30_000,
  width: 1920,
  height: 1080,
  folder: 'Media',
  updatedAt: '2026-09-30T08:00:00Z',
  ...(fingerprint !== undefined ? { fingerprint } : {}),
});

// The PRIMARY's library: two clips with fingerprints, one without (a source rewritten in place).
const PROMO = item(
  'm-promo',
  'پرومو',
  'C:/Apasai CIaB/Promo/promo.mp4',
  fakeFingerprint('m-promo'),
);
const STING = item(
  'm-sting',
  'Sting',
  'C:/Apasai CIaB/Promo/sting.mov',
  fakeFingerprint('m-sting'),
);
const BARE = item('m-bare', 'Bare', 'C:/Apasai CIaB/Promo/bare.mov');
const PRIMARY_MEDIA = [PROMO, STING, BARE];
// The BACKUP's library: PROMO at ANOTHER path (the same bytes, the same fingerprint); STING missing.
const BACKUP_MEDIA = [
  item('b-promo', 'پرومو', 'E:/Backup Library/promo.mp4', fakeFingerprint('m-promo')),
  item('b-other', 'Other', 'E:/Backup Library/other.mp4', fakeFingerprint('m-other')),
];

const SCENE = { width: 1920, height: 1080 };
const CENTRED = { anchor: 'center' as const, offset: { x: 0, y: 0 } };
const LEFT = { x: 0, y: 0, width: 960, height: 1080 };
const RIGHT = { x: 960, y: 0, width: 960, height: 1080 };
const plate = (id: string, rect: typeof LEFT) => ({
  elementId: `el-${id}`,
  sourceId: id,
  rect,
  expectedAspect: 16 / 9,
  dynamic: false,
});
const TWO_BOX: TemplateInfo = {
  templateId: 'two-box',
  templateType: 'custom',
  fields: [],
  liveSources: {
    resolution: SCENE,
    defaultPosition: CENTRED,
    sources: [plate('l1', LEFT), plate('l2', RIGHT)],
  },
};
const bind = (l1: string, l2: string): SourceAssignments => ({
  assignments: [
    { templateId: 'two-box', plateId: 'l1', sourceId: mediaSourceId(l1) },
    { templateId: 'two-box', plateId: 'l2', sourceId: mediaSourceId(l2) },
  ],
});

async function newMock(oscPort: number): Promise<{ mock: MockHandle; trace: string }> {
  const trace = path.join(
    os.tmpdir(),
    `cg-backup-media-${String(process.pid)}-${String(Date.now())}-${String(Math.round(performance.now() * 1000))}.ndjson`,
  );
  const mock = await createMock({
    amcpPort: 0,
    oscPort,
    oscHost: '127.0.0.1',
    oscHz: 40,
    channels: 2,
    tracePath: trace,
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

interface Rig {
  readonly r: CasparRuntime;
  readonly backupPlayout: FakePlayout;
  readonly lookup: BackupMediaLookup;
  aLines(): Promise<string[]>;
  bLines(): Promise<string[]>;
}

async function boot(
  options: {
    readonly assignments?: SourceAssignments;
    /** Read the backup's list before the take (the bridge does, on the bind); default true. */
    readonly resolveFirst?: boolean;
    readonly backupLegacy?: boolean;
    readonly backupOffline?: boolean;
  } = {},
): Promise<Rig> {
  const provider = new LocalPlayoutSources({ media: PRIMARY_MEDIA });
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
  for (const m of PRIMARY_MEDIA) {
    expect(await sources.ensureBound(mediaSourceId(m.id))).toEqual({ ok: true });
  }

  const backupPlayout = await startFakePlayout();
  playouts.push(backupPlayout);
  backupPlayout.setMedia(BACKUP_MEDIA);
  backupPlayout.setD11Legacy(options.backupLegacy === true);
  if (options.backupOffline === true) await backupPlayout.goOffline();
  const lookup = new BackupMediaLookup({
    url: () => backupPlayout.mediaUrl,
    bearer: () => 'bridge-bearer',
  });
  lookups.push(lookup);

  const [oscA, oscB] = [await freeUdpPort(), await freeUdpPort()];
  const a = await newMock(oscA);
  const b = await newMock(oscB);
  const config: ConnectionConfig = {
    servers: {
      A: { host: '127.0.0.1', amcpPort: a.mock.amcpPort, oscPort: oscA },
      B: { host: '127.0.0.1', amcpPort: b.mock.amcpPort, oscPort: oscB },
    },
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
      sourceCatalog: sources.catalog(),
      sourceAssignments: options.assignments ?? bind(PROMO.id, STING.id),
    },
  );
  runtimes.push(r);
  // The bridge's own wiring (`createBridge`), verbatim in shape.
  sources.onCatalogChanged((catalog) => r.setResolvedSourceCatalog(catalog));
  r.useBackupMedia((fingerprint) => lookup.lookup(fingerprint));
  const fingerprints = sources
    .catalog()
    .sources.flatMap((s) => (s.media?.fingerprint !== undefined ? [s.media.fingerprint] : []));
  if (options.resolveFirst !== false) await lookup.track(fingerprints);
  else void lookup.track(fingerprints);
  r.start();
  await r.startServing();
  r.templateImport(TWO_BOX, '<!doctype html><html><body>two-box</body></html>');
  await r.whenServerHealthy(HEALTH_MS);
  await awaitChannelModeRead(r);
  // The boot blanket, on both servers, before any window is read.
  const blanket = fixedBanksSlots([BANK]).map(
    (s) => `MIXER ${String(s.channel)}-${String(s.layer)} VOLUME 1`,
  );
  const by = Date.now() + 10_000;
  for (;;) {
    const seen = new Set(await linesOf(a.mock, a.trace));
    if (blanket.every((l) => seen.has(l))) break;
    if (Date.now() > by) throw new Error('timed out waiting for the boot volume blanket');
    await delay(25);
  }
  return {
    r,
    backupPlayout,
    lookup,
    aLines: () => linesOf(a.mock, a.trace),
    bLines: () => linesOf(b.mock, b.trace),
  };
}

const plays = (lines: readonly string[]): string[] => lines.filter((l) => /^PLAY 2-\d+ "/.test(l));
const item0 = (r: CasparRuntime) => r.stackSnapshot().find((i) => i.itemId === ROW);

async function take(r: CasparRuntime): Promise<{ ms: number }> {
  expect(await r.loadFixed(BED, ROW, 'two-box', {})).toEqual({ accepted: true });
  const t0 = Date.now();
  const verdict = await r.take(ROW);
  const ms = Date.now() - t0;
  expect(verdict, JSON.stringify(verdict)).toEqual({ accepted: true });
  return { ms };
}

describe('PLAYOUT-FEATURES-01 A (B-286) — the backup’s own clip, by fingerprint', () => {
  it('🔴 server B gets ITS OWN path for a clip it holds — CONTROL: a clip it lacks is sent to B not at all, while A airs both, and the row says so', async () => {
    const { r, aLines, bLines } = await boot();
    await take(r);
    const a = plays(await aLines());
    const b = plays(await bLines());
    // A: both clips at A's own paths.
    expect(a.some((l) => l.includes('"C:/Apasai CIaB/Promo/promo.mp4"'))).toBe(true);
    expect(a.some((l) => l.includes('"C:/Apasai CIaB/Promo/sting.mov"'))).toBe(true);
    // B: PROMO at B's own path; STING — which B lacks — never.
    expect(b.filter((l) => l.includes('promo'))).toEqual([
      expect.stringContaining('"E:/Backup Library/promo.mp4"'),
    ]);
    expect(b.some((l) => l.includes('sting'))).toBe(false);
    // 🔴 No line B received ever carries a primary path.
    expect((await bLines()).filter((l) => l.includes('C:/Apasai CIaB'))).toEqual([]);
    expect(item0(r)?.backupNoCopy).toEqual([{ plateId: 'l2', name: 'Sting', reason: 'no-copy' }]);
  });

  it('🔴 a clip the primary’s Playout gave NO fingerprint is sent to B not at all — the reason is named', async () => {
    const { r, bLines } = await boot({ assignments: bind(PROMO.id, BARE.id) });
    await take(r);
    expect((await bLines()).filter((l) => l.includes('bare'))).toEqual([]);
    expect(item0(r)?.backupNoCopy).toEqual([
      { plateId: 'l2', name: 'Bare', reason: 'no-fingerprint' },
    ]);
  });

  it('🔴 a backup older than 2.9.1 (its items carry no fingerprint) refuses EVERY media plate on B, naming why', async () => {
    const { r, bLines } = await boot({ backupLegacy: true });
    await take(r);
    expect(plays(await bLines())).toEqual([]);
    expect(item0(r)?.backupNoCopy).toEqual([
      { plateId: 'l1', name: 'پرومو', reason: 'backup-old' },
      { plateId: 'l2', name: 'Sting', reason: 'backup-old' },
    ]);
  });

  it('🔴 the take never waits on the lookup: with the backup’s Playout unreachable it takes at once, and B is sent nothing', async () => {
    const { r, bLines, aLines } = await boot({ backupOffline: true, resolveFirst: false });
    const { ms } = await take(r);
    // The lookup's own bound is 5 s; a take that waited on it could not be this fast.
    expect(ms, `measured: ${String(ms)} ms`).toBeLessThan(2_000);
    expect(plays(await aLines())).toHaveLength(2);
    expect(plays(await bLines())).toEqual([]);
    expect(item0(r)?.backupNoCopy?.map((e) => e.reason)).toEqual([
      'backup-unread',
      'backup-unread',
    ]);
  });

  it('a clip’s transport verb reaches the primary only when B holds nothing of it — control: B’s own clip is paused on B too', async () => {
    const { r, aLines, bLines } = await boot();
    await take(r);
    const recs = r.liveLayers().get(ROW) ?? [];
    const promo = recs.find((x) => x.sourceId === 'l1');
    const sting = recs.find((x) => x.sourceId === 'l2');
    expect(sting?.backupRefused).toEqual({ reason: 'no-copy', name: 'Sting' });
    const markA = (await aLines()).length;
    const markB = (await bLines()).length;
    expect((await r.mediaPlateTransport(ROW, 'l2', 'pause')).ok).toBe(true);
    expect((await r.mediaPlateTransport(ROW, 'l1', 'pause')).ok).toBe(true);
    const newA = (await aLines()).slice(markA);
    const newB = (await bLines()).slice(markB);
    expect(newA).toContain(`PAUSE 2-${String(sting?.slot.layer)}`);
    expect(newB).not.toContain(`PAUSE 2-${String(sting?.slot.layer)}`);
    // CONTROL — B holds its own PROMO: its pause reaches B too.
    expect(newB).toContain(`PAUSE 2-${String(promo?.slot.layer)}`);
  });
});
