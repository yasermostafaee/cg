import dgram from 'node:dgram';
import net from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { createMock, defaultHandlers, type MockHandle, type MockMediaFile } from '@cg/amcp-mock';
import {
  mediaSourceId,
  type ConnectionHealth,
  type StationChannel,
  type TemplateInfo,
} from '@cg/shared-ipc';
import { createBridge, type BridgeHandle } from '../src/index.js';
import { openClient, type Client } from './support/auth-harness.js';
import {
  startFakePlayout,
  type FakeMediaItem,
  type FakePlayout,
  type FakePlayoutOptions,
} from './support/fake-playout.js';
import {
  CLS_REREAD_MS,
  mediaIdOf,
  startLocalCasparStation,
  type LocalCasparStation,
} from './support/local-caspar-station.js';
import { standardBank } from './support/two-channel-rig.js';

/**
 * 🔴 `DEV-LOCAL-CASPAR-01` — **`pnpm dev:station --fake --caspar 127.0.0.1:5250`, WITH `@cg/amcp-mock`
 * PLAYING THE OWNER'S CORE.** The mock is taught the two replies this mode reads a real core
 * through — `INFO PATHS` and `CLS` — in a 2.5.0 core's own dialect, and these specs drive
 * `startLocalCasparStation`, the function the dev station runs, then a real bridge configured the way
 * first-run leaves one: the Playout's address, the core on its host, channels 1 and 2 declared.
 *
 * What the owner will check by hand is here first: D4 is the core's channels, D10 is empty, D11 is
 * the core's library (search, sort and paging as on the fake), a take plays the clip by its ABSOLUTE
 * path on the core, the 30 s re-read, and the bridge's send guard, read off the wire.
 */

let handle: BridgeHandle | null = null;
let station: LocalCasparStation | null = null;
let mock: MockHandle | null = null;
const servers: net.Server[] = [];

afterEach(async () => {
  await handle?.close();
  await station?.stop();
  await mock?.stop();
  handle = null;
  station = null;
  mock = null;
  for (const server of servers.splice(0)) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

const MODULES = { startFakePlayout };
const HTML = '<!doctype html><html><head><meta charset="utf-8"></head><body>آرم</body></html>';

/** The core's start folder, as a Windows 2.5.0 core spells it (backslashes, then the `/` it adds). */
const INITIAL = 'D:\\CasparCG Server\\Server/';
const MEDIA_FOLDER = 'D:/CasparCG Server/Server/media/';

/** The scanner's library — names with spaces and Persian letters, in sub-folders; a still; audio. */
const FILES: readonly MockMediaFile[] = [
  {
    id: 'AMB',
    type: 'MOVIE',
    bytes: 6445960,
    modified: '20250101120000',
    frames: 268,
    timebase: '1/25',
  },
  {
    id: 'NEWS/2026/CLIP ONE',
    type: 'MOVIE',
    bytes: 104857600,
    modified: '20260920140500',
    frames: 1500,
    timebase: '1/25',
  },
  {
    id: 'آرشیو/۱۴۰۵/خبر ساعت ۱۴',
    type: 'MOVIE',
    bytes: 52428800,
    modified: '20260921093000',
    frames: 17982,
    timebase: '1001/30000',
  },
  {
    id: 'PROMO/کلیپ معرفی',
    type: 'MOVIE',
    bytes: 31457280,
    modified: '20260922101500',
    frames: 750,
    timebase: '1/25',
  },
  {
    id: 'LOGO',
    type: 'STILL',
    bytes: 51200,
    modified: '20260101000000',
    frames: 0,
    timebase: '0/1',
  },
  {
    id: 'MUSIC/BED',
    type: 'AUDIO',
    bytes: 4800000,
    modified: '20260102000000',
    frames: 1440000,
    timebase: '1/48000',
  },
];
const DROPPED_IN: MockMediaFile = {
  id: 'NEWS/2026/BREAKING',
  type: 'MOVIE',
  bytes: 1000,
  modified: '20260929100000',
  frames: 100,
  timebase: '1/25',
};

function freeUdpPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const sock = dgram.createSocket('udp4');
    sock.once('error', reject);
    sock.bind(0, '127.0.0.1', () => {
      const { port } = sock.address();
      sock.close(() => resolve(port));
    });
  });
}

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(cond: () => boolean, what: string, ms = 10_000): Promise<void> {
  const deadline = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await delay(25);
  }
}

/** The owner's core, played by the mock: two channels, the media folder, the scanner's library. */
async function ownersCore(
  options: { readonly media?: readonly MockMediaFile[] | null } = {},
): Promise<{ core: MockHandle; oscPort: number }> {
  const oscPort = await freeUdpPort();
  const media = options.media === undefined ? FILES : options.media;
  mock = await createMock({
    host: '127.0.0.1',
    amcpPort: 0,
    oscHost: '127.0.0.1',
    oscPort,
    channels: 2,
    paths: { media: 'media/', initial: INITIAL },
    ...(media !== null ? { media } : {}),
  });
  return { core: mock, oscPort };
}

/** Every line the core received, in order. */
const received = (core: MockHandle): string[] => core.receivedCommands().map((c) => c.line);
const clsReads = (core: MockHandle): number => received(core).filter((l) => l === 'CLS').length;

/** A bridge as first-run leaves it on this station: its Playout, the core on 127.0.0.1, CH 1 and 2. */
async function stationBridge(
  p: FakePlayout,
  amcpPort: number,
  oscPort: number,
): Promise<BridgeHandle> {
  handle = await createBridge({
    port: 0,
    connection: {
      servers: { A: { host: '127.0.0.1', amcpPort, oscPort } },
      strategy: 'mirror-sync',
      autoFailoverEnabled: true,
    },
    playout: {
      auth: 'playout',
      issuer: p.issuer,
      jwksUrl: p.jwksUrl,
      tokenUrl: p.tokenUrl,
      refreshUrl: p.refreshUrl,
      revokedUrl: p.revokedUrl,
    },
    fixedLayers: [standardBank(1), standardBank(2)],
  });
  return handle;
}

let asked = 0;
const ask = (client: Client, channel: string, payload?: unknown) =>
  client.ask(`q-${String((asked += 1))}`, channel, payload);

async function linkUp(client: Client): Promise<void> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const health = (await ask(client, 'connections.health')).payload as ConnectionHealth;
    if (health.primary.state === 'healthy' || health.primary.state === 'degraded') return;
    await delay(100);
  }
  throw new Error('the bridge never reached the core');
}

/** `channels.list`, once the catalogue has been read (a row carries a name). */
async function namedChannels(client: Client): Promise<StationChannel[]> {
  const deadline = Date.now() + 10_000;
  for (;;) {
    const { channels } = (await ask(client, 'channels.list')).payload as {
      channels: StationChannel[];
    };
    if (channels.some((c) => c.named !== null) || Date.now() > deadline) return channels;
    await delay(100);
  }
}

interface MediaPage {
  readonly items: readonly { id: string; name: string; folder?: string; durationMs?: number }[];
  readonly total: number;
  readonly nextCursor: string | null;
}

async function mediaSearch(client: Client, query: Record<string, unknown>): Promise<MediaPage> {
  const answer = await ask(client, 'sources.media-search', query);
  expect(answer.error).toBeUndefined();
  const page = answer.payload as MediaPage & { ok: boolean };
  expect(page.ok).toBe(true);
  return page;
}

/** D11 as the fake Playout answers it, asked directly — no bridge in between. */
async function d11(
  p: FakePlayout,
  query: Record<string, string>,
): Promise<{ items: FakeMediaItem[]; total: number }> {
  const url = new URL(p.mediaUrl);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  const res = await fetch(url, { headers: { Authorization: 'Bearer local-core-test' } });
  expect(res.status).toBe(200);
  return (await res.json()) as { items: FakeMediaItem[]; total: number };
}

/**
 * The bridge's send guard, read off the WIRE: every layer it touched is 50–99, and it never sent
 * `CLEAR <ch>`, `MIXER <ch> CLEAR`, `SET … MODE`, a consumer `ADD`/`REMOVE`, `SWAP` or `CHANNEL_GRID`.
 */
function guardBreaches(lines: readonly string[]): string[] {
  return lines.filter((line) => {
    const [verb = '', target = '', third = ''] = line.trim().split(/\s+/);
    const v = verb.toUpperCase();
    if (['ADD', 'REMOVE', 'SWAP', 'CHANNEL_GRID'].includes(v)) return true;
    if (v === 'SET' && /\bMODE\b/i.test(line)) return true;
    const match = /^(\d+)(?:-(\d+))?$/.exec(target);
    if (match === null) return false;
    const layer = match[2] === undefined ? null : Number(match[2]);
    if (v === 'CLEAR' && layer === null) return true;
    if (v === 'MIXER' && layer === null && third.toUpperCase() === 'CLEAR') return true;
    return layer !== null && (layer < 50 || layer > 99);
  });
}

/** Two boxes side by side — the owner's check: a clip in plate 2. */
const TWO_BOX: TemplateInfo = {
  templateId: 'two-box',
  templateType: 'custom',
  fields: [],
  liveSources: {
    resolution: { width: 1920, height: 1080 },
    defaultPosition: { anchor: 'center', offset: { x: 0, y: 0 } },
    sources: [
      {
        elementId: 'el-1',
        sourceId: 'l1',
        rect: { x: 0, y: 0, width: 960, height: 1080 },
        expectedAspect: 16 / 9,
        dynamic: false,
      },
      {
        elementId: 'el-2',
        sourceId: 'l2',
        rect: { x: 960, y: 0, width: 960, height: 1080 },
        expectedAspect: 16 / 9,
        dynamic: false,
      },
    ],
  },
};

describe('the station, read from the core', () => {
  it('reads the core with exactly the five reads — and nothing else — before anything starts', async () => {
    const { core } = await ownersCore();
    station = await startLocalCasparStation(MODULES, { host: '127.0.0.1', port: core.amcpPort });
    expect(received(core)).toEqual(['VERSION', 'INFO', 'INFO PATHS', 'INFO CONFIG', 'CLS']);
    expect(station.core).toEqual({
      address: `127.0.0.1:${String(core.amcpPort)}`,
      version: '2.3.2 Stable',
      channels: [
        { channel: 1, format: 'PAL' },
        { channel: 2, format: 'PAL' },
      ],
      mediaFolder: MEDIA_FOLDER,
      clips: 4,
      stills: 1,
      osc: { toClients: true, port: 6250 },
    });
    expect(station.notes).toEqual([]);
    expect(station.marker).toBe('cg-dev-local-caspar-dev-only');
  });

  it('🔴 D4 is the core’s channels — CH n · local, output unknown — and D10 is empty, as the console sees them', async () => {
    const { core, oscPort } = await ownersCore();
    station = await startLocalCasparStation(MODULES, { host: '127.0.0.1', port: core.amcpPort });
    const p = station.playout;
    const bridge = await stationBridge(p, core.amcpPort, oscPort);
    const client = await openClient(bridge);
    const admin = await p.issueToken({ user: 'admin' });
    expect((await client.authenticate('a1', admin.token)).error).toBeUndefined();

    const channels = await namedChannels(client);
    expect(
      channels.map((c) => ({
        channel: c.channel,
        named: c.named,
        output: c.output,
        declared: c.declared,
        permitted: c.permitted,
      })),
    ).toEqual([
      {
        channel: 1,
        named: { id: 'local-ch1', name: 'CH 1 · local' },
        output: 'unknown',
        declared: true,
        permitted: true,
      },
      {
        channel: 2,
        named: { id: 'local-ch2', name: 'CH 2 · local' },
        output: 'unknown',
        declared: true,
        permitted: true,
      },
    ]);

    // D10: the sign-in's read arrived (the instrument is live) and lists no input.
    await waitFor(() => p.requestCounts.inputs >= 1, 'the sign-in’s D10 read');
    expect(p.inputs).toEqual([]);
    const ps = bridge.playoutSources;
    if (ps === null) throw new Error('no Playout sources reader');
    await ps.refresh(0);
    expect(ps.catalog().sources.filter((s) => s.origin === 'input')).toEqual([]);
  });

  it('🔴 D11 is the core’s library — search, sort and paging as on the fake — and a take plays the clip by its ABSOLUTE path on the core, inside the send guard', async () => {
    const { core, oscPort } = await ownersCore();
    station = await startLocalCasparStation(MODULES, { host: '127.0.0.1', port: core.amcpPort });
    const p = station.playout;
    const bridge = await stationBridge(p, core.amcpPort, oscPort);
    const client = await openClient(bridge);
    const admin = await p.issueToken({ user: 'admin' });
    expect((await client.authenticate('a1', admin.token)).error).toBeUndefined();

    // The Media tab: the four clips and the still; the audio file is never offered.
    const all = await mediaSearch(client, { q: '' });
    expect(all.total).toBe(5);
    expect(all.items.map((m) => m.name).sort()).toEqual(
      ['AMB', 'CLIP ONE', 'LOGO', 'خبر ساعت ۱۴', 'کلیپ معرفی'].sort(),
    );
    expect(all.items.find((m) => m.name === 'CLIP ONE')).toMatchObject({
      id: mediaSourceId(mediaIdOf('NEWS/2026/CLIP ONE')),
      folder: 'NEWS/2026',
      durationMs: 60_000,
    });
    // The console never holds the path.
    expect(JSON.stringify(all)).not.toContain('CasparCG Server');
    // Search: case folded (the scanner upper-cases), Persian, a folder.
    expect((await mediaSearch(client, { q: 'clip one' })).items.map((m) => m.name)).toEqual([
      'CLIP ONE',
    ]);
    expect((await mediaSearch(client, { q: 'خبر' })).items.map((m) => m.name)).toEqual([
      'خبر ساعت ۱۴',
    ]);
    // Sort: most recent first.
    expect((await mediaSearch(client, { q: '', sort: 'recent' })).items[0]?.name).toBe(
      'کلیپ معرفی',
    );
    // Paging: two at a time — no repeat, no gap.
    const first = await mediaSearch(client, { q: '', limit: 2 });
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).not.toBeNull();
    const second = await mediaSearch(client, { q: '', limit: 2, cursor: first.nextCursor });
    const third = await mediaSearch(client, { q: '', limit: 2, cursor: second.nextCursor });
    const paged = [...first.items, ...second.items, ...third.items].map((m) => m.id);
    expect(new Set(paged).size).toBe(5);
    expect(third.nextCursor).toBeNull();

    // The owner's check: a clip in plate 2 of a two-box template on CH 1 (and one in plate 1).
    await linkUp(client);
    const rt = bridge.runtime;
    rt.templateImport(TWO_BOX, HTML);
    const clipOne = mediaSourceId(mediaIdOf('NEWS/2026/CLIP ONE'));
    const amb = mediaSourceId(mediaIdOf('AMB'));
    const bound = await ask(client, 'sources.set-assignments', {
      assignments: [
        { channel: 1, templateId: 'two-box', plateId: 'l1', sourceId: amb },
        { channel: 1, templateId: 'two-box', plateId: 'l2', sourceId: clipOne },
      ],
    });
    expect(bound.payload).toMatchObject({ ok: true });
    expect(await rt.loadFixed({ channel: 1, layer: 59 }, 'bed-59', 'two-box', {})).toEqual({
      accepted: true,
    });
    expect(await rt.take('bed-59')).toEqual({ accepted: true });

    const lines = received(core);
    const plays = lines.filter((l) => l.startsWith('PLAY 1-'));
    expect(plays).toContainEqual(
      expect.stringMatching(
        /^PLAY 1-(6\d|7\d) "D:\/CasparCG Server\/Server\/media\/NEWS\/2026\/CLIP ONE"/,
      ),
    );
    expect(plays).toContainEqual(
      expect.stringMatching(/^PLAY 1-(6\d|7\d) "D:\/CasparCG Server\/Server\/media\/AMB"/),
    );
    // Nothing but a READ reached channel 2 — `CENTRAL-BRIDGE-01`'s start check reads each declared
    // channel with `INFO <ch>` — and the guard held on every line the core received.
    expect(lines.filter((l) => /^(?!INFO )[A-Z][A-Z ]*? 2(-\d+)?(\s|$)/.test(l))).toEqual([]);
    expect(lines.filter((l) => /^INFO 2$/.test(l)).length).toBeLessThanOrEqual(1);
    expect(guardBreaches(lines)).toEqual([]);
  });

  it('CONTROL — the wire check sees a breach when there is one', () => {
    expect(
      guardBreaches([
        'CLEAR 1',
        'PLAY 1-10 "x"',
        'SET 1 MODE PAL',
        'ADD 1 SCREEN',
        'REMOVE 1-700',
        'MIXER 1 CLEAR',
        'MIXER 1-100 OPACITY 1',
      ]),
    ).toHaveLength(7);
    expect(
      guardBreaches([
        'PLAY 1-60 "x"',
        'MIXER 1 COMMIT',
        'INFO 1',
        'CLEAR 1-99',
        'CG 1-99 ADD 0 "u" 1',
        'CG 1-99 REMOVE 0',
        'VERSION',
      ]),
    ).toEqual([]);
  });
});

describe('the library stays the core’s — CLS again when the Media tab asks after 30 s', () => {
  it('a search inside 30 s reads nothing; after 30 s it reads CLS once and lists what the core holds now', async () => {
    const clock = { t: 1_000_000 };
    const { core } = await ownersCore();
    station = await startLocalCasparStation(
      MODULES,
      { host: '127.0.0.1', port: core.amcpPort },
      { now: () => clock.t },
    );
    const p = station.playout;
    expect(clsReads(core)).toBe(1);

    // Inside 30 s: answered from the start's read.
    clock.t += CLS_REREAD_MS - 1;
    expect((await d11(p, { q: '', type: 'video,still' })).total).toBe(5);
    expect(clsReads(core)).toBe(1);

    // A clip is dropped into the media folder; 30 s have passed; the Media tab asks.
    core.setMedia([...FILES, DROPPED_IN]);
    clock.t += 1;
    const after = await d11(p, { q: 'breaking', type: 'video,still' });
    expect(clsReads(core)).toBe(2);
    expect(after.items.map((m) => m.clip)).toEqual([`${MEDIA_FOLDER}NEWS/2026/BREAKING`]);

    // 🔴 An `ids=` read — a take's re-check, with 1.5 s to live — never waits on a re-read.
    clock.t += CLS_REREAD_MS * 2;
    const byId = await d11(p, { ids: mediaIdOf('NEWS/2026/BREAKING') });
    expect(byId.items).toHaveLength(1);
    expect(clsReads(core)).toBe(2);

    // A scanner that stops does not empty the list the owner is choosing from.
    core.setMedia(null);
    expect((await d11(p, { q: '', type: 'video,still' })).total).toBe(6);
    expect(clsReads(core)).toBe(3);
  });

  it('two searches at once share ONE re-read — and BOTH see what it read', async () => {
    const clock = { t: 1_000_000 };
    const { core } = await ownersCore();
    station = await startLocalCasparStation(
      MODULES,
      { host: '127.0.0.1', port: core.amcpPort },
      { now: () => clock.t },
    );
    core.setMedia([...FILES, DROPPED_IN]);
    clock.t += CLS_REREAD_MS;
    const answers = await Promise.all([
      d11(station.playout, { q: 'breaking', type: 'video,still' }),
      d11(station.playout, { q: 'breaking', type: 'video,still' }),
    ]);
    expect(answers.map((a) => a.total)).toEqual([1, 1]);
    expect(clsReads(core)).toBe(2);
  });
});

describe('what the station says, and what it refuses', () => {
  it('no media scanner running: CLS 501 — the station starts, one note says why the Media tab is empty, and it fills once the scanner runs', async () => {
    const clock = { t: 1_000_000 };
    const { core } = await ownersCore({ media: null });
    station = await startLocalCasparStation(
      MODULES,
      { host: '127.0.0.1', port: core.amcpPort },
      { now: () => clock.t },
    );
    expect(station.notes).toEqual([
      'CasparCG answered CLS with 501: its media scanner is not running, so the Media tab is empty until it runs (casparcg_auto_restart.bat starts it beside CasparCG); the Media tab reads CLS again after 30 s.',
    ]);
    expect(station.core).toMatchObject({ clips: 0, stills: 0 });
    expect((await d11(station.playout, { q: '', type: 'video,still' })).total).toBe(0);

    core.setMedia(FILES);
    clock.t += CLS_REREAD_MS;
    expect((await d11(station.playout, { q: '', type: 'video,still' })).total).toBe(5);
  });

  it('a core that sends no OSC to its clients: the station starts, and one note says the remaining time will not show', async () => {
    const { core } = await ownersCore();
    const info = defaultHandlers().get('INFO');
    if (info === undefined) throw new Error('the mock has no INFO handler');
    core.setHandler('INFO', (req, ctx) =>
      req.args[0]?.toUpperCase() === 'CONFIG'
        ? {
            kind: 'ok-line',
            code: 201,
            verb: 'INFO CONFIG',
            data: '<?xml version="1.0" encoding="utf-8"?>\n<configuration>\n   <osc>\n      <disable-send-to-amcp-clients>true</disable-send-to-amcp-clients>\n   </osc>\n</configuration>\n',
          }
        : info(req, ctx),
    );
    station = await startLocalCasparStation(MODULES, { host: '127.0.0.1', port: core.amcpPort });
    expect(station.core.osc).toEqual({ toClients: false, port: 6250 });
    expect(station.notes).toEqual([
      'CasparCG sends no OSC to its AMCP clients (disable-send-to-amcp-clients) — no remaining time shows in this mode, and no setting was changed.',
    ]);
    // Control: the other reads were answered as ever.
    expect(station.core.clips).toBe(4);
  });

  it('nothing answering AMCP is ONE line, and no Playout is started', async () => {
    const closed = net.createServer();
    await new Promise<void>((resolve) => closed.listen(0, '127.0.0.1', resolve));
    const address = closed.address();
    const port = typeof address === 'object' && address !== null ? address.port : 0;
    await new Promise<void>((resolve) => closed.close(() => resolve()));
    let started = 0;
    const counting = {
      startFakePlayout: (options: FakePlayoutOptions) => {
        started += 1;
        return startFakePlayout(options);
      },
    };
    await expect(startLocalCasparStation(counting, { host: '127.0.0.1', port })).rejects.toThrow(
      new RegExp(
        `^Nothing answers AMCP on 127\\.0\\.0\\.1:${String(port)} \\(ECONNREFUSED\\) — start CasparCG, then run the command again\\.$`,
      ),
    );
    expect(started).toBe(0);
  });

  it('something that is not CasparCG on the port is refused in ONE line', async () => {
    const other = net.createServer((socket) => {
      socket.on('data', () => socket.write('HTTP/1.1 400 Bad Request\r\n\r\n'));
    });
    servers.push(other);
    await new Promise<void>((resolve) => other.listen(0, '127.0.0.1', resolve));
    const address = other.address();
    const port = typeof address === 'object' && address !== null ? address.port : 0;
    await expect(startLocalCasparStation(MODULES, { host: '127.0.0.1', port })).rejects.toThrow(
      `127.0.0.1:${String(port)} did not answer VERSION as CasparCG does (answered 0) — is CasparCG what listens there?`,
    );
  });
});
