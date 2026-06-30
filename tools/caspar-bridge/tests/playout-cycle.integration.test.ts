import * as dgram from 'node:dgram';
import { afterEach, expect, it } from 'vitest';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import { CasparRuntime } from '../src/caspar-runtime.js';
import type { ConnectionConfig, TemplateInfo } from '@cg/shared-ipc';

/**
 * B-039 — the playout state model is PRESCRIPTIVE: the bridge chooses CG ADD vs
 * CG PLAY from actual producer state. Drives the full live cycle against the
 * producer-lifecycle-aware mock and proves: load does NOT auto-play; take plays;
 * out destroys the producer; a take AFTER out re-ADDs (empty→html) then plays and
 * renders again — the exact regression real CasparCG exposed and the blind-ack hid.
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

function connectionFor(amcpPort: number, oscPort: number, oscPortB: number): ConnectionConfig {
  return {
    servers: {
      A: { host: '127.0.0.1', amcpPort, oscPort },
      B: { host: '127.0.0.1', amcpPort, oscPort: oscPortB },
    },
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

it('load→take→out→take: load does not auto-play, out destroys, retake re-ADDs and renders', async () => {
  const oscPort = await freeUdpPort();
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 40 });
  runtime = new CasparRuntime(connectionFor(mock.amcpPort, oscPort, await freeUdpPort()));
  runtime.start();
  await runtime.startServing();
  runtime.templateImport(TEMPLATE, HTML);
  await runtime.whenServerHealthy(5000);

  const slot = { channel: 1, layer: 10 }; // 'lower-third' policy slot

  // ── load → CG ADD only (play-on-load OFF): producer LOADED, NOT playing ──
  expect((await runtime.load('item1', 'lower-third', { headline: 'سلام' })).accepted).toBe(true);
  expect(mock.layerState(slot)?.producer).toBe('html');
  expect(mock.layerState(slot)?.onAir).toBe(false); // <- did NOT auto-play

  // ── take → CG PLAY: now on air ──
  expect((await runtime.take('item1')).accepted).toBe(true);
  expect(mock.layerState(slot)?.onAir).toBe(true);

  // ── out → CLEAR: the producer is DESTROYED ──
  expect((await runtime.out('item1')).accepted).toBe(true);
  expect(mock.layerState(slot)?.producer).toBe('empty');
  expect(mock.layerState(slot)?.onAir).toBe(false);

  // ── take AGAIN → the bridge sees no producer, re-ADDs (empty→html) THEN plays ──
  // (a bare CG PLAY here would be a no-op on the empty layer — the B-039 bug).
  expect((await runtime.take('item1')).accepted).toBe(true);
  expect(mock.layerState(slot)?.producer).toBe('html'); // re-ADDed: only CG ADD recreates the producer
  expect(mock.layerState(slot)?.onAir).toBe(true); // …and it renders again
});

it('a fresh take (item loaded but never played) plays without auto-play on load', async () => {
  const oscPort = await freeUdpPort();
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 40 });
  runtime = new CasparRuntime(connectionFor(mock.amcpPort, oscPort, await freeUdpPort()));
  runtime.start();
  await runtime.startServing();
  runtime.templateImport(TEMPLATE, HTML);
  await runtime.whenServerHealthy(5000);

  const slot = { channel: 1, layer: 10 };
  await runtime.load('item1', 'lower-third', {});
  // Loaded, idle on the wire — nothing on air until take.
  expect(mock.layerState(slot)?.onAir).toBe(false);
  await runtime.take('item1');
  expect(mock.layerState(slot)?.onAir).toBe(true);
});
