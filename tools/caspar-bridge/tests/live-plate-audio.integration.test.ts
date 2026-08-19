import * as dgram from 'node:dgram';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import type {
  ConnectionConfig,
  RetainedStackItem,
  SourceAssignments,
  SourceCatalog,
  TemplateInfo,
} from '@cg/shared-ipc';
import { CasparRuntime } from '../src/caspar-runtime.js';
import { awaitChannelModeRead, HEALTH_MS } from './support/harness.js';

/**
 * C-015 phase 6 (6.5f) — **THE RAISE HALF OF THE AUDIO RULE: the explicit recorded
 * intent, and everything that has to survive.**
 *
 * Every producer the bridge creates is created MUTED, and audio is raised only by
 * an explicit intent naming the layer. The mute half needs no memory — silence is
 * the default. **The raise half is nothing BUT memory**, so almost every assertion
 * here is about the intent OUTLIVING something: a re-take, a teardown, a source
 * swap, a bridge restart.
 *
 * 🔴 **THE REGRESSION THIS FILE EXISTS FOR.** The intent was first read off the
 * LEDGER (`LiveLayerRecord.intendedVolume`), which teardown destroys — so a CLEAR
 * followed by a re-take silently re-muted a plate the operator had raised, with
 * nothing anywhere saying it had happened. The intent now lives in `#plateVolumes`,
 * which outlives the ledger and is what retention carries.
 */

let mock: MockHandle | null = null;
let runtime: CasparRuntime | null = null;
let tracePath: string | null = null;

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

const CATALOG: SourceCatalog = {
  sources: [
    { id: 'src-a', name: 'Studio A', format: '1080i5000', producer: { kind: 'route', channel: 2 } },
    { id: 'src-b', name: 'Baku', format: '1080i5000', producer: { kind: 'route', channel: 3 } },
  ],
  layerRange: BAND,
};

const ASSIGNMENTS: SourceAssignments = {
  assignments: [
    { templateId: 'lower-third', plateId: 'guest-1', sourceId: 'src-a' },
    { templateId: 'lower-third', plateId: 'guest-2', sourceId: 'src-b' },
  ],
};

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

async function boot(): Promise<CasparRuntime> {
  const oscPort = await freeUdpPort();
  tracePath = path.join(
    os.tmpdir(),
    `cg-plateaudio-${String(process.pid)}-${String(Date.now())}-${String(Math.round(performance.now() * 1000))}.ndjson`,
  );
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 30, tracePath });
  const r = new CasparRuntime(
    singleServer(mock.amcpPort, oscPort),
    {},
    { sweepMs: 150, sourceCatalog: CATALOG, sourceAssignments: ASSIGNMENTS },
  );
  runtime = r;
  r.start();
  await r.startServing();
  r.templateImport(TEMPLATE, '<!doctype html><html><body>served</body></html>');
  await r.whenServerHealthy(HEALTH_MS);
  // The refused-edit case asserts "the wire shows NOTHING" from a `before`
  // baseline — valid only once R-030's timer-driven one-shot `INFO` has drained
  // (flake family 3, support/harness.ts).
  await awaitChannelModeRead(r);
  return r;
}

async function onAir(r: CasparRuntime): Promise<void> {
  await r.load('item-1', 'lower-third', {});
  expect((await r.take('item-1')).accepted).toBe(true);
}

const layerOf = (r: CasparRuntime, plateId: string): number =>
  (r.liveLayers().get('item-1') ?? []).find((rec) => rec.sourceId === plateId)?.slot.layer ?? -1;

const volumeOf = (r: CasparRuntime, plateId: string): number | undefined =>
  mock?.layerState({ channel: 1, layer: layerOf(r, plateId) })?.volume;

it('🔴 raising a plate reaches the WIRE and records the intent', async () => {
  const r = await boot();
  await onAir(r);
  // Every plate starts silent — that is the rule, and it is the precondition for
  // this whole test rather than an incidental fact.
  expect(volumeOf(r, 'guest-1')).toBe(0);
  const layer = layerOf(r, 'guest-1');
  const before = (await recvLines()).length;

  expect(await r.setLivePlateVolume('item-1', 'guest-1', 1)).toEqual({ ok: true });

  expect((await recvLines()).slice(before)).toContain(`MIXER 1-${String(layer)} VOLUME 1`);
  expect(volumeOf(r, 'guest-1')).toBe(1);
  expect(r.livePlateVolumes('item-1')).toEqual({ 'guest-1': 1 });
  // Its NEIGHBOUR is untouched: the intent is per-plate, not per-item.
  expect(volumeOf(r, 'guest-2')).toBe(0);
});

it('🔴 THE REGRESSION — a raised plate survives a CLEAR and a re-take', async () => {
  // The ledger is DESTROYED by teardown, so an intent read from it vanished here:
  // the picture came back and the guest did not, with every console showing the
  // row as normal. The intent lives in `#plateVolumes`, which outlives the ledger.
  const r = await boot();
  await onAir(r);
  await r.setLivePlateVolume('item-1', 'guest-1', 1);

  await r.out('item-1');
  expect(r.liveLayers().has('item-1'), 'teardown really did destroy the ledger').toBe(false);
  await r.take('item-1');

  expect(volumeOf(r, 'guest-1')).toBe(1);
  expect(volumeOf(r, 'guest-2')).toBe(0);
});

it('the intent can be ARMED BEFORE the take — nothing is sent, and the take carries it', async () => {
  const r = await boot();
  await r.load('item-1', 'lower-third', {});
  const before = (await recvLines()).length;

  expect(await r.setLivePlateVolume('item-1', 'guest-1', 0.5)).toEqual({ ok: true });

  // No producer exists yet, so there is nothing to command and nothing is sent.
  expect((await recvLines()).slice(before)).toEqual([]);
  await r.take('item-1');
  // …and the seating carries it, so the plate is audible from its first frame
  // rather than from whenever the operator noticed.
  expect(volumeOf(r, 'guest-1')).toBe(0.5);
});

it('🔴 ZERO IS A REAL INTENT — recorded, published, and NOT re-raised by a swap', async () => {
  const r = await boot();
  await onAir(r);
  await r.setLivePlateVolume('item-1', 'guest-1', 1);
  // The operator mutes it again, deliberately.
  expect(await r.setLivePlateVolume('item-1', 'guest-1', 0)).toEqual({ ok: true });

  // RECORDED, not deleted: "the operator muted this" is a different state from
  // "nobody has said", and only one of the two was chosen.
  expect(r.livePlateVolumes('item-1')).toEqual({ 'guest-1': 0 });
  expect(r.stackSnapshot().find((i) => i.itemId === 'item-1')?.plateVolumes).toEqual({
    'guest-1': 0,
  });

  await r.swapLiveSource('item-1', 'guest-1', 'src-b');

  // A swap re-asserts the PLATE's intent. A deliberate 0 must come back as 0 — a
  // truthiness test anywhere on this path would read it as "no intent" and hand
  // the plate the default, which for a future non-zero default is a microphone
  // opened by a swap nobody associated with audio.
  expect(volumeOf(r, 'guest-1')).toBe(0);
});

it('an ABSENT intent and an explicit 0 are distinguishable in the published state', async () => {
  const r = await boot();
  await onAir(r);
  expect(r.stackSnapshot().find((i) => i.itemId === 'item-1')?.plateVolumes).toBeUndefined();

  await r.setLivePlateVolume('item-1', 'guest-1', 0);

  const published = r.stackSnapshot().find((i) => i.itemId === 'item-1')?.plateVolumes;
  expect(published).toBeDefined();
  expect(published?.['guest-1']).toBe(0);
  // The plate nobody spoke about is still ABSENT, not a zero — so a consumer can
  // tell "chosen silent" from "never asked".
  expect(published?.['guest-2']).toBeUndefined();
});

it('a raised plate is still audible after an ON-AIR SOURCE SWAP (6.9c, from the intent map)', async () => {
  const r = await boot();
  await onAir(r);
  await r.setLivePlateVolume('item-1', 'guest-1', 1);

  await r.swapLiveSource('item-1', 'guest-1', 'src-b');

  // The new producer is born muted like every other; the swap re-asserts the
  // plate's intent onto it.
  expect(volumeOf(r, 'guest-1')).toBe(1);
});

it('🔴 6.5f/6.9d — the intent SURVIVES a bridge restart, through retention', async () => {
  const r = await boot();
  await onAir(r);
  await r.setLivePlateVolume('item-1', 'guest-1', 1);
  const published = r.stackSnapshot().find((i) => i.itemId === 'item-1');
  expect(published?.plateVolumes).toEqual({ 'guest-1': 1 });

  // What the browser retains and hands back to a fresh bridge process.
  const retained: RetainedStackItem[] = [
    {
      itemId: 'item-1',
      templateId: 'lower-third',
      fields: {},
      state: 'on-air',
      ...(published?.plateVolumes !== undefined && { plateVolumes: published.plateVolumes }),
    },
  ];
  await runtime?.stop();
  runtime = null;
  const fresh = new CasparRuntime(
    singleServer(mock?.amcpPort ?? 0, await freeUdpPort()),
    {},
    { sweepMs: 150, sourceCatalog: CATALOG, sourceAssignments: ASSIGNMENTS },
  );
  runtime = fresh;
  fresh.start();
  await fresh.startServing();
  fresh.templateImport(TEMPLATE, '<!doctype html><html><body>served</body></html>');
  await fresh.whenServerHealthy(HEALTH_MS);

  await fresh.restore(retained);

  expect(fresh.livePlateVolumes('item-1')).toEqual({ 'guest-1': 1 });
  // The claim that matters is not "the field came back" — it is that the next take
  // puts the guest back ON AIR AUDIBLE. A restored intent nobody asserts is not a
  // restored intent.
  await fresh.take('item-1');
  expect(volumeOf(fresh, 'guest-1')).toBe(1);
  expect(volumeOf(fresh, 'guest-2')).toBe(0);
});

it('remove() drops the intent — a re-used itemId never inherits an open microphone', async () => {
  const r = await boot();
  await onAir(r);
  await r.setLivePlateVolume('item-1', 'guest-1', 1);

  await r.remove('item-1');

  expect(r.livePlateVolumes('item-1')).toBeUndefined();
});

it('an unknown plate and an out-of-range volume are refused by name', async () => {
  const r = await boot();
  await onAir(r);

  expect(await r.setLivePlateVolume('item-1', 'guest-9', 1)).toEqual({
    ok: false,
    reason: 'unknown-plate',
  });
  // A gain above 1 is a request to AMPLIFY a guest's microphone; refused at the
  // boundary rather than sent and hoped about.
  expect(await r.setLivePlateVolume('item-1', 'guest-1', 40)).toEqual({
    ok: false,
    reason: 'invalid-volume',
  });
  expect(await r.setLivePlateVolume('item-1', 'guest-1', -1)).toEqual({
    ok: false,
    reason: 'invalid-volume',
  });
  // `NaN >= 0` is false, so a NaN slipping past the range test would be recorded
  // as an intent nothing could ever assert.
  expect(await r.setLivePlateVolume('item-1', 'guest-1', Number.NaN)).toEqual({
    ok: false,
    reason: 'invalid-volume',
  });
});

it('a failed volume send records NOTHING — one refusal must not become a standing claim', async () => {
  const r = await boot();
  await onAir(r);
  mock?.setHandler('MIXER', () => ({ kind: 'err', code: 502, verb: 'MIXER' }));

  const verdict = await r.setLivePlateVolume('item-1', 'guest-1', 1);

  expect(verdict.ok).toBe(false);
  // Neither the intent nor the ledger's as-sent copy moved: a recorded intent the
  // layer never received would be re-asserted onto every future swap and re-take.
  expect(r.livePlateVolumes('item-1')).toBeUndefined();
  expect(
    r
      .liveLayers()
      .get('item-1')
      ?.find((x) => x.sourceId === 'guest-1')?.intendedVolume,
  ).toBe(0);
});
