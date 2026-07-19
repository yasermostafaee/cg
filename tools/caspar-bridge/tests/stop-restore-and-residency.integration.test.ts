import * as dgram from 'node:dgram';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import { CasparRuntime } from '../src/caspar-runtime.js';
import type { ConnectionConfig, RetainedStackItem, TemplateInfo } from '@cg/shared-ipc';
import { HEALTH_MS } from './support/harness.js';

/**
 * Two questions C-012 raised, answered against the wire rather than by reasoning.
 *
 * 1. PRODUCER RESIDENCY. Is a freshly LOADED item physically different from a
 *    CLEARED one? This decides whether "loaded" and "idle" are the right two
 *    buckets, or whether the display is conflating states.
 * 2. B-092 INTERACTION. A stopped item's layer reads OCCUPIED, so a bridge restart
 *    takes the adopt-without-clear branch. Does it then wrongly adopt a
 *    NOT-PLAYING item as live?
 */

let mock: MockHandle | null = null;
let runtime: CasparRuntime | null = null;
let tracePath: string | null = null;

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

const TEMPLATE: TemplateInfo = {
  templateId: 'lower-third',
  templateType: 'lower-third',
  fields: [],
};
const HTML = '<!doctype html><html><head><meta charset="utf-8"></head><body>سلام</body></html>';
const SLOT = { channel: 1, layer: 10 };

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function waitFor(cond: () => boolean, timeoutMs: number, what: string): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!cond()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await delay(25);
  }
}

async function recvLines(m: MockHandle, file: string): Promise<string[]> {
  await m.traceFlush();
  return fs
    .readFileSync(file, 'utf-8')
    .split('\n')
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as { dir: string; line: string })
    .filter((e) => e.dir === 'recv')
    .map((e) => e.line);
}

function status(r: CasparRuntime, itemId: string): string | undefined {
  return r.stackSnapshot().find((i) => i.itemId === itemId)?.status;
}

async function boot(m: MockHandle, oscPort: number): Promise<CasparRuntime> {
  const r = new CasparRuntime(singleServer(m.amcpPort, oscPort));
  runtime = r;
  r.start();
  await r.startServing();
  r.templateImport(TEMPLATE, HTML);
  await r.whenServerHealthy(HEALTH_MS);
  return r;
}

it('RESIDENCY: a LOADED item holds a producer; a CLEARED one does not', async () => {
  // The distinction the `loaded` / `idle` split actually encodes. A `CG ADD` creates
  // the html producer immediately (CasparCG stage-plays it with the page hidden until
  // the template's own play()), so a never-played LOADED item is NOT an empty layer.
  const oscPort = await freeUdpPort();
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 40 });
  const r = await boot(mock, oscPort);

  expect(mock.layerState(SLOT)).toBeUndefined(); // nothing yet

  expect((await r.load('item1', 'lower-third', {})).accepted).toBe(true);
  await expect(mock.waitForCgAddResolution(SLOT)).resolves.toBe('resolved');

  // LOADED, never played — and the layer is OCCUPIED.
  expect(mock.layerState(SLOT)?.producer).toBe('html');
  expect(mock.layerState(SLOT)?.onAir).toBe(false);
  await waitFor(() => status(r, 'item1') === 'loaded', 8000, 'reads loaded');

  // CLEARED — the producer is destroyed and the layer is genuinely empty.
  expect((await r.take('item1')).accepted).toBe(true);
  await waitFor(() => status(r, 'item1') === 'on-air', 8000, 'on air');
  expect((await r.out('item1')).accepted).toBe(true);
  await waitFor(() => mock?.layerState(SLOT)?.producer !== 'html', 8000, 'producer destroyed');
}, 40_000);

it('RESIDENCY: a take after LOAD is a bare PLAY; after CLEAR it must re-ADD first', async () => {
  // The operational consequence of the above, and the reason the two states must not
  // read alike: from `loaded` a take is one command, from `idle` it is a re-load over
  // HTTP and then a play — which can fail in ways a bare play cannot.
  tracePath = path.join(
    os.tmpdir(),
    `cg-residency-${String(process.pid)}-${String(Date.now())}.ndjson`,
  );
  const oscPort = await freeUdpPort();
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 40, tracePath });
  const r = await boot(mock, oscPort);

  expect((await r.load('item1', 'lower-third', {})).accepted).toBe(true);
  await expect(mock.waitForCgAddResolution(SLOT)).resolves.toBe('resolved');

  // take from LOADED — no re-ADD.
  let before = (await recvLines(mock, tracePath)).length;
  expect((await r.take('item1')).accepted).toBe(true);
  let lines = (await recvLines(mock, tracePath)).slice(before);
  expect(lines.some((l) => l.startsWith('CG 1-10 PLAY'))).toBe(true);
  expect(lines.some((l) => l.startsWith('CG 1-10 ADD'))).toBe(false);

  // …now CLEAR, and take again — this one MUST re-ADD.
  expect((await r.out('item1')).accepted).toBe(true);
  await waitFor(() => status(r, 'item1') === 'idle', 8000, 'idle after clear');
  before = (await recvLines(mock, tracePath)).length;
  expect((await r.take('item1')).accepted).toBe(true);
  lines = (await recvLines(mock, tracePath)).slice(before);
  expect(lines.some((l) => l.startsWith('CG 1-10 ADD'))).toBe(true); // the re-load
}, 40_000);

it('B-092: a STOPPED item restored across a bridge restart is adopted WITHOUT being claimed live', async () => {
  // The combination the owner flagged. A stopped layer reads OCCUPIED, so the restore
  // takes the adopt-without-clear branch — correct, because there IS a producer. The
  // question is whether it then claims the item is on air. It must not: the item was
  // stopped, so it carries no play evidence, and the same OSC observation derives
  // `loaded` rather than `on-air`.
  tracePath = path.join(
    os.tmpdir(),
    `cg-stop-restore-${String(process.pid)}-${String(Date.now())}.ndjson`,
  );
  const oscPort = await freeUdpPort();
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 40, tracePath });

  // Session 1: load, take, STOP — then the bridge dies with the producer resident.
  const r1 = await boot(mock, oscPort);
  expect((await r1.load('item1', 'lower-third', {})).accepted).toBe(true);
  await expect(mock.waitForCgAddResolution(SLOT)).resolves.toBe('resolved');
  expect((await r1.take('item1')).accepted).toBe(true);
  await waitFor(() => status(r1, 'item1') === 'on-air', 8000, 'on air');
  expect((await r1.stopItem('item1')).accepted).toBe(true);
  await waitFor(() => status(r1, 'item1') === 'loaded', 8000, 'stopped');
  expect(mock.layerState(SLOT)?.producer).toBe('html'); // resident, as designed
  await r1.stop();
  runtime = null;

  const beforeRestore = (await recvLines(mock, tracePath)).length;

  // Session 2: the SPA restores the retained intent. A stopped item retains as
  // NOT-played, which is what keeps the adopt branch honest.
  const retained: RetainedStackItem[] = [
    {
      itemId: 'item1',
      templateId: 'lower-third',
      fields: {},
      played: false,
      slot: { ...SLOT, server: 'primary' },
    },
  ];
  const r2 = new CasparRuntime(singleServer(mock.amcpPort, oscPort));
  runtime = r2;
  await r2.startServing();
  r2.templateImport(TEMPLATE, HTML);
  expect(await r2.restore(retained)).toEqual({ restored: 1, skipped: 0 });
  r2.start();
  await r2.whenServerHealthy(HEALTH_MS);
  await delay(1200);

  // Adopted, not disturbed: nothing was sent for it, and the producer survives.
  const lines = (await recvLines(mock, tracePath)).slice(beforeRestore);
  expect(lines.some((l) => l.startsWith('CLEAR 1-10'))).toBe(false);
  expect(lines.some((l) => l.startsWith('CG 1-10 ADD'))).toBe(false);
  expect(mock.layerState(SLOT)?.producer).toBe('html');

  // …and crucially it is NOT claimed on air. A resident producer plus no play
  // evidence derives `loaded`, which is exactly what the item is.
  expect(status(r2, 'item1')).toBe('loaded');
  expect(status(r2, 'item1')).not.toBe('on-air');
  expect(status(r2, 'item1')).not.toBe('playing');
}, 60_000);
