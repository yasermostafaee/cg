import * as dgram from 'node:dgram';
import { afterEach, expect, it } from 'vitest';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import { CasparRuntime } from '../src/caspar-runtime.js';
import type { ConnectionConfig, TemplateInfo } from '@cg/shared-ipc';
import type { StackItemStatus } from '@cg/shared-schema';
import { HEALTH_MS } from './support/harness.js';

/**
 * B-086 — honest ON AIR across a CasparCG link-loss (end-to-end, real bridge + mock CasparCG).
 *
 * On the link dropping (the CURRENT-PRIMARY session leaving `healthy`), an on-air item must
 * re-publish as the muted `unverified` — never the red `on-air`/`playing` the wire no longer
 * backs. On reconnect it reconciles against real OSC: a still-occupied layer restores ON AIR
 * (a transient blip — the producer survived); a silent/empty layer resets to IDLE (a restart —
 * the producer is gone). The on-air REFUSAL (#noServerReachable on take/update/out) is unchanged.
 */

let mock: MockHandle | null = null;
let runtime: CasparRuntime | null = null;

afterEach(async () => {
  await runtime?.stop();
  runtime = null;
  await mock?.stop();
  mock = null;
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
const SLOT = { channel: 1, layer: 10 }; // 'lower-third' policy slot

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function waitFor(cond: () => boolean, timeoutMs: number, what: string): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!cond()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await delay(25);
  }
}

async function bootRuntime(config: ConnectionConfig): Promise<CasparRuntime> {
  const r = new CasparRuntime(config);
  runtime = r;
  r.start();
  await r.startServing();
  r.templateImport(TEMPLATE, HTML);
  await r.whenServerHealthy(HEALTH_MS);
  return r;
}

function status(r: CasparRuntime, itemId: string): StackItemStatus | undefined {
  return r.stackSnapshot().find((i) => i.itemId === itemId)?.status;
}

/** Load + take `item1` and wait until the reconciler reads a real OSC-backed ON AIR. */
async function takeOnAir(r: CasparRuntime): Promise<void> {
  expect((await r.load('item1', 'lower-third', { headline: 'سلام' })).accepted).toBe(true);
  await expect(mock?.waitForCgAddResolution(SLOT)).resolves.toBe('resolved');
  expect((await r.take('item1')).accepted).toBe(true);
  await waitFor(() => status(r, 'item1') === 'on-air', 5000, 'item reaches ON AIR');
}

it('a CasparCG restart: ON AIR → UNVERIFIED on the drop, → IDLE on reconnect (producer gone)', async () => {
  const oscPort = await freeUdpPort();
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 40 });
  const r = await bootRuntime(singleServer(mock.amcpPort, oscPort));
  await takeOnAir(r);

  // ── the link drops (CasparCG dies) ──
  const amcpPort = mock.amcpPort;
  const dying = mock;
  mock = null; // never double-stop in afterEach
  await dying.stop();

  // The honest broadcast-safety property: the badge stops claiming ON AIR.
  await waitFor(() => r.health().primary.state !== 'healthy', 4000, 'drop observed');
  await waitFor(() => status(r, 'item1') === 'unverified', 4000, 'item goes UNVERIFIED');
  // …and it is NOT a red claim, NOT forced idle.
  expect(status(r, 'item1')).toBe('unverified');

  // ── CasparCG comes back EMPTY (restart) ──
  mock = await createMock({ amcpPort, oscPort, oscHost: '127.0.0.1', oscHz: 40 });
  await waitFor(() => r.health().primary.state === 'healthy', 10_000, 'session reconnect');
  expect(mock.layerState(SLOT)).toBeUndefined(); // genuinely empty

  // The layer is silent → the producer is gone → reset to IDLE (not a resurrected ON AIR).
  await waitFor(() => status(r, 'item1') === 'idle', 5000, 'empty layer resets to IDLE');
  expect(status(r, 'item1')).toBe('idle');
}, 25_000);

it('a transient blip: ON AIR → UNVERIFIED on the drop, → restored ON AIR on reconnect (producer survived)', async () => {
  const oscPort = await freeUdpPort();
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 40 });
  const r = await bootRuntime(singleServer(mock.amcpPort, oscPort));
  await takeOnAir(r);

  // ── TCP reset; the SAME server keeps its producer ──
  mock.closeAllAmcpConnections();
  await waitFor(() => r.health().primary.state !== 'healthy', 4000, 'blip observed');
  await waitFor(() => status(r, 'item1') === 'unverified', 4000, 'item goes UNVERIFIED');

  // On reconnect the producer is still there — resumed OSC restores ON AIR, no operator action.
  await waitFor(() => r.health().primary.state === 'healthy', 10_000, 'session reconnect');
  expect(mock.layerState(SLOT)?.onAir).toBe(true); // producer survived the blip
  await waitFor(() => status(r, 'item1') === 'on-air', 5000, 'restored to ON AIR');
  expect(status(r, 'item1')).toBe('on-air');
}, 25_000);

it('FROZEN: while no server is reachable, take/update/out are still REFUSED (#noServerReachable, R-006)', async () => {
  const oscPort = await freeUdpPort();
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 40 });
  const r = await bootRuntime(singleServer(mock.amcpPort, oscPort));
  await takeOnAir(r);

  const dying = mock;
  mock = null;
  await dying.stop();
  await waitFor(() => r.health().primary.state !== 'healthy', 4000, 'drop observed');

  // The display honesty does NOT change what a command does: the wire is unreachable, so the
  // on-air verbs stay refused with `disconnected` — exactly as before B-086.
  expect(await r.take('item1')).toEqual({ accepted: false, errorCode: 'disconnected' });
  expect(await r.out('item1')).toEqual({ accepted: false, errorCode: 'disconnected' });
  const upd = await r.update('item1', { headline: 'x' }, 'merge');
  expect(upd).toEqual({ accepted: false, errorCode: 'disconnected' });
}, 25_000);
