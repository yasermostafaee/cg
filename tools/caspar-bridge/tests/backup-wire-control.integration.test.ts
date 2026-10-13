import * as dgram from 'node:dgram';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, expect, it } from 'vitest';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import { DEFAULT_LAYER_POLICY } from '@cg/caspar-client';
import type {
  ConnectionConfig,
  SourceAssignments,
  SourceCatalog,
  TemplateInfo,
} from '@cg/shared-ipc';
import { CasparRuntime } from '../src/caspar-runtime.js';
import { validateFixedBank } from '../src/fixed-layers-store.js';
import { awaitChannelModeRead, HEALTH_MS } from './support/harness.js';
import { FURNITURE, standardBank } from './support/two-channel-rig.js';
import { recvLines } from './support/wire-trace.js';

/**
 * 🔴 `RELEASE-0113-01` Part C — **THE SAME SCENARIO ON THE OLD SEAM AND THE NEW, AND A's WIRE LINE FOR LINE.**
 *
 * Deliberately SELF-CONTAINED — it imports nothing `0.11.3` added — so this one file runs unchanged on the
 * `0.11.2` code (`7ef2f274`) as on this code: the map is an inline object, which the old runtime ignores.
 *
 *   - On `0.11.2` it FAILS: core B receives the station's `1-…` lines (B's channel 1 — another programme).
 *   - On `0.11.3` it passes: core B receives `2-…` and nothing else that names a channel.
 *   - Core A's layer writes are compared with what `0.11.2` sent for the same scenario, recorded from that
 *     run (`fixtures/wire-a-0112.json`): byte for byte but for the template server's ephemeral port.
 *
 * With `CG_WIRE_EVIDENCE` set it also writes both wires there — the report's excerpts.
 */

const mocks: MockHandle[] = [];
let runtime: CasparRuntime | null = null;
const files: string[] = [];

afterEach(async () => {
  await runtime?.stop();
  runtime = null;
  for (const m of mocks.splice(0)) await m.stop();
  for (const f of files.splice(0)) if (fs.existsSync(f)) fs.rmSync(f);
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

const BANK = standardBank(1);
const SCENE = { width: 1920, height: 1080 };
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
    defaultPosition: { anchor: 'center', offset: { x: 0, y: 0 } },
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

/** The pair: the station's channel 1 is mirrored at core B's OWN channel 2 (`0.11.2` ignores this). */
const ONE_AT_TWO = {
  channelOnB: (n: number): number | null => (n === 1 ? 2 : null),
  channelOnBAtTake: (n: number): number | null => (n === 1 ? 2 : null),
  stationChannelOf: (m: number): number | null => (m === 2 ? 1 : null),
  release: (): void => undefined,
};

const LAYER_WRITE = /^(CG|PLAY|LOADBG|LOAD|STOP|CLEAR|MIXER|CALL|PAUSE|RESUME|SWAP)\b/;
const channelOf = (line: string): number | null => {
  const m =
    /^(?:CG|PLAY|LOAD|LOADBG|STOP|CLEAR|PAUSE|RESUME|CALL|MIXER|INFO) (\d+)(?:-\d+)?(?:\s|$)/.exec(
      line,
    );
  return m === null ? null : Number(m[1]);
};
/**
 * Two things in a layer write are not the same on two runs, by design: the template server's ephemeral port,
 * and each take's own random id (`__cg.take`, `SELF-STOP-24`). Nothing else is.
 */
const normalise = (line: string): string =>
  line
    .replace(/http:\/\/127\.0\.0\.1:\d+\//g, 'http://<template-server>/')
    .replace(/\\"take\\":\\"[0-9a-f]+\\"/g, '\\"take\\":\\"<take-id>\\"');

async function core(
  channels: number,
): Promise<{ mock: MockHandle; oscPort: number; trace: string }> {
  const oscPort = await freeUdpPort();
  const trace = path.join(
    os.tmpdir(),
    `cg-wire-control-${String(process.pid)}-${String(Date.now())}-${String(Math.round(performance.now() * 1000))}.ndjson`,
  );
  files.push(trace);
  const mock = await createMock({
    amcpPort: 0,
    oscPort,
    oscHost: '127.0.0.1',
    oscHz: 30,
    channels,
    tracePath: trace,
  });
  mocks.push(mock);
  return { mock, oscPort, trace };
}

it('🔴 the same take, UPDATE, look switch, swap, clear and CLEAR ALL: core B hears only `2-…`, and core A hears exactly what 0.11.2 sent it', async () => {
  const a = await core(2);
  const b = await core(5);
  const config: ConnectionConfig = {
    servers: {
      A: { host: '127.0.0.1', amcpPort: a.mock.amcpPort, oscPort: a.oscPort },
      B: { host: '127.0.0.1', amcpPort: b.mock.amcpPort, oscPort: b.oscPort },
    },
    strategy: 'mirror-sync',
    autoFailoverEnabled: false,
  };
  const r = new CasparRuntime(config, {}, {
    fixedSlots: validateFixedBank(BANK, { policy: DEFAULT_LAYER_POLICY, reservedLayers: [] }),
    fixedBanks: [BANK],
    layerPolicy: DEFAULT_LAYER_POLICY,
    reservedLayers: [],
    lookMixerHoldMs: 0,
    sourceCatalog: CATALOG,
    sourceAssignments: ASSIGNMENTS,
    backupChannels: ONE_AT_TWO,
  } as ConstructorParameters<typeof CasparRuntime>[2]);
  runtime = r;
  r.start();
  await r.startServing();
  r.templateImport(TWO_BOX, HTML);
  r.templateImport(FURNITURE, HTML);
  await r.whenServerHealthy(HEALTH_MS);
  await awaitChannelModeRead(r);
  await delay(300);

  expect(await r.loadFixed({ channel: 1, layer: 59 }, 'bed-59', 'two-box', {})).toEqual({
    accepted: true,
  });
  expect(await r.take('bed-59')).toEqual({ accepted: true });
  expect(await r.loadFixed({ channel: 1, layer: 99 }, 'logo-99', 'logo', {})).toEqual({
    accepted: true,
  });
  expect(await r.take('logo-99')).toEqual({ accepted: true });
  expect((await r.update('logo-99', {}, 'merge')).accepted).toBe(true);
  expect(await r.setActiveLook('bed-59', 'look-2')).toEqual({ ok: true });
  expect((await r.swapLiveSource('bed-59', 'l1', 'src-3')).ok).toBe(true);
  expect((await r.out('bed-59')).accepted).toBe(true);
  expect((await r.clearAll(1)).ok).toBe(true);
  await delay(400);

  await a.mock.traceFlush();
  await b.mock.traceFlush();
  const onA = recvLines(a.trace)
    .filter((l) => LAYER_WRITE.test(l))
    .map(normalise);
  const onB = recvLines(b.trace)
    .filter((l) => channelOf(l) !== null)
    .map(normalise);
  const evidence = process.env['CG_WIRE_EVIDENCE'];
  if (evidence !== undefined && evidence !== '') {
    fs.writeFileSync(evidence, `${JSON.stringify({ a: onA, b: onB }, null, 2)}\n`);
  }

  // Core A: what `0.11.2` sent it for this scenario, line for line.
  const fixture = fileURLToPath(new URL('./fixtures/wire-a-0112.json', import.meta.url));
  if (fs.existsSync(fixture)) {
    const recorded = JSON.parse(fs.readFileSync(fixture, 'utf8')) as { a: string[] };
    expect(onA.length, 'the instrument saw A’s writes').toBeGreaterThan(20);
    expect(onA).toEqual(recorded.a);
  }
  // 🔴 Core B: its own channel 2, and nothing else that names a channel.
  expect(onB.length, 'the instrument saw B’s lines').toBeGreaterThan(10);
  expect([...new Set(onB.map(channelOf))]).toEqual([2]);
}, 60_000);
