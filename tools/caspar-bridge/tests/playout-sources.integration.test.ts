import * as dgram from 'node:dgram';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import {
  ROUTE_NOT_SUPPORTED_YET,
  inputSourceId,
  mediaSourceId,
  type ConnectionConfig,
  type SourceAssignments,
  type TemplateInfo,
} from '@cg/shared-ipc';
import { formatAmcpLogLine, type AmcpLogEntry } from '../src/amcp-log.js';
import { CasparRuntime, D10_VOLUME_RAMP_FRAMES } from '../src/caspar-runtime.js';
import { CommandBuilder } from '../src/command-builder.js';
import { PlayoutSources, SOURCES_POLL_MS } from '../src/playout-sources.js';
import { FAKE_MEDIA_IDS } from './support/fake-playout.js';
import { HEALTH_MS, TEST_LAYER_POLICY } from './support/harness.js';
import { LocalPlayoutSources } from './support/local-playout-sources.js';

/**
 * 🔴 `PLAYOUT-SOURCES-01` §4 — **A PLATE BOUND TO WHAT THE PLAYOUT OFFERS, TAKEN ON THE WIRE.**
 *
 * The station's sources come from the Playout (D10 inputs, D11 media), through the ONE reader and
 * the ONE builder, into the runtime a take resolves against. These tests drive that whole path in
 * process — `PlayoutSources` over the auth-off provider (`local-playout-sources.ts`, whose answers
 * are the fake Playout's own) — and read what reached the AMCP mock. What only HTTP can show (the
 * `ETag`, a `404`, the cadence) is `playout-sources-http.integration.test.ts`.
 *
 * Every absence below is paired with its positive control.
 */

let mock: MockHandle | null = null;
let runtime: CasparRuntime | null = null;
let sources: PlayoutSources | null = null;
let tracePath: string | null = null;
const dirs: string[] = [];

afterEach(async () => {
  sources?.dispose();
  sources = null;
  await runtime?.stop();
  runtime = null;
  await mock?.stop();
  mock = null;
  if (tracePath !== null && fs.existsSync(tracePath)) fs.rmSync(tracePath);
  tracePath = null;
  while (dirs.length > 0) {
    const dir = dirs.pop();
    if (dir !== undefined) fs.rmSync(dir, { recursive: true, force: true });
  }
});

function tmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-playout-sources-'));
  dirs.push(dir);
  return dir;
}

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

const BAND = { start: 30, end: 32 };
const SCENE = { width: 1920, height: 1080 };
const CENTRED = { anchor: 'center' as const, offset: { x: 0, y: 0 } };

const TEMPLATE: TemplateInfo = {
  templateId: 'lower-third',
  templateType: 'lower-third',
  fields: [],
  liveSources: {
    resolution: SCENE,
    defaultPosition: CENTRED,
    sources: [
      {
        elementId: 'el-1',
        sourceId: 'guest-1',
        rect: { x: 100, y: 100, width: 400, height: 225 },
        dynamic: false,
      },
      {
        elementId: 'el-2',
        sourceId: 'guest-2',
        rect: { x: 600, y: 100, width: 400, height: 225 },
        dynamic: false,
      },
    ],
  },
};

const STUDIO_1 = inputSourceId('li-studio1');
const NEWS_CAM = inputSourceId('li-newscam');
const MULTICAST = inputSourceId('li-multicast');
const INPUT_3 = inputSourceId('li-input3');
const INPUT_4 = inputSourceId('li-input4');
const RIST = inputSourceId('li-rist');
const MEDIA_STUDIO_1 = mediaSourceId(FAKE_MEDIA_IDS.studio1);
const MEDIA_KHABAR = mediaSourceId(FAKE_MEDIA_IDS.khabar1405);

/**
 * Both plates of the template — a take is all or nothing, so an unbound `guest-2` would refuse it.
 * `guest-2` defaults to `Multicast`, a usable D10 stream no test here takes away; every assertion
 * about the plate under test reads `guest-1`'s layer (30).
 */
function plates(guest1: string, guest2: string = MULTICAST): SourceAssignments {
  return {
    assignments: [
      { templateId: 'lower-third', plateId: 'guest-1', sourceId: guest1 },
      { templateId: 'lower-third', plateId: 'guest-2', sourceId: guest2 },
    ],
  };
}

/** `guest-1`'s `PLAY` lines — the plate under test sits on the band's first layer. */
const guest1Plays = (lines: readonly string[]): string[] =>
  lines.filter((l) => l.startsWith('PLAY 1-30 '));

interface Station {
  readonly r: CasparRuntime;
  readonly provider: LocalPlayoutSources;
  readonly sources: PlayoutSources;
  readonly clock: { now: number };
  readonly exchanges: AmcpLogEntry[];
  readonly auditPath: string;
}

interface BootOptions {
  readonly assignments?: SourceAssignments;
  readonly provider?: LocalPlayoutSources;
  /** Media ids to bind through the bridge's own reads before the runtime starts. */
  readonly bindMedia?: readonly string[];
  readonly inputsPath?: string;
  readonly boundMediaPath?: string;
  /** Read D10 before the runtime starts. Default true. */
  readonly readFirst?: boolean;
}

async function boot(options: BootOptions = {}): Promise<Station> {
  const provider = options.provider ?? new LocalPlayoutSources();
  const clock = { now: 1_000_000 };
  const ps = new PlayoutSources({
    provider,
    signedIn: () => true,
    hostIsOurs: () => true,
    channelFor: (_host, channel) => channel,
    layerRange: BAND,
    inputsPath: options.inputsPath,
    boundMediaPath: options.boundMediaPath,
    now: () => clock.now,
    log: () => undefined,
  });
  sources = ps;
  if (options.readFirst !== false) await ps.refresh(0);
  for (const id of options.bindMedia ?? []) {
    expect(await ps.ensureBound(id), `binding ${id}`).toEqual({ ok: true });
  }

  const oscPort = await freeUdpPort();
  tracePath = path.join(
    os.tmpdir(),
    `cg-playout-sources-${String(process.pid)}-${String(Date.now())}-${String(Math.round(performance.now() * 1000))}.ndjson`,
  );
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 30, tracePath });
  const exchanges: AmcpLogEntry[] = [];
  const auditPath = path.join(tmpDir(), 'bridge-audit.ndjson');
  const r = new CasparRuntime(
    singleServer(mock.amcpPort, oscPort),
    {},
    {
      layerPolicy: TEST_LAYER_POLICY,
      sweepMs: 150,
      sourceCatalog: ps.catalog(),
      auditLogPath: auditPath,
      onAmcpExchange: (entry) => {
        exchanges.push(entry);
      },
    },
  );
  runtime = r;
  // The bridge's wiring, verbatim (`createBridge`): the reader's catalogue is the runtime's.
  ps.onCatalogChanged((catalog) => r.setResolvedSourceCatalog(catalog));
  r.setMediaFreshener((sourceId, played) => ps.freshClipFor(sourceId, played));
  r.start();
  await r.startServing();
  r.templateImport(TEMPLATE, '<!doctype html><html><body>served</body></html>');
  await r.whenServerHealthy(HEALTH_MS);
  if (options.assignments !== undefined) {
    expect(r.setSourceAssignments(options.assignments)).toEqual({ ok: true });
  }
  return { r, provider, sources: ps, clock, exchanges, auditPath };
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

const layerOf = (r: CasparRuntime, itemId: string, plateId: string): number | undefined =>
  (r.liveLayers().get(itemId) ?? []).find((rec) => rec.sourceId === plateId)?.slot.layer;

async function takeOnAir(r: CasparRuntime, itemId = 'item-1'): Promise<void> {
  await r.load(itemId, 'lower-third', {});
  const verdict = await r.take(itemId);
  expect(verdict, JSON.stringify(verdict)).toMatchObject({ accepted: true });
}

// ── §1.D — the wire ─────────────────────────────────────────────────────────────────────

describe('§1.D — the wire does not change, but for the NDI spelling', () => {
  it('🔴 a plate bound to a Playout NDI input plays `[NDI] "<source>"`', async () => {
    const { r } = await boot({ assignments: plates(STUDIO_1) });
    await takeOnAir(r);
    const layer = layerOf(r, 'item-1', 'guest-1');
    expect(layer).toBeDefined();
    const plays = (await recvLines()).filter((l) => l.startsWith('PLAY '));
    expect(plays).toContain(`PLAY 1-${String(layer)} [NDI] "STUDIO-PC (Cam 1)"`);
    // …which is the byte form the builder spells for the prompt's own example.
    expect(
      new CommandBuilder().playSource(
        { channel: 2, layer: 60 },
        { kind: 'ndi', source: 'STUDIO-PC (Cam 1)' },
      ),
    ).toBe('PLAY 2-60 [NDI] "STUDIO-PC (Cam 1)"');
  });

  it('control: no `NDI NAME` spelling remains anywhere in the bridge source', () => {
    const src = fileURLToPath(new URL('../src', import.meta.url));
    const files = fs.readdirSync(src).filter((f) => f.endsWith('.ts'));
    // Positive control: the instrument reads the real tree — the new spelling IS there.
    const all = files.map((f) => fs.readFileSync(path.join(src, f), 'utf8')).join('\n');
    expect(files.length).toBeGreaterThan(20);
    expect(all).toContain('[NDI]');
    // The absence: the consumer syntax is spelt nowhere a command could be built from.
    const builder = fs.readFileSync(path.join(src, 'command-builder.ts'), 'utf8');
    expect(builder).not.toMatch(/`NDI NAME \$\{/);
    expect(builder).not.toContain("'NDI NAME '");
  });

  it('🔴 byte identity — a D10 stream and a D11 media plate send exactly what a hand-made entry with the same producer sent', async () => {
    const { r } = await boot({
      assignments: plates(MULTICAST, MEDIA_STUDIO_1),
      bindMedia: [MEDIA_STUDIO_1],
    });
    await takeOnAir(r);
    const d10 = (await recvLines()).filter((l) => l.startsWith('PLAY 1-3'));
    await r.stop();
    runtime = null;
    await mock?.stop();
    mock = null;

    // The same two producers as a hand-made catalogue carried them before this change.
    const media = sources?.catalog().sources.find((s) => s.id === MEDIA_STUDIO_1);
    if (media === undefined || media.producer.kind !== 'media') throw new Error('media not bound');
    const oscPort = await freeUdpPort();
    tracePath = path.join(os.tmpdir(), `cg-playout-sources-hand-${String(Date.now())}.ndjson`);
    mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 30, tracePath });
    const hand = new CasparRuntime(
      singleServer(mock.amcpPort, oscPort),
      {},
      {
        layerPolicy: TEST_LAYER_POLICY,
        sweepMs: 150,
        sourceCatalog: {
          sources: [
            {
              id: 'src-multicast',
              name: 'Multicast',
              format: '1080i5000',
              producer: { kind: 'stream', url: 'udp://239.255.0.1:5000?reuse=1' },
            },
            {
              id: 'src-clip',
              name: 'Studio 1',
              producer: { kind: 'media', file: media.producer.file },
            },
          ],
          layerRange: BAND,
        },
        sourceAssignments: plates('src-multicast', 'src-clip'),
      },
    );
    runtime = hand;
    hand.start();
    await hand.startServing();
    hand.templateImport(TEMPLATE, '<!doctype html><html><body>served</body></html>');
    await hand.whenServerHealthy(HEALTH_MS);
    await takeOnAir(hand);
    const handMade = (await recvLines()).filter((l) => l.startsWith('PLAY 1-3'));

    expect(d10).toHaveLength(2);
    expect(d10).toEqual(handMade);
    // The expected lines, as the existing stream test spells the form (`command-builder.test.ts`).
    expect(d10).toContain('PLAY 1-30 "udp://239.255.0.1:5000?reuse=1"');
    // Control: a different producer gives a different line.
    expect(
      new CommandBuilder().playSource(
        { channel: 1, layer: 30 },
        { kind: 'stream', url: 'udp://239.255.0.2:5000' },
      ),
    ).not.toBe('PLAY 1-30 "udp://239.255.0.1:5000?reuse=1"');
  });
});

// ── §1.C — unavailable, never pruned ────────────────────────────────────────────────────

describe('§1.C — an input the Playout stopped offering', () => {
  it('🔴 is marked unavailable, the binding is KEPT, and a take is refused with the sentence and nothing sent', async () => {
    const { r, provider, sources: ps } = await boot({ assignments: plates(STUDIO_1) });
    provider.removeInput('li-studio1');
    await ps.refresh(0);

    const entry = r.sourceCatalog().sources.find((s) => s.id === STUDIO_1);
    expect(entry).toMatchObject({ name: 'Studio 1', status: 'unavailable', departed: true });
    // The binding stays: only an operator removes one.
    expect(r.sourceAssignments().assignments).toEqual(plates(STUDIO_1).assignments);

    await r.load('item-1', 'lower-third', {});
    const before = (await recvLines()).length;
    const verdict = await r.take('item-1');
    expect(verdict).toMatchObject({ accepted: false, errorCode: 'source-unavailable' });
    expect(verdict.message).toContain("“Studio 1” is not in the Playout's input list.");
    // Nothing reached CasparCG: refused before any AMCP that could change air.
    expect(
      (await recvLines())
        .slice(before)
        .filter((l) =>
          /^(PLAY|LOAD|CG |CLEAR|MIXER \S+ (FILL|CLIP|OPACITY|COMMIT)|MIXER \S+ VOLUME \S)/.test(l),
        ),
    ).toEqual([]);
    // The row says which source, in the operator's words.
    const row = r.stackSnapshot().find((i) => i.itemId === 'item-1');
    expect(row?.takeRefusal).toMatchObject({
      code: 'source-unavailable',
      plateId: 'guest-1',
      sourceName: 'Studio 1',
      sourceOrigin: 'input',
    });

    // Control: the Playout lists it again, the tag clears, and the take plays.
    provider.restoreInput('li-studio1');
    await ps.refresh(0);
    expect(r.sourceCatalog().sources.find((s) => s.id === STUDIO_1)?.status).toBeUndefined();
    expect(await r.take('item-1')).toMatchObject({ accepted: true });
  });

  it('an item ALREADY on air is untouched by the input leaving the list', async () => {
    const { r, provider, sources: ps } = await boot({ assignments: plates(STUDIO_1) });
    await takeOnAir(r);
    const ledger = JSON.stringify(r.liveLayers().get('item-1'));
    const before = (await recvLines()).length;

    provider.removeInput('li-studio1');
    await ps.refresh(0);
    await new Promise((resolve) => setTimeout(resolve, 200));

    // No CLEAR, no PLAY, no MIXER — air stays as it is, and so does the ledger.
    const sent = (await recvLines()).slice(before).filter((l) => !l.startsWith('INFO'));
    expect(sent.filter((l) => /^(CLEAR|PLAY|MIXER 1-3)/.test(l))).toEqual([]);
    expect(JSON.stringify(r.liveLayers().get('item-1'))).toBe(ledger);
    // Control: the catalogue DID change — the read reached the runtime.
    expect(r.sourceCatalog().sources.find((s) => s.id === STUDIO_1)?.status).toBe('unavailable');
  });

  it('a media item the Playout no longer lists is refused with the media sentence', async () => {
    const {
      r,
      provider,
      sources: ps,
    } = await boot({
      assignments: plates(MEDIA_KHABAR),
      bindMedia: [MEDIA_KHABAR],
    });
    provider.removeMedia(FAKE_MEDIA_IDS.khabar1405);
    await ps.refresh(0);
    await r.load('item-1', 'lower-third', {});
    const verdict = await r.take('item-1');
    expect(verdict).toMatchObject({ accepted: false, errorCode: 'source-unavailable' });
    expect(verdict.message).toContain('“خبر ۱۴۰۵” is not available in the Playout right now.');
    // Control: back in the library, it plays.
    provider.restoreMedia(FAKE_MEDIA_IDS.khabar1405);
    await ps.refresh(0);
    expect(await r.take('item-1')).toMatchObject({ accepted: true });
  });

  it('🔴 no prune: after the input left and a restart, the binding and the entry are still there', async () => {
    const dir = tmpDir();
    const inputsPath = path.join(dir, 'bridge-playout-inputs.json');
    const provider = new LocalPlayoutSources();
    const first = await boot({ assignments: plates(STUDIO_1), provider, inputsPath });
    provider.removeInput('li-studio1');
    await first.sources.refresh(0);
    const held = first.r.sourceAssignments();
    sources?.dispose();

    // A restart of the reader, with the Playout down: the persisted list is in force.
    provider.setFailing(true);
    const restarted = new PlayoutSources({
      provider,
      signedIn: () => true,
      hostIsOurs: () => true,
      channelFor: (_h, c) => c,
      layerRange: BAND,
      inputsPath,
      log: () => undefined,
    });
    sources = restarted;
    await restarted.refresh(0);
    expect(restarted.catalog().sources.find((s) => s.id === STUDIO_1)).toMatchObject({
      status: 'unavailable',
      departed: true,
    });
    first.r.setResolvedSourceCatalog(restarted.catalog());
    expect(first.r.sourceAssignments()).toEqual(held);
    expect(held.assignments).toHaveLength(2);
  });
});

// ── §1.A — outage and restart ───────────────────────────────────────────────────────────

describe('§1.A — the last good list is persisted and stays in force', () => {
  it('🔴 with the Playout down, a restarted reader resolves bindings from the persisted list and the take plays', async () => {
    const dir = tmpDir();
    const inputsPath = path.join(dir, 'bridge-playout-inputs.json');
    // A first reader reads once and persists.
    const writer = new PlayoutSources({
      provider: new LocalPlayoutSources(),
      signedIn: () => true,
      hostIsOurs: () => true,
      channelFor: (_h, c) => c,
      inputsPath,
      log: () => undefined,
    });
    await writer.refresh(0);
    writer.dispose();
    expect(fs.existsSync(inputsPath)).toBe(true);

    // The station restarts with the Playout down.
    const down = new LocalPlayoutSources();
    down.setFailing(true);
    const { r } = await boot({ provider: down, inputsPath, assignments: plates(STUDIO_1) });
    await takeOnAir(r);
    expect(layerOf(r, 'item-1', 'guest-1')).toBeDefined();
  });

  it('control: a fresh station with no successful read resolves nothing, and the take refuses as unassigned', async () => {
    const down = new LocalPlayoutSources();
    down.setFailing(true);
    const { r } = await boot({ provider: down });
    // The binding cannot even be made — the source is not one the Playout offers yet.
    expect(r.setSourceAssignments(plates(STUDIO_1))).toMatchObject({
      ok: false,
      reason: 'unknown-source',
    });
    await r.load('item-1', 'lower-third', {});
    const verdict = await r.take('item-1');
    expect(verdict).toMatchObject({ accepted: false, errorCode: 'live-source-unassigned' });
  });
});

// ── §1.C — the one retry ────────────────────────────────────────────────────────────────

describe('§1.C — the one retry of a media PLAY answered 404', () => {
  it('🔴 reads `ids=` once, retries ONCE with the fresh path, and the take plays', async () => {
    const provider = new LocalPlayoutSources();
    const { r } = await boot({
      provider,
      assignments: plates(MEDIA_KHABAR),
      bindMedia: [MEDIA_KHABAR],
    });
    const stale = provider.mediaItem(FAKE_MEDIA_IDS.khabar1405)?.clip ?? '';
    expect(stale).not.toBe('');
    // The Playout has moved the file (cache ⇄ original); CasparCG no longer has the old path.
    const fresh = provider.setMediaClip(
      FAKE_MEDIA_IDS.khabar1405,
      'C:/Apasai CIaB/Engine/cache/fresh copy.mpg',
    );
    mock?.setMissingMedia([stale]);
    const readsBefore = provider.idsReads.length;

    await takeOnAir(r);

    const plays = guest1Plays(await recvLines());
    expect(plays).toEqual([`PLAY 1-30 "${stale}"`, `PLAY 1-30 "${fresh}"`]);
    expect(provider.idsReads.length - readsBefore).toBe(1);
    // The ledger records what was SENT — the fresh path — so the next reconcile agrees with it.
    expect(r.liveLayers().get('item-1')?.[0]?.producer).toBe(`"${fresh}"`);
  });

  it('control: when the fresh read returns the SAME path, the take fails all-or-nothing, after exactly one retry read', async () => {
    const provider = new LocalPlayoutSources();
    const { r } = await boot({
      provider,
      assignments: plates(MEDIA_KHABAR),
      bindMedia: [MEDIA_KHABAR],
    });
    const stale = provider.mediaItem(FAKE_MEDIA_IDS.khabar1405)?.clip ?? '';
    mock?.setMissingMedia([stale]);
    const readsBefore = provider.idsReads.length;

    await r.load('item-1', 'lower-third', {});
    const verdict = await r.take('item-1');
    expect(verdict).toMatchObject({ accepted: false, errorCode: 'amcp-404' });

    const plays = guest1Plays(await recvLines());
    // ONE PLAY of the stale path: nothing changed, so there is nothing to retry — never two.
    expect(plays).toEqual([`PLAY 1-30 "${stale}"`]);
    expect(provider.idsReads.length - readsBefore).toBe(1);
    // All or nothing: the graphic was not played, and the ledger holds no plate.
    expect(r.liveLayers().get('item-1') ?? []).toEqual([]);
  });

  it('a media PLAY refused 404 when the Playout does not answer fails exactly as before', async () => {
    const provider = new LocalPlayoutSources();
    const { r } = await boot({
      provider,
      assignments: plates(MEDIA_KHABAR),
      bindMedia: [MEDIA_KHABAR],
    });
    const stale = provider.mediaItem(FAKE_MEDIA_IDS.khabar1405)?.clip ?? '';
    mock?.setMissingMedia([stale]);
    provider.setFailing(true);
    await r.load('item-1', 'lower-third', {});
    expect(await r.take('item-1')).toMatchObject({ accepted: false, errorCode: 'amcp-404' });
    expect(guest1Plays(await recvLines())).toHaveLength(1);
  });
});

// ── §1.A — clip freshness ───────────────────────────────────────────────────────────────

describe('§1.A — a bound media item is re-read every 30 s', () => {
  it('🔴 the Playout moves the clip, and within 30 s the next take plays the new path', async () => {
    const provider = new LocalPlayoutSources();
    const station = await boot({
      provider,
      assignments: plates(MEDIA_KHABAR),
      bindMedia: [MEDIA_KHABAR],
    });
    const moved = provider.setMediaClip(
      FAKE_MEDIA_IDS.khabar1405,
      'C:/Apasai CIaB/آرشیو/خبر ۱۴۰۵ (اصلی).mp4',
    );
    station.clock.now += SOURCES_POLL_MS;
    await station.sources.refresh(SOURCES_POLL_MS);
    await takeOnAir(station.r);
    expect(guest1Plays(await recvLines())).toEqual([`PLAY 1-30 "${moved}"`]);
  });

  it('control: before 30 s have passed no re-read is made, and the path is unchanged', async () => {
    const provider = new LocalPlayoutSources();
    const station = await boot({
      provider,
      assignments: plates(MEDIA_KHABAR),
      bindMedia: [MEDIA_KHABAR],
    });
    const original = provider.mediaItem(FAKE_MEDIA_IDS.khabar1405)?.clip ?? '';
    const reads = provider.idsReads.length;
    station.clock.now += SOURCES_POLL_MS - 1;
    await station.sources.refresh(SOURCES_POLL_MS);
    expect(provider.idsReads.length).toBe(reads);
    await takeOnAir(station.r);
    expect(guest1Plays(await recvLines())).toEqual([`PLAY 1-30 "${original}"`]);
  });
});

// ── §1.H — v1.3 shapes, and what cannot be bound ────────────────────────────────────────

describe('§1.H — the route gate, and unusable inputs', () => {
  it('🔴 both v1.3 route inputs parse, carry the gate, and cannot be bound — and no `PLAY … route://` is ever sent', async () => {
    const { r } = await boot();
    for (const id of [INPUT_3, INPUT_4]) {
      const entry = r.sourceCatalog().sources.find((s) => s.id === id);
      expect(entry, id).toMatchObject({ status: 'unusable', reason: ROUTE_NOT_SUPPORTED_YET });
      expect(entry?.producer.kind).toBe('route');
      expect(r.setSourceAssignments(plates(id))).toMatchObject({
        ok: false,
        reason: 'source-unusable',
      });
    }
    // Per channel: `ورودی ۴` is for channel 1 only, `ورودی ۳` for both.
    expect(r.sourceCatalog().sources.find((s) => s.id === INPUT_3)?.channels).toEqual([1, 2]);
    expect(r.sourceCatalog().sources.find((s) => s.id === INPUT_4)?.channels).toEqual([1]);

    // Control: the NDI and stream inputs bind and play.
    expect(r.setSourceAssignments(plates(STUDIO_1, NEWS_CAM))).toEqual({ ok: true });
    await takeOnAir(r);
    expect((await recvLines()).some((l) => /^PLAY \S+ "route:\/\//.test(l))).toBe(false);
  });

  it('an input on a scheme this product does not accept is unusable, and not even a hand-crafted request binds it', async () => {
    const { r } = await boot();
    const rist = r.sourceCatalog().sources.find((s) => s.id === RIST);
    expect(rist?.status).toBe('unusable');
    expect(rist?.reason).toBeTruthy();
    expect(r.setSourceAssignments(plates(RIST))).toMatchObject({
      ok: false,
      reason: 'source-unusable',
    });
    expect(await r.swapLiveSource('item-1', 'guest-1', RIST)).toMatchObject({ ok: false });
  });
});

// ── §1.I — audio for every D10 plate ────────────────────────────────────────────────────

describe('§1.I — a Playout input is seated silent and only ever rises by a ramp', () => {
  it('🔴 on a take of an NDI and a stream plate, `VOLUME 0` is committed BEFORE each `PLAY`, and no `VOLUME 1` reaches them', async () => {
    const { r } = await boot({ assignments: plates(STUDIO_1, MULTICAST) });
    await takeOnAir(r);
    const lines = await recvLines();
    for (const plate of ['guest-1', 'guest-2']) {
      const layer = String(layerOf(r, 'item-1', plate));
      const mute = lines.indexOf(`MIXER 1-${layer} VOLUME 0 DEFER`);
      const play = lines.findIndex((l) => l.startsWith(`PLAY 1-${layer} `));
      const commit = lines.findIndex((l, i) => i > mute && l === 'MIXER 1 COMMIT');
      expect(mute, plate).toBeGreaterThanOrEqual(0);
      expect(commit, plate).toBeGreaterThan(mute);
      expect(play, plate).toBeGreaterThan(commit);
      // Nothing automatic raises it: not the take's re-assert, not the connect sweep.
      expect(
        lines.filter((l) => new RegExp(`^MIXER 1-${layer} VOLUME (?!0( |$))`).test(l)),
      ).toEqual([]);
    }
    // Control: the page layer still gets its `VOLUME 1`, exactly as today.
    expect(lines.some((l) => /^MIXER 1-\d+ VOLUME 1$/.test(l))).toBe(true);
  });

  it('🔴 an operator raise sends `VOLUME <v> 25`; PANIC sends an immediate 0', async () => {
    const { r } = await boot({ assignments: plates(STUDIO_1) });
    await takeOnAir(r);
    const layer = String(layerOf(r, 'item-1', 'guest-1'));
    const before = (await recvLines()).length;

    expect(await r.setLivePlateVolume('item-1', 'guest-1', 0.8)).toMatchObject({
      ok: true,
      sent: true,
    });
    expect(await r.silenceAllLivePlates()).toBeDefined();

    const sent = (await recvLines())
      .slice(before)
      .filter((l) => l.startsWith(`MIXER 1-${layer} VOLUME`));
    expect(sent).toEqual([
      `MIXER 1-${layer} VOLUME 0.8 ${String(D10_VOLUME_RAMP_FRAMES)}`,
      `MIXER 1-${layer} VOLUME 0`,
    ]);
    expect(D10_VOLUME_RAMP_FRAMES).toBe(25);
  });

  it('a Playout input swapped IN PLACE is muted before its PLAY, and its declared volume comes back by a ramp', async () => {
    const { r } = await boot({ assignments: plates(STUDIO_1) });
    await takeOnAir(r);
    const layer = String(layerOf(r, 'item-1', 'guest-1'));
    await r.setLivePlateVolume('item-1', 'guest-1', 0.5);
    const before = (await recvLines()).length;

    // `guest-2` holds Multicast; the news camera is a Playout input no plate holds.
    expect(await r.swapLiveSource('item-1', 'guest-1', NEWS_CAM)).toEqual({ ok: true });

    const sent = (await recvLines()).slice(before);
    const mute = sent.indexOf(`MIXER 1-${layer} VOLUME 0 DEFER`);
    const play = sent.findIndex((l) => l.startsWith(`PLAY 1-${layer} `));
    expect(mute).toBeGreaterThanOrEqual(0);
    expect(sent.slice(mute, play)).toContain('MIXER 1 COMMIT');
    expect(play).toBeGreaterThan(mute);
    // No CLEAR — a replace in place (`B-126`) — and the reveal ramps back to the declared volume.
    expect(sent.some((l) => l.startsWith('CLEAR '))).toBe(false);
    expect(sent.slice(play)).toContain(
      `MIXER 1-${layer} VOLUME 0.5 ${String(D10_VOLUME_RAMP_FRAMES)} DEFER`,
    );
  });

  it('control: a MEDIA plate keeps today’s wire — no in-place mute and no ramp', async () => {
    const { r } = await boot({ assignments: plates(MEDIA_KHABAR), bindMedia: [MEDIA_KHABAR] });
    await takeOnAir(r);
    const layer = String(layerOf(r, 'item-1', 'guest-1'));
    const before = (await recvLines()).length;
    await r.setLivePlateVolume('item-1', 'guest-1', 0.8);
    const sent = (await recvLines())
      .slice(before)
      .filter((l) => l.startsWith(`MIXER 1-${layer} VOLUME`));
    expect(sent).toEqual([`MIXER 1-${layer} VOLUME 0.8`]);
  });
});

// ── §1.E — credentials ──────────────────────────────────────────────────────────────────

describe('§1.E — a stream URL’s credentials are never written', () => {
  it('🔴 the AMCP log and the audit carry `rtsp://***@10.0.0.21/live`, never the password', async () => {
    const { r, exchanges, auditPath } = await boot({ assignments: plates(NEWS_CAM, MULTICAST) });
    // CasparCG refuses the stream, so its line is also the refusal's recorded command.
    mock?.setMissingMedia(['rtsp://cam:secret@10.0.0.21/live']);
    await r.load('item-1', 'lower-third', {});
    expect(await r.take('item-1')).toMatchObject({ accepted: false, errorCode: 'amcp-404' });
    await new Promise((resolve) => setTimeout(resolve, 100));

    const log = exchanges.map(formatAmcpLogLine).join('\n');
    const audit = fs.readFileSync(auditPath, 'utf8');
    const published = JSON.stringify([r.stackSnapshot(), r.liveLayersState()]);
    expect(log).toContain('rtsp://***@10.0.0.21/live');
    expect(audit).toContain('rtsp://***@10.0.0.21/live');
    for (const text of [log, audit, published]) {
      expect(text).not.toContain('cam:secret');
    }
  });

  it('control: a URL without credentials is logged unchanged', async () => {
    const { r, exchanges } = await boot({ assignments: plates(MULTICAST, STUDIO_1) });
    await takeOnAir(r);
    const log = exchanges.map(formatAmcpLogLine).join('\n');
    expect(log).toContain('"udp://239.255.0.1:5000?reuse=1"');
    // …and the published ledger names it as sent.
    expect(JSON.stringify(r.liveLayersState())).toContain('udp://239.255.0.1:5000?reuse=1');
  });

  it('the published ledger of a credentialed stream carries the redacted URL, while the persisted record keeps the real one', async () => {
    const { r } = await boot({ assignments: plates(NEWS_CAM) });
    await takeOnAir(r);
    const published = r.liveLayersState()[0]?.producer ?? '';
    expect(published).toBe('"rtsp://***@10.0.0.21/live"');
    // Adoption compares the record byte for byte against what would be sent — so it keeps the truth.
    expect(r.liveLayers().get('item-1')?.[0]?.producer).toBe('"rtsp://cam:secret@10.0.0.21/live"');
  });
});
