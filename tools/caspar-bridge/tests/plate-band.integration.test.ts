import * as dgram from 'node:dgram';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import {
  fixedBanksSlots,
  inputSourceId,
  type ConnectionConfig,
  type ConsoleSourceCatalog,
  type FixedLayerBank,
  type LiveSourceLayerRange,
  type SourceAssignments,
  type TemplateInfo,
} from '@cg/shared-ipc';
import { CasparRuntime } from '../src/caspar-runtime.js';
import { createBridge, type BridgeHandle, type BridgeOptions } from '../src/index.js';
import { openClient, waitFor } from './support/auth-harness.js';
import { startFakePlayout, type FakePlayout } from './support/fake-playout.js';
import { awaitChannelModeRead, HEALTH_MS, track } from './support/harness.js';
import { LocalPlayoutSources } from './support/local-playout-sources.js';
import { standardBank } from './support/two-channel-rig.js';

/**
 * 🔴 `PLATE-BAND-01` (the owner, 2026-09-28) — **A STATION LINKED TO THE PLAYOUT SEATS ITS PLATES IN
 * 60–79 WITH NO HAND STEP, UNLESS ITS OWN CONFIG CLAIMS A LAYER THERE.**
 *
 * The owner took `Bed 59` on `dev:station --fake` and was refused: no band was declared, and the
 * design record said none would be filled in — for two reasons the owner has since answered. The
 * contract fixes a Playout-linked plant's layers (the Playout owns 1–49; CG Control owns 50–99, plates
 * 60–79), and a station whose reservation sits in 60–79 now simply gets no default rather than failing
 * to boot.
 *
 * Every station here is a REAL bridge (`createBridge`) with the link resolved the way a station
 * resolves it — `auth: 'playout'` naming the fake Playout — against the AMCP mock, and every claim
 * about a take is read OFF THE WIRE the mock received. The Playout's inputs come from the local
 * provider (the fake Playout's own list): `Studio 1` (NDI) and `Multicast` (a stream). Each refusal is
 * beside the control that shows the same rig seats when the one thing named is taken away.
 */

const CHANNEL = 2;
const ROW = 'bed-59';
const BED = { channel: CHANNEL, layer: 59 };
const SCENE = { width: 1920, height: 1080 };
const CENTRED = { anchor: 'center' as const, offset: { x: 0, y: 0 } };
const LEFT = { x: 0, y: 0, width: 960, height: 1080 };
const RIGHT = { x: 960, y: 0, width: 960, height: 1080 };
const HTML = '<!doctype html><html><head><meta charset="utf-8"></head><body>بستر</body></html>';

const STUDIO = inputSourceId('li-studio1');
const MULTICAST = inputSourceId('li-multicast');

function plate(id: string, rect: typeof LEFT) {
  return { elementId: `el-${id}`, sourceId: id, rect, expectedAspect: 16 / 9, dynamic: false };
}

/** The owner's case: a bed with two plates. */
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

/** Both plates bound on this station's channel — the Source defaults an operator set. */
const ASSIGNED: SourceAssignments = {
  assignments: [
    { channel: CHANNEL, templateId: TWO_BOX.templateId, plateId: 'l1', sourceId: STUDIO },
    { channel: CHANNEL, templateId: TWO_BOX.templateId, plateId: 'l2', sourceId: MULTICAST },
  ],
};

const DEFAULT_BAND = { range: { start: 60, end: 79 }, origin: 'default' };

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

interface Station {
  readonly handle: BridgeHandle;
  readonly mock: MockHandle;
  readonly playout: FakePlayout | null;
  /** The station's own config files, as a station keeps them. */
  readonly files: { readonly reserved: string; readonly catalog: string };
  /** Every AMCP line the mock received, in order. */
  lines(): Promise<string[]>;
}

/**
 * A station as a real one boots: its bank on channel 2 (rows 80–99, beds 50–59), its reservation and
 * its source-catalogue FILES (written first, as install config and a station-admin's Apply leave
 * them), and — when `linked` — the Playout named in its auth config.
 */
async function station(opts: {
  readonly linked: boolean;
  readonly reserved?: readonly { from: number; to: number }[];
  readonly declared?: LiveSourceLayerRange;
}): Promise<Station> {
  const dir = track(fs.mkdtempSync(path.join(os.tmpdir(), 'cg-plate-band-')), (d) => {
    fs.rmSync(d, { recursive: true, force: true });
  });
  const files = {
    reserved: path.join(dir, 'bridge-reserved-layers.json'),
    catalog: path.join(dir, 'bridge-source-catalog.json'),
  };
  if (opts.reserved !== undefined) {
    fs.writeFileSync(files.reserved, `${JSON.stringify({ ranges: opts.reserved })}\n`);
  }
  if (opts.declared !== undefined) {
    fs.writeFileSync(
      files.catalog,
      `${JSON.stringify({ sources: [], layerRange: opts.declared })}\n`,
    );
  }
  const oscPort = await freeUdpPort();
  const trace = path.join(dir, 'amcp.ndjson');
  const mock = track(
    await createMock({
      amcpPort: 0,
      oscPort,
      oscHost: '127.0.0.1',
      oscHz: 40,
      channels: 2,
      tracePath: trace,
    }),
    (m) => m.stop(),
  );
  const connection: ConnectionConfig = {
    servers: { A: { host: '127.0.0.1', amcpPort: mock.amcpPort, oscPort } },
    strategy: 'mirror-sync',
    autoFailoverEnabled: false,
  };
  const playout = opts.linked ? track(await startFakePlayout(), (p) => p.stop()) : null;
  const options: BridgeOptions = {
    port: 0,
    connection,
    fixedLayers: standardBank(CHANNEL),
    reservedLayersPath: files.reserved,
    sourceCatalogPath: files.catalog,
    sourceAssignments: ASSIGNED,
    playoutSources: new LocalPlayoutSources(),
    ...(playout !== null
      ? {
          playout: {
            auth: 'playout',
            issuer: playout.issuer,
            jwksUrl: playout.jwksUrl,
            tokenUrl: playout.tokenUrl,
            refreshUrl: playout.refreshUrl,
            revokedUrl: playout.revokedUrl,
          },
        }
      : {}),
  };
  const handle = track(await createBridge(options), (h) => h.close());
  const lines = async (): Promise<string[]> => {
    await mock.traceFlush();
    return fs
      .readFileSync(trace, 'utf-8')
      .split('\n')
      .filter((l) => l.length > 0)
      .map((l) => JSON.parse(l) as { dir: string; line: string })
      .filter((e) => e.dir === 'recv')
      .map((e) => e.line);
  };
  const r = handle.runtime;
  await r.whenServerHealthy(HEALTH_MS);
  await awaitChannelModeRead(r);
  r.templateImport(TWO_BOX, HTML);
  // The Playout's list (the local provider answers at once) — both inputs a plate is bound to.
  await waitFor(
    () => [STUDIO, MULTICAST].every((id) => r.sourceCatalog().sources.some((s) => s.id === id)),
    8000,
  );
  /*
    R-022's BOOT BLANKET — every declared row's `VOLUME 1`, at `normal` priority, may still be
    trickling out; a straggler would land inside a "nothing was sent" window below. Wait for all of
    them, through the enumeration the blanket itself walks.
  */
  const blanket = fixedBanksSlots([standardBank(CHANNEL)]).map(
    (s) => `MIXER ${String(s.channel)}-${String(s.layer)} VOLUME 1`,
  );
  const by = Date.now() + 10_000;
  for (;;) {
    const seen = new Set(await lines());
    if (blanket.every((l) => seen.has(l))) break;
    if (Date.now() > by) throw new Error('timed out waiting for the boot volume blanket');
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return { handle, mock, playout, files, lines };
}

/** The layer every plate producer was `PLAY`ed on, in wire order. */
function platePlays(lines: readonly string[]): number[] {
  return lines
    .map((l) => /^PLAY 2-(\d+) /.exec(l))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => Number(m[1]));
}

async function takeTheBed(s: Station): Promise<{
  verdict: Awaited<ReturnType<CasparRuntime['take']>>;
  sent: string[];
}> {
  const r = s.handle.runtime;
  expect(await r.loadFixed(BED, ROW, TWO_BOX.templateId, {})).toEqual({ accepted: true });
  const before = (await s.lines()).length;
  const verdict = await r.take(ROW);
  return { verdict, sent: (await s.lines()).slice(before) };
}

describe('PLATE-BAND-01 — a take of a two-plate template, by how the station is linked and configured', () => {
  it('🔴 linked, no band declared, nothing reserved in 60–79: both plates are seated in 60–79 — with no setup', async () => {
    const s = await station({ linked: true });
    expect(s.handle.runtime.plateBandInForce()).toEqual(DEFAULT_BAND);

    const { verdict, sent } = await takeTheBed(s);

    expect(verdict).toEqual({ accepted: true });
    const plays = platePlays(sent);
    expect(plays, 'two plates reached the wire').toHaveLength(2);
    for (const layer of plays) {
      expect(layer).toBeGreaterThanOrEqual(60);
      expect(layer).toBeLessThanOrEqual(79);
    }
    // The ledger says what the wire says.
    const seats = (s.handle.runtime.liveLayers().get(ROW) ?? []).map((rec) => rec.slot.layer);
    expect([...seats].sort((a, b) => a - b)).toEqual([...plays].sort((a, b) => a - b));
    // The bed's page itself went on its own row, below the plates.
    expect(sent.some((l) => l.startsWith('CG 2-59 ADD'))).toBe(true);
    // 🔴 COMPUTED, NEVER WRITTEN: the take happened and no catalogue file was created for it.
    expect(fs.existsSync(s.files.catalog)).toBe(false);
  });

  it('control — a declared band of 70–79 is used exactly as declared', async () => {
    const s = await station({ linked: true, declared: { start: 70, end: 79 } });
    expect(s.handle.runtime.plateBandInForce()).toEqual({
      range: { start: 70, end: 79 },
      origin: 'declared',
    });

    const { verdict, sent } = await takeTheBed(s);

    expect(verdict).toEqual({ accepted: true });
    const plays = platePlays(sent);
    expect(plays).toHaveLength(2);
    for (const layer of plays) {
      expect(layer).toBeGreaterThanOrEqual(70);
      expect(layer).toBeLessThanOrEqual(79);
    }
  });

  it('🔴 control — a station reserving layer 65 gets NO default: the take is refused on its row, and nothing is sent', async () => {
    const s = await station({ linked: true, reserved: [{ from: 65, to: 65 }] });
    expect(s.handle.runtime.plateBandInForce()).toBeNull();

    const { verdict, sent } = await takeTheBed(s);

    expect(verdict).toMatchObject({
      accepted: false,
      errorCode: 'live-source-no-layer-range',
      refusalOnRow: true,
    });
    // The row line (`CHANNEL-SOURCES-01` decision 3): the refusal is on the row, never a banner.
    const row = s.handle.runtime.stackSnapshot().find((i) => i.itemId === ROW);
    expect(row?.takeRefusal).toEqual({ code: 'live-source-no-layer-range' });
    expect(sent, 'nothing reached the wire for the take').toEqual([]);
  });

  it('control — a station NOT linked to the Playout keeps today’s rule: no band declared, no take', async () => {
    const s = await station({ linked: false });
    expect(s.handle.runtime.plateBandInForce()).toBeNull();

    const { verdict, sent } = await takeTheBed(s);

    expect(verdict).toMatchObject({ accepted: false, errorCode: 'live-source-no-layer-range' });
    expect(sent).toEqual([]);
  });
});

describe('PLATE-BAND-01 — a station boots whatever its config holds', () => {
  it('🔴 a config reserving 60–79 boots unchanged — control: the same reservation beside a DECLARED 60–79 is refused at boot, as ever', async () => {
    const s = await station({ linked: true, reserved: [{ from: 60, to: 79 }] });
    const reservedBytes = fs.readFileSync(s.files.reserved);

    expect(s.handle.sourceCatalog.band, 'no band is in force').toBeNull();
    expect(s.handle.runtime.plateBandInForce()).toBeNull();
    // Its config is exactly what it was: nothing written beside the reservation, and no band file.
    expect(fs.readFileSync(s.files.reserved).equals(reservedBytes)).toBe(true);
    expect(fs.existsSync(s.files.catalog)).toBe(false);

    // CONTROL — the reservation really does overlap the band: DECLARED over it, the boot refuses
    // (`overlaps-reserved`), which is the failure a default must never cause.
    await expect(
      station({
        linked: true,
        reserved: [{ from: 60, to: 79 }],
        declared: { start: 60, end: 79 },
      }),
    ).rejects.toThrow(/overlaps the reserved playout range/);
  });
});

describe('PLATE-BAND-01 — the console is told the band in force, and the default is never written', () => {
  it('🔴 `sources.config` carries the default; a declared band replaces it; withdrawn, the default is back — and only the declared one reaches the file', async () => {
    const s = await station({ linked: true });
    if (s.playout === null) throw new Error('a linked station has a Playout');
    const client = await openClient(s.handle);
    const admin = await s.playout.issueToken({ user: 'admin' });
    expect((await client.authenticate('auth-1', admin.token)).error).toBeUndefined();
    const told = async (id: string): Promise<ConsoleSourceCatalog> =>
      (await client.ask(id, 'sources.config')).payload as ConsoleSourceCatalog;

    // The default, as the console is told it — and no DECLARED band beside it.
    let catalog = await told('c-1');
    expect(catalog.plateBand).toEqual(DEFAULT_BAND);
    expect(catalog.layerRange).toBeUndefined();

    // A station-admin declares 70–79: it is in force as declared, and it is what the file holds.
    const declared = await client.ask('s-1', 'sources.set-config', {
      layerRange: { start: 70, end: 79 },
    });
    expect(declared.payload).toEqual({ ok: true });
    catalog = await told('c-2');
    expect(catalog.plateBand).toEqual({ range: { start: 70, end: 79 }, origin: 'declared' });
    expect(JSON.parse(fs.readFileSync(s.files.catalog, 'utf8'))).toMatchObject({
      layerRange: { start: 70, end: 79 },
    });

    // Withdrawn: the default is in force again — and it is NOT what the file holds.
    const withdrawn = await client.ask('s-2', 'sources.set-config', {});
    expect(withdrawn.payload).toEqual({ ok: true });
    catalog = await told('c-3');
    expect(catalog.plateBand).toEqual(DEFAULT_BAND);
    const file = JSON.parse(fs.readFileSync(s.files.catalog, 'utf8')) as Record<string, unknown>;
    expect(file['layerRange']).toBeUndefined();
    expect(file['plateBand']).toBeUndefined();

    // Every console converges through the push, which carries the band in force too.
    const pushed = client
      .publishes()
      .flatMap((f) =>
        f.type === 'publish' && f.channel === 'sources.config-changed'
          ? [(f.payload as ConsoleSourceCatalog).plateBand]
          : [],
      );
    expect(pushed.at(-1)).toEqual(DEFAULT_BAND);
    expect(pushed).toContainEqual({ range: { start: 70, end: 79 }, origin: 'declared' });
  });

  it('a bank row declared in 60–79 turns the default OFF and the catalogue is published again — control: a standard bank leaves it, and publishes nothing', () => {
    const r = track(
      new CasparRuntime(
        {
          servers: { A: { host: '127.0.0.1', amcpPort: 1, oscPort: 0 } },
          strategy: 'mirror-sync',
          autoFailoverEnabled: false,
        },
        {},
        { fixedBanks: [standardBank(CHANNEL)], playoutLinked: true },
      ),
      (rt) => rt.stop(),
    );
    const published: unknown[] = [];
    r.sourceCatalogChanged.subscribe((c) => published.push(c));
    expect(r.plateBandInForce()).toEqual(DEFAULT_BAND);

    // CONTROL — a second channel on the standard map: the band is untouched, and nothing is said.
    expect(r.setFixedLayerBanks([standardBank(1), standardBank(CHANNEL)])).toMatchObject({
      ok: true,
    });
    expect(r.plateBandInForce()).toEqual(DEFAULT_BAND);
    expect(published).toHaveLength(0);

    // A third channel whose operator rows sit in 60–79: that claims the band.
    const inBand: FixedLayerBank = {
      channel: 3,
      start: 60,
      count: 20,
      low: { start: 50, count: 10 },
    };
    expect(r.setFixedLayerBanks([standardBank(1), standardBank(CHANNEL), inBand])).toMatchObject({
      ok: true,
    });
    expect(r.plateBandInForce()).toBeNull();
    expect(published, 'the console is told the band is gone').toHaveLength(1);
  });
});
