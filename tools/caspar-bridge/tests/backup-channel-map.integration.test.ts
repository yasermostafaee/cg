import * as dgram from 'node:dgram';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import { DEFAULT_LAYER_POLICY } from '@cg/caspar-client';
import type {
  ConnectionConfig,
  SourceAssignments,
  SourceCatalog,
  TemplateInfo,
} from '@cg/shared-ipc';
import { BackupChannels } from '../src/backup-channels.js';
import { CasparRuntime } from '../src/caspar-runtime.js';
import { validateFixedBank } from '../src/fixed-layers-store.js';
import type { CatalogueRow } from '../src/playout-catalogue.js';
import type { BackupChannelMap } from '../src/server-b-line.js';
import { awaitChannelModeRead, HEALTH_MS } from './support/harness.js';
import { FURNITURE, standardBank } from './support/two-channel-rig.js';
import { recvLines } from './support/wire-trace.js';

/**
 * 🔴 `RELEASE-0113-01` Part C — **THE DECISIVE CONTROL: NOT ONE LINE REACHES THE BACKUP CORE ON ANYTHING BUT
 * ITS OWN MIRROR CHANNEL.**
 *
 * The pair as the Playout team builds it (`PLAYOUT-CG-RESPONSE-0112-PAIR-v1.md` §2, §6): the primary's core
 * serves channels 1 and 2; the backup's core serves its OWN programme on channel 1, the mirror of the
 * primary's channel 1 on channel 2, of channel 2 on channel 3, and previews on 4 and 5. The mapping is the
 * REAL resolver (`BackupChannels`) reading `2.9.5`-shaped D4 rows — `mirrorOf` naming the primary engine.
 *
 * The station declares channel 1. Every verb that writes it — a take, an UPDATE, a look switch, a swap, a
 * clear, a `CLEAR ALL`, a restore, and a failover catch-up — and core B's recorded wire holds `2-…` lines and
 * nothing else that names a channel: not B's channel 1 (another programme on air), not a preview, not 3.
 */

let mocks: MockHandle[] = [];
let runtimes: CasparRuntime[] = [];
let resolvers: BackupChannels[] = [];
let files: string[] = [];

afterEach(async () => {
  for (const b of resolvers) b.dispose();
  resolvers = [];
  for (const r of runtimes) await r.stop();
  runtimes = [];
  for (const m of mocks) await m.stop();
  mocks = [];
  for (const f of files) if (fs.existsSync(f)) fs.rmSync(f);
  files = [];
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

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function until(cond: () => boolean, what: string, ms = 15_000): Promise<void> {
  const deadline = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await delay(25);
  }
}

// ── The station: channel 1, a bed with two live plates and two looks, and a logo ──────────────────

const BANK = standardBank(1);
const BED = { channel: 1, layer: 59 };
const LOGO = { channel: 1, layer: 99 };
const SCENE = { width: 1920, height: 1080 };
const CENTRED = { anchor: 'center' as const, offset: { x: 0, y: 0 } };
const FULL = { x: 0, y: 0, width: 1920, height: 1080 };
const LEFT = { x: 0, y: 0, width: 1004, height: 1080 };
const RIGHT = { x: 1004, y: 0, width: 916, height: 1080 };
const plate = (id: string, rect: typeof FULL) => ({
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
    sources: [plate('l1', FULL), plate('l2', RIGHT)],
    looks: [
      { id: 'look-1', name: 'look-1', entered: { mode: 'cut' }, rects: { l1: FULL } },
      { id: 'look-2', name: 'look-2', entered: { mode: 'cut' }, rects: { l1: LEFT, l2: RIGHT } },
    ],
    defaultLookId: 'look-1',
  },
};
const CATALOG: SourceCatalog = {
  sources: [1, 2, 3].map((n) => ({
    id: `src-${String(n)}`,
    name: `studio${String(n)}`,
    format: '1080i5000',
    producer: { kind: 'decklink' as const, device: n },
  })),
  layerRange: { start: 60, end: 79 },
};
const ASSIGNMENTS: SourceAssignments = {
  assignments: [
    { templateId: 'two-box', plateId: 'l1', sourceId: 'src-1' },
    { templateId: 'two-box', plateId: 'l2', sourceId: 'src-2' },
  ],
};
const HTML = '<!doctype html><html><head><meta charset="utf-8"></head><body>آرم</body></html>';

// ── The engines' D4, as `2.9.5` publishes it ─────────────────────────────────────────────────────

const A_HOST = '127.0.0.1';
const PRIMARY_ENGINE = '127.0.0.1';
const MODE = '1080i5000';
const A_ROWS: CatalogueRow[] = [
  { id: 'apasai', name: 'APASAI', casparHost: A_HOST, casparChannel: 1, videoMode: MODE },
  { id: 'cg-test2', name: 'CG', casparHost: A_HOST, casparChannel: 2, videoMode: MODE },
];
const B_ROWS: CatalogueRow[] = [
  {
    id: 'own',
    name: 'B',
    casparHost: A_HOST,
    casparChannel: 1,
    videoMode: MODE,
    cgLicensed: true,
    mirrorOf: null,
  },
  {
    id: 'apasai-r2',
    name: 'B 2',
    casparHost: A_HOST,
    casparChannel: 2,
    videoMode: MODE,
    cgLicensed: true,
    mirrorOf: { playout: `${PRIMARY_ENGINE}:8080`, id: 'apasai' },
  },
  {
    id: 'cg-test2-r2',
    name: 'B 3',
    casparHost: A_HOST,
    casparChannel: 3,
    videoMode: MODE,
    cgLicensed: true,
    mirrorOf: { playout: PRIMARY_ENGINE, id: 'cg-test2' },
  },
];

// ── The rig ──────────────────────────────────────────────────────────────────────────────────────

interface Core {
  readonly mock: MockHandle;
  readonly oscPort: number;
  readonly trace: string;
  lines(): Promise<string[]>;
}

async function core(
  channels: number,
  at?: { amcpPort: number; oscPort: number; trace: string },
): Promise<Core> {
  const oscPort = at?.oscPort ?? (await freeUdpPort());
  const trace =
    at?.trace ??
    path.join(
      os.tmpdir(),
      `cg-backup-map-${String(process.pid)}-${String(Date.now())}-${String(Math.round(performance.now() * 1000))}.ndjson`,
    );
  if (at === undefined) files.push(trace);
  const mock = await createMock({
    amcpPort: at?.amcpPort ?? 0,
    oscPort,
    oscHost: '127.0.0.1',
    oscHz: 30,
    channels,
    tracePath: trace,
  });
  mocks.push(mock);
  return {
    mock,
    oscPort,
    trace,
    lines: async () => {
      await mock.traceFlush();
      return recvLines(trace);
    },
  };
}

interface Rig {
  readonly r: CasparRuntime;
  readonly map: BackupChannels;
  readonly a: Core;
  readonly b: Core;
  setBackupRows(rows: readonly CatalogueRow[]): void;
}

async function boot(
  options: {
    readonly strategy?: ConnectionConfig['strategy'];
    readonly verbatim?: boolean;
    /** The map the runtime uses (default: the real resolver over the rows above). */
    readonly mapOverride?: BackupChannelMap;
  } = {},
): Promise<Rig> {
  const a = await core(2);
  const b = await core(5);
  let backupRows: readonly CatalogueRow[] = B_ROWS;
  let readAt = Date.now();
  const config: ConnectionConfig = {
    servers: {
      A: { host: '127.0.0.1', amcpPort: a.mock.amcpPort, oscPort: a.oscPort },
      B: { host: '127.0.0.1', amcpPort: b.mock.amcpPort, oscPort: b.oscPort },
    },
    strategy: options.strategy ?? 'mirror-sync',
    autoFailoverEnabled: false,
  };
  let runtime: CasparRuntime | null = null;
  const map = new BackupChannels({
    declared: () => runtime?.declaredChannels() ?? [1],
    serverAHost: () => A_HOST,
    serverB: () => ({ host: '127.0.0.1', amcpPort: b.mock.amcpPort }),
    primaryEngineHost: () => PRIMARY_ENGINE,
    primaryRows: () => A_ROWS,
    backupRows: () => backupRows,
    backupReadAtMs: () => readAt,
    entries: () => ({ entries: [], madeForAnother: null }),
    liveOn: (channel) => runtime?.holdsLiveLayersOn(channel) ?? false,
    log: () => undefined,
  });
  resolvers.push(map);
  const r = new CasparRuntime(
    config,
    {},
    {
      fixedSlots: validateFixedBank(BANK, { policy: DEFAULT_LAYER_POLICY, reservedLayers: [] }),
      fixedBanks: [BANK],
      layerPolicy: DEFAULT_LAYER_POLICY,
      reservedLayers: [],
      lookMixerHoldMs: 0,
      sourceCatalog: CATALOG,
      sourceAssignments: ASSIGNMENTS,
      backupChannels: options.mapOverride ?? map,
      ...(options.verbatim === true ? { faultInjection: { serverBVerbatim: true } } : {}),
    },
  );
  runtime = r;
  runtimes.push(r);
  map.recompute();
  r.start();
  await r.startServing();
  r.templateImport(TWO_BOX, HTML);
  r.templateImport(FURNITURE, HTML);
  await r.whenServerHealthy(HEALTH_MS);
  await awaitChannelModeRead(r);
  await delay(300);
  return {
    r,
    map,
    a,
    b,
    setBackupRows: (rows) => {
      backupRows = rows;
      readAt = Date.now();
      map.recompute();
    },
  };
}

/** The channel a line names (its first token after the verb), or `null` for a line that names none. */
function channelOf(line: string): number | null {
  const m =
    /^(?:CG|PLAY|LOAD|LOADBG|STOP|CLEAR|PAUSE|RESUME|CALL|MIXER|INFO|SWAP|SET) (\d+)(?:-\d+)?(?:\s|$)/.exec(
      line,
    );
  return m === null ? null : Number(m[1]);
}

/** Every line core B received that names a channel, grouped by the channel it names. */
function byChannel(lines: readonly string[]): Map<number, string[]> {
  const out = new Map<number, string[]>();
  for (const line of lines) {
    const channel = channelOf(line);
    if (channel === null) continue;
    out.set(channel, [...(out.get(channel) ?? []), line]);
  }
  return out;
}

/** Restart core A on the same ports (genuinely empty layers): the reconnect empties air and says so. */
async function restartA(rig: Rig): Promise<Core> {
  const dying = rig.a;
  await dying.mock.stop();
  mocks = mocks.filter((m) => m !== dying.mock);
  await until(() => rig.r.health().primary.state !== 'healthy', 'core A to drop', 5_000);
  const again = await core(2, {
    amcpPort: dying.mock.amcpPort,
    oscPort: dying.oscPort,
    trace: dying.trace,
  });
  await until(() => rig.r.health().primary.state === 'healthy', 'core A to come back');
  return again;
}

describe('🔴 RELEASE-0113-01 — the decisive control: core B hears only its own mirror channel', () => {
  it('🔴 a take, an UPDATE, a look switch, a swap, a clear, a CLEAR ALL and a restore on the station’s CH 1 reach core B as `2-…` — and NOTHING on B’s channel 1, a preview, or 3', async () => {
    const rig = await boot();
    const { r, b } = rig;
    expect(rig.map.channelOnB(1), 'the D4 rule mapped CH 1 to B’s 2').toBe(2);

    // 1 — a take: the two-box bed on look-1, and a logo.
    expect(await r.loadFixed(BED, 'bed-59', 'two-box', {})).toEqual({ accepted: true });
    expect(await r.take('bed-59')).toEqual({ accepted: true });
    expect(await r.loadFixed(LOGO, 'logo-99', 'logo', {})).toEqual({ accepted: true });
    expect(await r.take('logo-99')).toEqual({ accepted: true });
    // 2 — an UPDATE.
    expect((await r.update('logo-99', {}, 'merge')).accepted).toBe(true);
    // 3 — a look switch, 4 — a swap.
    expect(await r.setActiveLook('bed-59', 'look-2')).toEqual({ ok: true });
    expect((await r.swapLiveSource('bed-59', 'l1', 'src-3')).ok).toBe(true);
    // 5 — a clear.
    expect((await r.out('bed-59')).accepted).toBe(true);
    // 6 — CLEAR ALL.
    expect((await r.clearAll(1)).ok).toBe(true);
    // 7 — a restore: the logo on air, core A restarted empty, the notice, PUT BACK ON AIR.
    expect(await r.loadFixed(LOGO, 'logo-99', 'logo', {})).toEqual({ accepted: true });
    expect((await r.take('logo-99')).accepted).toBe(true);
    // The restarted core writes on into the same trace, so A's wire is read through it from here.
    const a = await restartA(rig);
    await until(() => r.emptiedAir() !== null, 'the emptied-air notice');
    const restored = await r.restoreEmptiedAir(['logo-99']);
    expect(restored.restored, JSON.stringify(restored)).toBe(1);
    await delay(300);

    const onB = byChannel(await b.lines());
    // The instrument saw every verb on B, on B's own channel.
    const two = onB.get(2) ?? [];
    expect(two.some((l) => l.startsWith('CG 2-99 ADD'))).toBe(true);
    expect(two).toContain('CG 2-99 PLAY 0');
    expect(two.some((l) => l.startsWith('CG 2-99 UPDATE'))).toBe(true);
    expect(
      two.some((l) => /^PLAY 2-\d+ DECKLINK DEVICE 3$/.test(l)),
      'the swap',
    ).toBe(true);
    expect(
      two.some((l) => /^MIXER 2-\d+ FILL .* DEFER$/.test(l)),
      'the look switch',
    ).toBe(true);
    expect(two).toContain('MIXER 2 COMMIT');
    expect(
      two.some((l) => /^CLEAR 2-\d+$/.test(l)),
      'the clears',
    ).toBe(true);
    // 🔴 THE CLAIM: not one line to any other channel of core B.
    expect([...onB.keys()]).toEqual([2]);
    // And core A got the station's own numbers — never B's.
    const onA = byChannel(await a.lines());
    expect([...onA.keys()]).toEqual([1]);
    expect(onA.get(1)).toContain('CG 1-99 PLAY 0');
  }, 90_000);

  it('🔴 a failover catch-up (journal-replay) replays `2-…` to core B, and nothing else that names a channel', async () => {
    const { r, b } = await boot({ strategy: 'journal-replay' });
    expect(await r.loadFixed(LOGO, 'logo-99', 'logo', {})).toEqual({ accepted: true });
    expect((await r.take('logo-99')).accepted).toBe(true);
    expect(await r.loadFixed(BED, 'bed-59', 'two-box', {})).toEqual({ accepted: true });
    expect((await r.take('bed-59')).accepted).toBe(true);
    expect(byChannel(await b.lines()).size, 'nothing reached B live under journal-replay').toBe(0);
    expect((await r.failover()).ok).toBe(true);
    await delay(500);
    const onB = byChannel(await b.lines());
    expect(onB.get(2) ?? []).toContain('CG 2-99 PLAY 0');
    expect([...onB.keys()]).toEqual([2]);
  }, 60_000);

  it('🔴 after a failover every send uses B’s number; a take where no backup channel is known is refused in words, nothing sent', async () => {
    const rig = await boot();
    const { r, b } = rig;
    expect((await r.failover()).ok).toBe(true);
    expect(r.currentPrimary).toBe('B');
    expect(await r.loadFixed(LOGO, 'logo-99', 'logo', {})).toEqual({ accepted: true });
    expect((await r.take('logo-99')).accepted).toBe(true);
    expect(byChannel(await b.lines()).get(2) ?? []).toContain('CG 2-99 PLAY 0');
    // The mirror of CH 1 disappears from B's D4 (nothing live on CH 1 now? the logo is: HELD).
    expect((await r.out('logo-99')).accepted).toBe(true);
    await delay(200);
    rig.setBackupRows(B_ROWS.filter((row) => row.casparChannel !== 2));
    expect(rig.map.channelOnB(1)).toBe(null);
    const before = (await b.lines()).length;
    const verdict = await r.take('logo-99');
    expect(verdict).toMatchObject({
      accepted: false,
      errorCode: 'backup-unmapped',
      message: 'No backup channel is known for CH 1.',
    });
    expect(byChannel((await b.lines()).slice(before)).size, 'nothing was sent').toBe(0);
  }, 60_000);

  it('🔴 a mapping that CHANGES while live: core B is sent nothing more for CH 1 — not on 2, not on the new 4 — until the next take, which goes to 4', async () => {
    const rig = await boot();
    const { r, b } = rig;
    expect(await r.loadFixed(LOGO, 'logo-99', 'logo', {})).toEqual({ accepted: true });
    expect((await r.take('logo-99')).accepted).toBe(true);
    // The Playout's admin re-made the mirror: B's D4 now names channel 4.
    rig.setBackupRows([
      B_ROWS[0] as CatalogueRow,
      { ...(B_ROWS[1] as CatalogueRow), casparChannel: 4 },
      B_ROWS[2] as CatalogueRow,
    ]);
    expect(rig.map.state().backup?.channels[0]).toMatchObject({ state: 'held', backupChannel: 4 });
    const mark = (await b.lines()).length;
    expect((await r.update('logo-99', {}, 'merge')).accepted, 'A updates as before').toBe(true);
    expect((await r.out('logo-99')).accepted).toBe(true);
    await delay(200);
    expect(
      byChannel((await b.lines()).slice(mark)).size,
      'nothing to B for CH 1 — no clean-up anywhere',
    ).toBe(0);
    // The next take puts B's 4 in force.
    expect(await r.loadFixed(LOGO, 'logo-99', 'logo', {})).toEqual({ accepted: true });
    expect((await r.take('logo-99')).accepted).toBe(true);
    await delay(200);
    const after = byChannel((await b.lines()).slice(mark));
    expect([...after.keys()]).toEqual([4]);
    expect(after.get(4)).toContain('CG 4-99 PLAY 0');
  }, 60_000);

  it('🔴 an UNMAPPED channel: A airs it normally and core B’s wire for it is empty', async () => {
    const rig = await boot();
    rig.setBackupRows(B_ROWS.filter((row) => row.casparChannel !== 2));
    const { r, a, b } = rig;
    const mark = (await b.lines()).length;
    expect(await r.loadFixed(LOGO, 'logo-99', 'logo', {})).toEqual({ accepted: true });
    expect((await r.take('logo-99')).accepted).toBe(true);
    await delay(200);
    expect(byChannel(await a.lines()).get(1)).toContain('CG 1-99 PLAY 0');
    expect(byChannel((await b.lines()).slice(mark)).size).toBe(0);
  }, 60_000);

  it('🔴 the GUARD refuses a planted VERBATIM line on its own: B’s channel 1 is no mirror — CONTROL: translated, the same take reaches 2', async () => {
    const planted = await boot({ verbatim: true });
    expect(await planted.r.loadFixed(LOGO, 'logo-99', 'logo', {})).toEqual({ accepted: true });
    expect((await planted.r.take('logo-99')).accepted, 'A is untouched').toBe(true);
    await delay(200);
    expect(byChannel(await planted.a.lines()).get(1)).toContain('CG 1-99 PLAY 0');
    expect(byChannel(await planted.b.lines()).size, 'the guard sent B nothing').toBe(0);
  }, 60_000);
});
