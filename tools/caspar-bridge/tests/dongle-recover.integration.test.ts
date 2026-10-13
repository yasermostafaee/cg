import * as dgram from 'node:dgram';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createMock,
  defaultHandlers,
  parseAmcpLine,
  type AmcpHandler,
  type MockHandle,
} from '@cg/amcp-mock';
import { AmcpTransport, CommandQueue, DEFAULT_LAYER_POLICY } from '@cg/caspar-client';
import {
  CG_UNLICENSED_CODE,
  fixedBanksSlots,
  mediaSourceId,
  type ConnectionConfig,
  type FixedLayerBank,
  type SourceAssignments,
  type TemplateInfo,
} from '@cg/shared-ipc';
import { isOnAirStatus, ownsLiveSeats } from '@cg/shared-schema';
import { CasparRuntime } from '../src/caspar-runtime.js';
import { validateFixedBank } from '../src/fixed-layers-store.js';
import { PlayoutSources } from '../src/playout-sources.js';
import type { FakeMediaItem } from './support/fake-playout.js';
import { awaitChannelModeRead, HEALTH_MS } from './support/harness.js';
import { LocalPlayoutSources } from './support/local-playout-sources.js';
import { recvLines } from './support/wire-trace.js';

/**
 * 🔴 `DONGLE-RECOVER-01` — **AFTER THE PLAYOUT'S DONGLE DROPS AND COMES BACK.**
 *
 * The owner pulled the Playout's licence dongle on `.32` (Playout `2.9.8`, CG Bridge `0.11.4`) and put it
 * back. The Playout's own license rule cleared the channel (`CLEAR <channel>`, LICENSE §4) while he waited,
 * and when it came back his first Play of a STOPPED multi-frame row sent, at `2026-10-11T06:37:24Z`:
 *
 *     CG 1-59 UPDATE 0 {"__cg":{"take":…,"look":"look-2"}}   << 403 CG UPDATE FAILED   (no CG ADD)
 *     PLAY 1-60 "…mp4" LOOP / PLAY 1-61 "…mpg" LOOP            << 202
 *     CG 1-59 PLAY 0                                          << 202   (a layer with no page)
 *
 * — the plates with their inputs and no template behind them. This file scripts that timeline on the AMCP
 * mock, with a second raw AMCP client in the Playout's place, for each kind of row the owner had:
 *
 * | Row | when the dongle is pulled |
 * | --- | --- |
 * | R1 | single graphic, ON AIR |
 * | R2 | single graphic, STOPPED (its page resident) |
 * | R3 | multi-frame, ON AIR |
 * | R4 | multi-frame, STOPPED (the owner's 59) |
 * | R5 | single graphic, LOADED and never taken |
 * | R6 | single graphic, STOPPED, its take REFUSED during the outage (the owner's 98) |
 *
 * ⚠ Measured, not assumed: a `load` sends NO `CG ADD` here (the row is a record until its take), so R5
 * has no page to lose and its take always ADDs — H1 cannot reach it. A STOP is what leaves a page
 * resident (C-012), so R2, R4 and R6 are the rows H1 is about.
 *
 * The license is the bridge's own take-time check (`useCgLicenseCheck` / `useUnlicensedCheck`, what
 * `createBridge` wires to its readers); WHEN the reader sees a change is `license-change-lines.test.ts`'s
 * and the cadence test's subject, not this file's.
 *
 * S1 — the Playout's window runs out: it stops and clears the channel. S2 — the dongle comes back INSIDE
 * the window: the license reads false and true again with NO outside clear, and NOTHING may happen to any
 * row (the owner's rule, 2026-10-11).
 *
 * Every capture is printed before it is asserted, so a red run is the record of what the wire did.
 */

let mocks: MockHandle[] = [];
let runtimes: CasparRuntime[] = [];
let readers: PlayoutSources[] = [];
let traces: string[] = [];

afterEach(async () => {
  for (const reader of readers) reader.dispose();
  readers = [];
  for (const r of runtimes) await r.stop();
  runtimes = [];
  for (const m of mocks) await m.stop();
  mocks = [];
  for (const t of traces) if (fs.existsSync(t)) fs.rmSync(t);
  traces = [];
});

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(cond: () => boolean, what: string, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!cond()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await delay(25);
  }
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

// ── The station: channel 2, beds 50–59, plates 60–79, templates 80–99 ──────────────────────────

const BANK: FixedLayerBank = { channel: 2, start: 80, count: 20, low: { start: 50, count: 10 } };
const BAND = { start: 60, end: 79 };

const CLIP_A: FakeMediaItem = {
  id: 'm-a',
  name: 'Clip A',
  clip: 'C:/Media/a.mp4',
  type: 'video',
  durationMs: 30_000,
  width: 1920,
  height: 1080,
  folder: 'Media',
  updatedAt: '2026-10-11T06:00:00Z',
};
const CLIP_B: FakeMediaItem = { ...CLIP_A, id: 'm-b', name: 'Clip B', clip: 'C:/Media/b.mpg' };
const MEDIA = [CLIP_A, CLIP_B];

const SCENE = { width: 1920, height: 1080 };
const LEFT = { x: 0, y: 0, width: 960, height: 1080 };
const RIGHT = { x: 960, y: 0, width: 960, height: 1080 };
const FULL = { x: 0, y: 0, width: 1920, height: 1080 };

function plate(id: string, rect: typeof FULL) {
  return { elementId: `el-${id}`, sourceId: id, rect, expectedAspect: 16 / 9, dynamic: false };
}

/** The owner's "چندقاب": two plates, two looks. */
const MULTI: TemplateInfo = {
  templateId: 'multi',
  templateType: 'custom',
  fields: [],
  liveSources: {
    resolution: SCENE,
    defaultPosition: { anchor: 'center', offset: { x: 0, y: 0 } },
    sources: [plate('l1', LEFT), plate('l2', RIGHT)],
    looks: [
      { id: 'look-1', name: 'one', entered: { mode: 'cut' }, rects: { l1: FULL } },
      { id: 'look-2', name: 'two', entered: { mode: 'cut' }, rects: { l1: LEFT, l2: RIGHT } },
    ],
    defaultLookId: 'look-2',
  },
};

/** A single graphic, no plates. */
const PAGE: TemplateInfo = { templateId: 'page', templateType: 'lower-third', fields: [] };

const ASSIGNMENTS: SourceAssignments = {
  assignments: [
    { templateId: 'multi', plateId: 'l1', sourceId: mediaSourceId(CLIP_A.id) },
    { templateId: 'multi', plateId: 'l2', sourceId: mediaSourceId(CLIP_B.id) },
  ],
};

type RowKey = 'R1' | 'R2' | 'R3' | 'R4' | 'R5' | 'R6';
const ROWS: Record<RowKey, { readonly id: string; readonly layer: number; readonly t: string }> = {
  R1: { id: 'r1-on-air', layer: 99, t: 'page' },
  R2: { id: 'r2-stopped', layer: 98, t: 'page' },
  R3: { id: 'r3-multi-on-air', layer: 59, t: 'multi' },
  R4: { id: 'r4-multi-stopped', layer: 58, t: 'multi' },
  R5: { id: 'r5-loaded', layer: 97, t: 'page' },
  R6: { id: 'r6-refused', layer: 96, t: 'page' },
};
const slotOf = (key: RowKey) => ({ channel: 2, layer: ROWS[key].layer });

/** The Playout's own message for a missing dongle, as `.32` sent it. */
const MISSING = 'دانگلِ لایسنسِ Playout خوانده نمی‌شود.';

interface Rig {
  readonly r: CasparRuntime;
  readonly mock: MockHandle;
  readonly isLoaded: (itemId: string) => boolean;
  /** What the bridge's license reader holds: the Playout's message while unlicensed, else `null`. */
  readonly license: { reason: string | null; d4Unlicensed: boolean };
  mark(): Promise<number>;
  sentSince(from: number): Promise<string[]>;
}

async function boot(): Promise<Rig> {
  const provider = new LocalPlayoutSources({ media: MEDIA });
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
  for (const m of MEDIA)
    expect(await sources.ensureBound(mediaSourceId(m.id))).toEqual({ ok: true });

  const oscPort = await freeUdpPort();
  const trace = path.join(
    os.tmpdir(),
    `cg-dongle-${String(process.pid)}-${String(Date.now())}-${String(Math.round(performance.now() * 1000))}.ndjson`,
  );
  traces.push(trace);
  const mock = await createMock({
    amcpPort: 0,
    oscPort,
    oscHost: '127.0.0.1',
    oscHz: 40,
    channels: 2,
    tracePath: trace,
  });
  mocks.push(mock);
  const config: ConnectionConfig = {
    servers: { A: { host: '127.0.0.1', amcpPort: mock.amcpPort, oscPort } },
    strategy: 'mirror-sync',
    autoFailoverEnabled: false,
  };
  let isLoaded: (itemId: string) => boolean = () => {
    throw new Error('the runtime did not hand over its #loaded read');
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
      sourceAssignments: ASSIGNMENTS,
      loadedForTest: (read) => {
        isLoaded = read;
      },
    },
  );
  runtimes.push(r);
  sources.onCatalogChanged((catalog) => r.setResolvedSourceCatalog(catalog));
  const license: Rig['license'] = { reason: null, d4Unlicensed: false };
  r.useCgLicenseCheck(() => license.reason);
  r.useUnlicensedCheck(() => license.d4Unlicensed);
  r.start();
  await r.startServing();
  for (const t of [MULTI, PAGE]) {
    r.templateImport(t, `<!doctype html><html><body>${t.templateId}</body></html>`);
  }
  await r.whenServerHealthy(HEALTH_MS);
  await awaitChannelModeRead(r);
  // R-022's boot blanket rides `normal` priority — wait for all of it, so no straggler lands in a window.
  const blanket = fixedBanksSlots([BANK]).map(
    (s) => `MIXER ${String(s.channel)}-${String(s.layer)} VOLUME 1`,
  );
  const linesOf = async (): Promise<string[]> => {
    await mock.traceFlush();
    return recvLines(trace);
  };
  const by = Date.now() + 10_000;
  for (;;) {
    const seen = new Set(await linesOf());
    if (blanket.every((l) => seen.has(l))) break;
    if (Date.now() > by) throw new Error('timed out waiting for the boot volume blanket');
    await delay(25);
  }
  return {
    r,
    mock,
    isLoaded: (itemId) => isLoaded(itemId),
    license,
    mark: async () => (await linesOf()).length,
    sentSince: async (from) => (await linesOf()).slice(from),
  };
}

/** The Playout — a second, raw AMCP client — sends one line. */
async function playoutSends(mock: MockHandle, line: string): Promise<void> {
  const transport = new AmcpTransport();
  await transport.connect(mock.host, mock.amcpPort);
  const queue = new CommandQueue(transport);
  try {
    await queue.enqueue(line);
  } finally {
    queue.dispose();
    transport.destroy();
  }
}

const itemOf = (r: CasparRuntime, key: RowKey) =>
  r.stackSnapshot().find((i) => i.itemId === ROWS[key].id);
const onAir = (r: CasparRuntime, key: RowKey): boolean => {
  const item = itemOf(r, key);
  return item !== undefined && isOnAirStatus(item);
};

/** Load a row on its fixed slot (a `CG ADD`, play-on-load off — its page is resident from here). */
async function load(r: CasparRuntime, key: RowKey): Promise<void> {
  const row = ROWS[key];
  expect(await r.loadFixed(slotOf(key), row.id, row.t, {})).toEqual({ accepted: true });
}

/** Set the six rows up as the table says, and let OSC hear every layer. */
async function sixRows(rig: Rig): Promise<void> {
  const { r } = rig;
  for (const key of ['R1', 'R2', 'R3', 'R4', 'R5', 'R6'] as const) await load(r, key);
  // R4 first: one multi-box row on air per channel (§12.6), so it is taken and stopped before R3.
  // R2 and R6 are taken and stopped too: a stop leaves the page RESIDENT (C-012).
  for (const key of ['R4', 'R2', 'R6'] as const) {
    expect(await r.take(ROWS[key].id)).toEqual({ accepted: true });
    await waitFor(() => onAir(r, key), `${key} on air`);
    expect(await r.stopItem(ROWS[key].id)).toEqual({ accepted: true });
  }
  await waitFor(
    () => !onAir(r, 'R2') && !onAir(r, 'R4') && !onAir(r, 'R6'),
    'R2, R4 and R6 stopped',
  );
  expect(await r.take(ROWS.R1.id)).toEqual({ accepted: true });
  expect(await r.take(ROWS.R3.id)).toEqual({ accepted: true });
  await waitFor(() => onAir(r, 'R1') && onAir(r, 'R3'), 'R1 and R3 on air');
  // The silence question needs every layer HEARD first.
  await delay(400);
}

interface RowCapture {
  readonly status: string | undefined;
  readonly pending: boolean | undefined;
  readonly errorCode: string | undefined;
  readonly refusal: string | undefined;
  /** `isOnAirStatus` — the one predicate. */
  readonly onAir: boolean;
  readonly loaded: boolean;
  readonly seats: number;
  readonly playGate: 'disabled' | 'enabled';
  readonly page: string;
}

function captureRow(rig: Rig, key: RowKey): RowCapture {
  const item = itemOf(rig.r, key);
  const seats = rig.r.liveLayers().get(ROWS[key].id)?.length ?? 0;
  const layer = rig.mock.layerState(slotOf(key));
  return {
    status: item?.status,
    pending: item?.pending,
    errorCode: item?.errorCode,
    refusal: item?.takeRefusal?.code,
    onAir: item !== undefined && isOnAirStatus(item),
    loaded: rig.isLoaded(ROWS[key].id),
    seats,
    playGate: ownsLiveSeats(item, seats > 0) ? 'disabled' : 'enabled',
    page:
      layer === undefined || !layer.onStage
        ? 'no page'
        : `${layer.producer}${layer.onAir ? ' on air' : ' resident'}`,
  };
}

function captureAll(rig: Rig, when: string): Record<string, RowCapture> {
  const out = Object.fromEntries(
    (Object.keys(ROWS) as RowKey[]).map((key) => [key, captureRow(rig, key)]),
  );
  process.stdout.write(`\n[DONGLE-RECOVER-01] ${when}\n${JSON.stringify(out, null, 1)}\n`);
  return out;
}

/** The lines a Play sent, the page layer's and the plates' — every channel-2 producer or CG line. */
const takeLines = (lines: readonly string[]): string[] =>
  lines.filter((l) => /^(CG 2-|PLAY 2-|LOADBG 2-|CLEAR 2-)/.test(l));

async function play(
  rig: Rig,
  key: RowKey,
): Promise<{ verdict: unknown; wire: string[]; after: RowCapture }> {
  const from = await rig.mark();
  const verdict = await rig.r.take(ROWS[key].id);
  await delay(50);
  const wire = takeLines(await rig.sentSince(from));
  const after = captureRow(rig, key);
  process.stdout.write(
    `\n[DONGLE-RECOVER-01] Play ${key} → ${JSON.stringify(verdict)}\n  ${wire.join('\n  ')}\n  ${JSON.stringify(after)}\n`,
  );
  return { verdict, wire, after };
}

const hasAdd = (wire: readonly string[], key: RowKey): boolean =>
  wire.some((l) => l.startsWith(`CG 2-${String(ROWS[key].layer)} ADD `));

describe('DONGLE-RECOVER-01 S1 — the Playout’s window runs out: it clears the channel', () => {
  it('🔴 after the outside CLEAR, a STOPPED, a LOADED and a REFUSED row re-ADD on the next Play — the page is on air; no banner for a row that was not on air; the repair sends nothing', async () => {
    const rig = await boot();
    const { r, mock } = rig;
    await sixRows(rig);
    captureAll(rig, 'before the dongle is pulled');

    // The dongle is pulled; the bridge's next license read holds `licensed:false`. D4's `playlist` said
    // nothing on `.32` (no "cleared outside" line there named D4), so the CG license refuses alone.
    rig.license.reason = MISSING;
    const refused = await play(rig, 'R6');
    expect(refused.verdict).toMatchObject({ accepted: false, errorCode: CG_UNLICENSED_CODE });
    expect(refused.wire, 'a refused take sends nothing').toEqual([]);

    // The window runs out: the Playout clears the whole channel.
    const beforeClear = await rig.mark();
    await playoutSends(mock, 'CLEAR 2');
    await waitFor(
      () => !onAir(r, 'R1') && !onAir(r, 'R3'),
      'the on-air rows found cleared (B-292)',
      5_000,
    );
    await delay(1_500);
    const afterClear = captureAll(rig, 'after the Playout’s CLEAR 2, dongle still out');
    // The trace is every line the core RECEIVED: the Playout's own `CLEAR 2` is in it (the bridge's guard
    // can never send a whole-channel CLEAR, so that line is the other client's).
    const repairLines = (await rig.sentSince(beforeClear)).filter(
      (l) => !/^INFO\b/.test(l) && l !== 'CLEAR 2',
    );
    process.stdout.write(
      `\n[DONGLE-RECOVER-01] sent after the CLEAR: ${JSON.stringify(repairLines)}\n`,
    );
    expect(repairLines, 'finding layers gone sends nothing but INFO reads').toEqual([]);
    // The silence question watches what is held ON AIR, so the stopped rows' pages are still BELIEVED
    // resident here: the take's own tell is what finds them gone (the core's 403), at the Play.
    for (const key of ['R2', 'R4', 'R6'] as const) {
      expect(afterClear[key]?.loaded, `${key} believed resident until its take`).toBe(true);
      expect(afterClear[key]?.page, `${key}'s page is gone from the core`).toBe('no page');
    }
    const banner = r
      .clearedOutside()
      .map((e) => e.layer)
      .sort((a, b) => a - b);
    process.stdout.write(
      `\n[DONGLE-RECOVER-01] cleared-outside banner: ${JSON.stringify(banner)}\n`,
    );
    // The banner names what LEFT AIR — R1's and R3's page and plates — and nothing that was not on air.
    expect(banner).toContain(ROWS.R1.layer);
    expect(banner).toContain(ROWS.R3.layer);
    for (const key of ['R2', 'R4', 'R5', 'R6'] as const) {
      expect(banner, `${key} was not on air: no banner`).not.toContain(ROWS[key].layer);
    }

    // (a) the dongle is back at the Playout, but the bridge has not read it yet: still refused.
    const early = await play(rig, 'R2');
    expect(early.verdict).toMatchObject({ accepted: false, errorCode: CG_UNLICENSED_CODE });

    // (b) the bridge's next read: licensed. Play on every row that was not on air.
    rig.license.reason = null;
    const results: Partial<Record<RowKey, Awaited<ReturnType<typeof play>>>> = {};
    for (const key of ['R2', 'R4', 'R5', 'R6', 'R1'] as const) results[key] = await play(rig, key);
    await delay(1_200);
    const after = captureAll(rig, 'after Play on every row (licensed again)');

    for (const key of ['R2', 'R4', 'R5', 'R6'] as const) {
      expect(results[key]?.verdict, key).toMatchObject({ accepted: true });
      expect(hasAdd(results[key]?.wire ?? [], key), `${key} ADDs its page`).toBe(true);
      expect(after[key]?.page, `${key}'s page is on air`).toBe('html on air');
      expect(after[key]?.onAir, `${key} reads on air`).toBe(true);
      // The ADD comes before the row's CG PLAY: never a CG PLAY on the emptied layer.
      const wire = results[key]?.wire ?? [];
      const layer = String(ROWS[key].layer);
      expect(wire.findIndex((l) => l.startsWith(`CG 2-${layer} ADD `))).toBeLessThan(
        wire.indexOf(`CG 2-${layer} PLAY 0`),
      );
    }
    // R1 was on air and was found cleared: B-292's re-ADD, unchanged.
    expect(hasAdd(results.R1?.wire ?? [], 'R1')).toBe(true);
    // R4's ADD carries the recorded look, before its plates and its CG PLAY; its plates are seated.
    const r4 = results.R4?.wire ?? [];
    const add = r4.findIndex((l) => l.startsWith('CG 2-58 ADD '));
    const cgPlay = r4.findIndex((l) => l === 'CG 2-58 PLAY 0');
    const plates = r4.findIndex((l) => l.startsWith('PLAY 2-'));
    expect(r4[add]).toContain('look-2');
    expect(add).toBeLessThan(plates);
    expect(plates).toBeLessThan(cgPlay);
    expect(after.R4?.seats).toBe(2);
    // And nothing that was not on air when the Playout cleared has been named "cleared outside" since:
    // a take that lands its page leaves no silence to misread.
    const bannerAfter = r.clearedOutside().map((e) => e.layer);
    for (const key of ['R2', 'R4', 'R6'] as const) {
      expect(bannerAfter, `${key}: no banner after its take`).not.toContain(ROWS[key].layer);
    }
  });

  it('🔴 the owner’s 06:37:24Z capture, replayed: a stopped multi-frame row, the Playout’s CLEAR, then Play — the ADD route, not a CG UPDATE answered 403 and a CG PLAY on nothing', async () => {
    const rig = await boot();
    const { r, mock } = rig;
    await load(r, 'R4');
    expect(await r.take(ROWS.R4.id)).toEqual({ accepted: true });
    await waitFor(() => onAir(r, 'R4'), 'R4 on air');
    expect(await r.stopItem(ROWS.R4.id)).toEqual({ accepted: true });
    await delay(400);
    await playoutSends(mock, 'CLEAR 2');
    await delay(1_500);
    const { verdict, wire } = await play(rig, 'R4');
    // Today's wire (red): `CG 2-58 UPDATE … << 403`, the plates' PLAYs, `CG 2-58 PLAY 0` — no ADD.
    // The take is NOT refused: the core's 403 on the resident route's tell says the page is gone, so
    // the same take sends what it sends for a row with no resident page — the ADD route.
    expect(verdict).toEqual({ accepted: true });
    const page = wire.filter((l) => l.startsWith('CG 2-58 '));
    expect(page.map((l) => l.split(' ').slice(0, 3).join(' '))).toEqual([
      'CG 2-58 UPDATE',
      'CG 2-58 ADD',
      'CG 2-58 PLAY',
    ]);
    expect(page[1]).toContain('look-2');
    const plates = wire.filter((l) => l.startsWith('PLAY 2-'));
    expect(plates).toHaveLength(2);
    expect(wire.indexOf(page[1] ?? '')).toBeLessThan(wire.indexOf(plates[0] ?? ''));
    await waitFor(() => mock.layerState(slotOf('R4'))?.onAir === true, 'the page on air', 3_000);
    expect(onAir(r, 'R4')).toBe(true);
  });

  it('🔴 the resident route stays: a STOPPED row whose page was NOT wiped takes with one CG UPDATE and CG PLAY, no ADD', async () => {
    const rig = await boot();
    const { r, mock } = rig;
    await load(r, 'R4');
    expect(await r.take(ROWS.R4.id)).toEqual({ accepted: true });
    await waitFor(() => onAir(r, 'R4'), 'R4 on air');
    expect(await r.stopItem(ROWS.R4.id)).toEqual({ accepted: true });
    await delay(400);
    const { verdict, wire } = await play(rig, 'R4');
    expect(verdict).toEqual({ accepted: true });
    expect(wire.filter((l) => l.startsWith('CG 2-58 ')).map((l) => l.split(' ')[2])).toEqual([
      'UPDATE',
      'PLAY',
    ]);
    await waitFor(() => mock.layerState(slotOf('R4'))?.onAir === true, 'the page on air', 3_000);
  });
});

/*
  🔴 THE OWNER'S RULE (2026-10-11): back inside the Playout's window, NOTHING happens — to air, to the
  bridge's belief about any page, or to a ledger seat — beyond refusing a take while the license itself
  read `false`. And with the license reading `true` throughout, nothing is refused at all.
*/
describe('DONGLE-RECOVER-01 S2 — the dongle comes back inside the window: no outside CLEAR', () => {
  it('🔴 license false then true with no CLEAR: no row leaves air, no page is forgotten, no seat dropped, no banner — then the stopped and loaded rows take by the resident route, exactly as before', async () => {
    const rig = await boot();
    const { r } = rig;
    await sixRows(rig);
    const before = captureAll(rig, 'S2 before');
    const seatsBefore = new Map([...r.liveLayers()].map(([k, v]) => [k, v.length]));

    rig.license.reason = MISSING;
    const refused = await play(rig, 'R6');
    expect(refused.verdict).toMatchObject({ accepted: false, errorCode: CG_UNLICENSED_CODE });
    await delay(1_500);
    rig.license.reason = null;
    await delay(1_500);

    const back = captureAll(rig, 'S2 after the window, nothing cleared');
    // On air is judged by the ONE predicate: a status decays `on-air` → `playing` by itself.
    const air = (c: RowCapture | undefined) =>
      c === undefined
        ? undefined
        : {
            onAir: c.onAir,
            loaded: c.loaded,
            seats: c.seats,
            playGate: c.playGate,
            page: c.page,
          };
    for (const key of Object.keys(ROWS) as RowKey[]) {
      // R6's own refusal line is the one change, and it is the license's (it read `false`).
      expect(air(back[key]), key).toEqual(air(before[key]));
    }
    expect(new Map([...r.liveLayers()].map(([k, v]) => [k, v.length]))).toEqual(seatsBefore);
    expect(r.clearedOutside()).toEqual([]);
    expect(r.emptiedAir()).toBeNull();

    // The resident route, unchanged: one CG UPDATE (the take tell) and CG PLAY, no ADD.
    for (const key of ['R2', 'R6'] as const) {
      const { verdict, wire } = await play(rig, key);
      expect(verdict, key).toMatchObject({ accepted: true });
      expect(hasAdd(wire, key), `${key} takes its resident page`).toBe(false);
      const layer = ROWS[key].layer;
      expect(wire.filter((l) => l.startsWith(`CG 2-${String(layer)} `))).toEqual([
        expect.stringMatching(new RegExp(`^CG 2-${String(layer)} UPDATE 0 `)),
        `CG 2-${String(layer)} PLAY 0`,
      ]);
    }
    // R5 never had a page (a load sends no ADD), so its take ADDs exactly as it did before the window.
    const r5 = await play(rig, 'R5');
    expect(r5.verdict).toMatchObject({ accepted: true });
    expect(hasAdd(r5.wire, 'R5')).toBe(true);
  });

  it('🔴 the license reads TRUE throughout the window: the bridge refuses nothing', async () => {
    const rig = await boot();
    const { r } = rig;
    await load(r, 'R5');
    await load(r, 'R2');
    // Inside the Playout's window, its endpoint still says licensed: a take is a take.
    const { verdict } = await play(rig, 'R5');
    expect(verdict).toMatchObject({ accepted: true });
    expect(await r.take(ROWS.R2.id)).toEqual({ accepted: true });
    expect(r.clearedOutside()).toEqual([]);
  });
});

/*
  H4 — a CLEAR landing INSIDE a take: after the pre-roll ADD and the plates, before the `CG PLAY`. The
  Playout's CLEAR is theirs; this measures what the bridge then believes, and whether the row can leave
  the state it is left in (H2: a layer never heard cannot fall silent).
*/
describe('DONGLE-RECOVER-01 H4/H2 — a CLEAR inside a take', () => {
  it('measures: the row a mid-take CLEAR leaves, and whether its PLAY gate has a reachable exit', async () => {
    const rig = await boot();
    const { r, mock } = rig;
    const builtIn = defaultHandlers();
    const cg = builtIn.get('CG') as AmcpHandler;
    const clear = builtIn.get('CLEAR') as AmcpHandler;
    const playoutClear = parseAmcpLine('CLEAR 2');
    if (playoutClear === null) throw new Error('the mock cannot parse CLEAR 2');
    let armed = true;
    mock.setHandler('CG', (req, ctx, conn) => {
      if (armed && req.raw === `CG 2-${String(ROWS.R5.layer)} PLAY 0`) {
        armed = false;
        void clear(playoutClear, ctx, conn);
      }
      return cg(req, ctx, conn);
    });
    await load(r, 'R5');
    const { verdict, wire } = await play(rig, 'R5');
    expect(verdict).toMatchObject({ accepted: true });
    expect(armed, 'the CLEAR landed between the pre-roll and the CG PLAY').toBe(false);
    expect(wire.at(-1)).toBe(`CG 2-${String(ROWS.R5.layer)} PLAY 0`);
    await delay(4_000);
    const after = captureRow(rig, 'R5');
    process.stdout.write(`\n[DONGLE-RECOVER-01] H4 — 4 s after: ${JSON.stringify(after)}\n`);
    expect(after.page).toBe('no page');
    // The exit: the row's CLEAR is always offered (`B-122`) and lands.
    const out = await r.out(ROWS.R5.id);
    expect(out).toMatchObject({ accepted: true });
    await waitFor(() => !onAir(r, 'R5'), 'the row off air after its CLEAR', 3_000);
    expect(captureRow(rig, 'R5').playGate).toBe('enabled');
  });
});
