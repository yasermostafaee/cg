import * as dgram from 'node:dgram';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import { CasparRuntime } from '../src/caspar-runtime.js';
import type { ConnectionConfig, TemplateInfo } from '@cg/shared-ipc';
import { HEALTH_MS } from './support/harness.js';

/**
 * C-012 — `CG STOP` as a distinct operator action, and the property that makes it
 * worth a fifth verb: the producer SURVIVES.
 *
 * Hardware-verified on CasparCG 2.3.2 `4de6d18f` (PR #353's probe):
 *   CG <ch>-<layer> STOP 0 -> 202 CG OK; OSC still reports `html`; window.stop FIRED
 *   CG <ch>-<layer> PLAY 0 -> 202 CG OK, RESUMED, with NO re-ADD
 *   CLEAR <ch>-<layer>     -> OSC SILENT; the producer is DESTROYED
 *
 * These assert the WIRE — which verb went out, and crucially which verb did NOT. A
 * STOP that quietly re-ADDed would look identical in the UI and throw away the
 * entire point.
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

/** Boot, import, load and take `item1` to a real OSC-backed ON AIR. */
async function onAir(m: MockHandle, oscPort: number): Promise<CasparRuntime> {
  const r = new CasparRuntime(singleServer(m.amcpPort, oscPort));
  runtime = r;
  r.start();
  await r.startServing();
  r.templateImport(TEMPLATE, HTML);
  await r.whenServerHealthy(HEALTH_MS);
  expect((await r.load('item1', 'lower-third', { headline: 'سلام' })).accepted).toBe(true);
  await expect(m.waitForCgAddResolution(SLOT)).resolves.toBe('resolved');
  expect((await r.take('item1')).accepted).toBe(true);
  await waitFor(() => status(r, 'item1') === 'on-air', 8000, 'item reaches ON AIR');
  return r;
}

it('STOP sends CG STOP — not a CLEAR, and not a re-ADD', async () => {
  tracePath = path.join(os.tmpdir(), `cg-stop-${String(process.pid)}-${String(Date.now())}.ndjson`);
  const oscPort = await freeUdpPort();
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 40, tracePath });
  const r = await onAir(mock, oscPort);
  const before = (await recvLines(mock, tracePath)).length;

  expect((await r.stopItem('item1')).accepted).toBe(true);

  const lines = (await recvLines(mock, tracePath)).slice(before);
  expect(lines.some((l) => l.startsWith('CG 1-10 STOP'))).toBe(true);
  // The two verbs it must NOT be: CLEAR destroys the producer, and a re-ADD would
  // throw away the resident producer that makes the resume possible.
  expect(lines.some((l) => l.startsWith('CLEAR 1-10'))).toBe(false);
  expect(lines.some((l) => l.startsWith('CG 1-10 ADD'))).toBe(false);
  expect(lines.some((l) => /^CLEAR 1\s*$/.test(l))).toBe(false);
}, 40_000);

it('after STOP the item rests at LOADED — the producer is resident, not playing', async () => {
  const oscPort = await freeUdpPort();
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 40 });
  const r = await onAir(mock, oscPort);

  expect((await r.stopItem('item1')).accepted).toBe(true);

  // Not `idle` (CLEAR's end state, which would claim the layer is empty while a
  // producer sits on it), and NOT a lingering red on-air claim — the producer
  // persists, so OSC keeps reporting `html` forever and the play evidence has to be
  // retracted or the row would claim ON AIR indefinitely.
  await waitFor(() => status(r, 'item1') === 'loaded', 8000, 'settles at LOADED');
  expect(status(r, 'item1')).not.toBe('on-air');
  expect(status(r, 'item1')).not.toBe('playing');
  expect(status(r, 'item1')).not.toBe('idle');
  // The layer is still OCCUPIED, which is what the occupancy tap must see.
  expect(mock.layerState(SLOT)?.producer).toBe('html');
}, 40_000);

it('PLAY after STOP RESUMES — a bare CG PLAY, no re-ADD', async () => {
  // The property the whole feature rests on, and the reason `#loaded` must not be
  // cleared by a stop the way it is by an out.
  tracePath = path.join(
    os.tmpdir(),
    `cg-stop-resume-${String(process.pid)}-${String(Date.now())}.ndjson`,
  );
  const oscPort = await freeUdpPort();
  mock = await createMock({ amcpPort: 0, oscPort, oscHz: 40, oscHost: '127.0.0.1', tracePath });
  const r = await onAir(mock, oscPort);
  expect((await r.stopItem('item1')).accepted).toBe(true);
  await waitFor(() => status(r, 'item1') === 'loaded', 8000, 'stopped');
  const before = (await recvLines(mock, tracePath)).length;

  expect((await r.take('item1')).accepted).toBe(true);

  const lines = (await recvLines(mock, tracePath)).slice(before);
  expect(lines.some((l) => l.startsWith('CG 1-10 PLAY'))).toBe(true);
  expect(lines.some((l) => l.startsWith('CG 1-10 ADD'))).toBe(false); // resumed, not reloaded
  await waitFor(() => status(r, 'item1') === 'on-air', 8000, 'back ON AIR');
}, 40_000);

it('CLEAR after STOP still destroys the producer — the escalation path is intact', async () => {
  const oscPort = await freeUdpPort();
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 40 });
  const r = await onAir(mock, oscPort);
  expect((await r.stopItem('item1')).accepted).toBe(true);
  await waitFor(() => status(r, 'item1') === 'loaded', 8000, 'stopped');

  // `out()` is unchanged by this feature and still reaches a stopped producer.
  expect((await r.out('item1')).accepted).toBe(true);
  await waitFor(() => mock?.layerState(SLOT)?.producer !== 'html', 8000, 'producer destroyed');
}, 40_000);

it('R-006: STOP is REFUSED while no server is reachable, like every on-air verb', async () => {
  const oscPort = await freeUdpPort();
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 40 });
  const r = await onAir(mock, oscPort);

  const dying = mock;
  mock = null;
  await dying.stop();
  await waitFor(() => r.health().primary.state !== 'healthy', 8000, 'link drops');

  expect(await r.stopItem('item1')).toEqual({ accepted: false, errorCode: 'disconnected' });
  // …and it is refused the same way take/out are, so the surface stays coherent.
  expect(await r.take('item1')).toEqual({ accepted: false, errorCode: 'disconnected' });
  expect(await r.out('item1')).toEqual({ accepted: false, errorCode: 'disconnected' });
}, 40_000);

it('STOP on an unknown item is refused, and sends nothing', async () => {
  tracePath = path.join(
    os.tmpdir(),
    `cg-stop-unknown-${String(process.pid)}-${String(Date.now())}.ndjson`,
  );
  const oscPort = await freeUdpPort();
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 40, tracePath });
  const r = await onAir(mock, oscPort);
  const before = (await recvLines(mock, tracePath)).length;

  expect(await r.stopItem('no-such-item')).toEqual({
    accepted: false,
    errorCode: 'unknown-item',
  });
  const lines = (await recvLines(mock, tracePath)).slice(before);
  expect(lines.some((l) => l.includes('STOP'))).toBe(false);
}, 40_000);
