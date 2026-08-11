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
 * The blind-tap hole in B-092's occupancy-aware restore, proven on real hardware
 * (PR #353's probe) and pinned here.
 *
 * `OscOccupancyTap` is populated only by OSC. If OSC never arrives — misconfigured
 * `casparcg.config`, OSC pointed at the wrong port, a firewall — the map is empty
 * and `occupied()` returns `[]`, so a genuinely LIVE layer reads as unoccupied.
 * The restore then took the re-ADD branch and sent
 *
 *     CG <ch>-<layer> ADD 0 "<template>" 0 "{}"
 *
 * over the live producer, with play-on-load `0` — replacing a playing graphic
 * with a non-playing one. OFF AIR, silently, with no error and no operator signal.
 *
 * The design's literal invariant survived (no CLEAR is ever sent) but the property
 * it existed to protect did not (the graphic keeps playing). These assert the WIRE,
 * not the badge — a badge can read correct while the mechanism underneath is blind,
 * which is exactly how this went unnoticed.
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

/** The mock's NDJSON wire trace: recv'd AMCP lines, in arrival order. */
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

const retained = (): RetainedStackItem[] => [
  {
    itemId: 'item1',
    templateId: 'lower-third',
    fields: { headline: 'سلام' },
    state: 'on-air',
    slot: { ...SLOT, server: 'primary' },
  },
];

function status(r: CasparRuntime, itemId: string): string | undefined {
  return r.stackSnapshot().find((i) => i.itemId === itemId)?.status;
}

/** Leave a LIVE producer on the probe slot, as a dead bridge session would. */
async function orphanLiveProducer(m: MockHandle, oscPort: number): Promise<void> {
  const r = new CasparRuntime(singleServer(m.amcpPort, oscPort));
  runtime = r;
  r.start();
  await r.startServing();
  r.templateImport(TEMPLATE, HTML);
  await r.whenServerHealthy(HEALTH_MS);
  expect((await r.load('item1', 'lower-third', { headline: 'سلام' })).accepted).toBe(true);
  await expect(m.waitForCgAddResolution(SLOT)).resolves.toBe('resolved');
  expect((await r.take('item1')).accepted).toBe(true);
  expect(m.layerState(SLOT)?.onAir).toBe(true);
  await r.stop(); // the bridge dies; nothing clears the layer
  runtime = null;
}

it('THE REGRESSION: a BLIND tap over a LIVE layer sends NOTHING and says so honestly', async () => {
  tracePath = path.join(
    os.tmpdir(),
    `cg-blindtap-${String(process.pid)}-${String(Date.now())}.ndjson`,
  );
  const oscPort = await freeUdpPort();
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 40, tracePath });

  await orphanLiveProducer(mock, oscPort);
  expect(mock.layerState(SLOT)?.onAir).toBe(true); // still live, orphaned
  const beforeRestore = (await recvLines(mock, tracePath)).length;

  // The fresh bridge binds an OSC port the mock never sends to: AMCP is fine,
  // the occupancy tap is deaf. This is the misconfigured-install shape.
  const deafPort = await freeUdpPort();
  const r = new CasparRuntime(singleServer(mock.amcpPort, deafPort));
  runtime = r;
  await r.startServing();
  r.templateImport(TEMPLATE, HTML);
  expect(await r.restore(retained())).toEqual({ restored: 1, skipped: [] });
  r.start();
  await r.whenServerHealthy(HEALTH_MS);
  await delay(1500); // give the (absent) OSC every chance to arrive

  // ── THE INVARIANT ──
  // Nothing at all was sent for this item. Not a CLEAR (the old design already
  // guaranteed that) and — the actual fix — not the re-ADD that would have
  // replaced a playing producer with a non-playing one.
  const lines = (await recvLines(mock, tracePath)).slice(beforeRestore);
  expect(lines.some((l) => l.startsWith('CG 1-10 ADD'))).toBe(false);
  expect(lines.some((l) => l.startsWith('CLEAR 1-10'))).toBe(false);
  expect(lines.some((l) => /^CLEAR 1\s*$/.test(l))).toBe(false);

  // The graphic the operator is watching is untouched and STILL ON AIR.
  expect(mock.layerState(SLOT)?.onAir).toBe(true);

  // …and the row is honest rather than silently confident: it does NOT claim the
  // broadcast-red on-air/playing, it publishes the muted "WAS ON AIR".
  expect(status(r, 'item1')).toBe('unverified');
  expect(r.stackSnapshot().map((i) => i.itemId)).toEqual(['item1']); // still visible

  // …and it publishes WHY, so the row can word itself correctly. A link-loss
  // `unverified` means "the graphic is probably gone, reconnect"; this one means
  // "the graphic is probably still on air, fix OSC" — opposite operator actions,
  // so the cause has to travel with the state.
  expect(r.stackSnapshot().find((i) => i.itemId === 'item1')?.errorCode).toBe('osc-unverifiable');
}, 40_000);

it('UNCHANGED: a HEARING tap over an occupied layer still adopts, sending nothing', async () => {
  tracePath = path.join(
    os.tmpdir(),
    `cg-blindtap-occ-${String(process.pid)}-${String(Date.now())}.ndjson`,
  );
  const oscPort = await freeUdpPort();
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 40, tracePath });

  await orphanLiveProducer(mock, oscPort);
  const beforeRestore = (await recvLines(mock, tracePath)).length;

  const r = new CasparRuntime(singleServer(mock.amcpPort, oscPort)); // OSC reaches it
  runtime = r;
  await r.startServing();
  r.templateImport(TEMPLATE, HTML);
  expect(await r.restore(retained())).toEqual({ restored: 1, skipped: [] });
  r.start();
  await r.whenServerHealthy(HEALTH_MS);

  await waitFor(() => status(r, 'item1') === 'on-air', 8000, 'restored item reads ON AIR');
  const lines = (await recvLines(mock, tracePath)).slice(beforeRestore);
  expect(lines.some((l) => l.startsWith('CLEAR 1-10'))).toBe(false);
  expect(lines.some((l) => l.startsWith('CG 1-10 ADD'))).toBe(false);
  expect(mock.layerState(SLOT)?.onAir).toBe(true);
}, 40_000);

it('UNCHANGED: a HEARING tap over a genuinely SILENT layer still re-ADDs as loaded', async () => {
  tracePath = path.join(
    os.tmpdir(),
    `cg-blindtap-silent-${String(process.pid)}-${String(Date.now())}.ndjson`,
  );
  const oscPort = await freeUdpPort();
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 40, tracePath });

  await orphanLiveProducer(mock, oscPort);
  const amcpPort = mock.amcpPort;

  // CasparCG restarts too: the layers come back EMPTY, and the tap HEARS that.
  const dying = mock;
  mock = null;
  await dying.stop();
  mock = await createMock({ amcpPort, oscPort, oscHost: '127.0.0.1', oscHz: 40, tracePath });
  expect(mock.layerState(SLOT)).toBeUndefined();
  const beforeRestore = (await recvLines(mock, tracePath)).length;

  const r = new CasparRuntime(singleServer(amcpPort, oscPort));
  runtime = r;
  await r.startServing();
  r.templateImport(TEMPLATE, HTML);
  expect(await r.restore(retained())).toEqual({ restored: 1, skipped: [] });
  r.start();
  await r.whenServerHealthy(HEALTH_MS);

  // Silence from a tap that IS hearing the server is real evidence of emptiness,
  // so the item is safely re-ADDed and rests at LOADED.
  await expect(mock.waitForCgAddResolution(SLOT, 10_000)).resolves.toBe('resolved');
  await waitFor(() => status(r, 'item1') === 'loaded', 8000, 'restored item rests at LOADED');
  const lines = (await recvLines(mock, tracePath)).slice(beforeRestore);
  expect(lines.some((l) => l.startsWith('CG 1-10 ADD'))).toBe(true);
  expect(lines.some((l) => l.startsWith('CLEAR 1-10'))).toBe(false);
}, 40_000);

it('a blind restore RECOVERS: once OSC starts arriving, the sweep decides the item', async () => {
  // Without this the fix would trade one hole for another — a tap that comes up
  // a moment after the healthy transition would strand the row as `unverified`
  // for the life of the process.
  const oscPort = await freeUdpPort();
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 40 });

  await orphanLiveProducer(mock, oscPort);

  // Boot deaf, with a fast sweep so the retry is observable in test time.
  const deafPort = await freeUdpPort();
  const r = new CasparRuntime(singleServer(mock.amcpPort, deafPort), undefined, { sweepMs: 300 });
  runtime = r;
  await r.startServing();
  r.templateImport(TEMPLATE, HTML);
  expect(await r.restore(retained())).toEqual({ restored: 1, skipped: [] });
  r.start();
  await r.whenServerHealthy(HEALTH_MS);
  await waitFor(() => status(r, 'item1') === 'unverified', 8000, 'refuses while deaf');

  // OSC starts arriving (the operator fixed casparcg.config). The mock can be
  // told to send to the port the bridge is actually listening on.
  mock.addOscObserver('127.0.0.1', deafPort);

  // The sweep now decides it: the layer is occupied, so it adopts and the item
  // reads ON AIR — and STILL nothing was sent for it.
  await waitFor(() => status(r, 'item1') === 'on-air', 10_000, 'recovers to ON AIR once heard');
  expect(mock.layerState(SLOT)?.onAir).toBe(true);
}, 40_000);

it('an operator action RETIRES a parked restore — a later decision cannot replay it', async () => {
  // The hole the refusal itself created: before it, every pending entry was consumed
  // on the first decision pass, so it could never go stale. Now an entry can sit
  // parked while the operator acts — and it still holds the RESTORE-TIME template,
  // fields and slot. Replaying that later would re-ADD (play-on-load 0) over a
  // producer the operator has since taken to air, and revert their field edits.
  const oscPort = await freeUdpPort();
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 40 });
  await orphanLiveProducer(mock, oscPort);

  const deafPort = await freeUdpPort();
  const r = new CasparRuntime(singleServer(mock.amcpPort, deafPort), undefined, { sweepMs: 300 });
  runtime = r;
  await r.startServing();
  r.templateImport(TEMPLATE, HTML);
  expect(await r.restore(retained())).toEqual({ restored: 1, skipped: [] });
  r.start();
  await r.whenServerHealthy(HEALTH_MS);
  await waitFor(() => status(r, 'item1') === 'unverified', 8000, 'refuses while deaf');

  // The operator acts on the row anyway (CLEAR is enabled for `unverified`).
  expect((await r.out('item1')).accepted).toBe(true);

  // OSC now starts arriving. The parked restore must NOT come back and re-decide
  // an item the operator has already commanded.
  mock.addOscObserver('127.0.0.1', deafPort);
  await delay(1500); // several sweep ticks

  // The operator's own command stands; the stale restore did not resurrect it,
  // and the row no longer carries the blind-tap marker.
  expect(status(r, 'item1')).not.toBe('unverified');
  expect(r.stackSnapshot().find((i) => i.itemId === 'item1')?.errorCode).not.toBe(
    'osc-unverifiable',
  );
}, 40_000);

it('while BLIND, no on-air claim is left confident — not even a non-restored item', async () => {
  // Skipping reconcileOnReconnect protects a live item from a false `idle`, but
  // `setLinkDown(false)` has just cleared the demotion that was covering every
  // played item — so without this they sit on a confident red ON AIR that nothing
  // can back, beside a green health pill. The verification channel is dead; the
  // honest answer is the same one B-086 gives when the link drops.
  const oscPort = await freeUdpPort();
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 40 });

  const deafPort = await freeUdpPort();
  const r = new CasparRuntime(singleServer(mock.amcpPort, deafPort));
  runtime = r;
  r.start();
  await r.startServing();
  r.templateImport(TEMPLATE, HTML);
  await r.whenServerHealthy(HEALTH_MS);

  // Loaded and taken in THIS session — never restored, so the restore path never
  // touches it. The tap is deaf throughout.
  expect((await r.load('item1', 'lower-third', { headline: 'سلام' })).accepted).toBe(true);
  await expect(mock.waitForCgAddResolution(SLOT)).resolves.toBe('resolved');
  expect((await r.take('item1')).accepted).toBe(true);

  // Force a reconnect cycle so the healthy transition runs with a blind tap.
  mock.closeAllAmcpConnections();
  await waitFor(() => r.health().primary.state !== 'healthy', 8000, 'drop observed');
  await waitFor(() => r.health().primary.state === 'healthy', 15_000, 'reconnect');

  await waitFor(() => status(r, 'item1') === 'unverified', 8000, 'demoted while blind');
  // Never the broadcast-red claim, and never a false idle either.
  expect(status(r, 'item1')).not.toBe('on-air');
  expect(status(r, 'item1')).not.toBe('playing');
  expect(status(r, 'item1')).not.toBe('idle');
}, 40_000);
