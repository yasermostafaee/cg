import * as dgram from 'node:dgram';
import { afterEach, expect, it } from 'vitest';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import { CasparRuntime } from '../src/caspar-runtime.js';
import type { ConnectionConfig, TemplateInfo } from '@cg/shared-ipc';
import { HEALTH_MS } from './support/harness.js';

/**
 * Clear-All against a real AMCP session: every ON-AIR item is CLEARed off the wire, and every
 * item STAYS on the stack.
 *
 * This is the invariant the whole feature exists for — "get it off the screen" is not "throw
 * it away". Remove-All empties the list, so recovering costs a re-import and re-typing every
 * field; Clear-All leaves the rows idle and re-takeable.
 *
 * It adds NO AMCP verb: it reuses the per-item `out()`, so the wire sees exactly the same
 * `CLEAR <ch>-<layer>` the row's own Clear button sends, with the same B-039 CLEAR-destroys
 * semantics (producer → empty, so a later take re-ADDs).
 */

let mock: MockHandle | null = null;
let runtime: CasparRuntime | null = null;

afterEach(async () => {
  // Released here, not on the last line of the test body: an assertion that throws must not
  // strand a bound socket for the rest of the fork.
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

const LOWER_THIRD: TemplateInfo = {
  templateId: 'lower-third',
  templateType: 'lower-third',
  fields: [],
};
const TICKER: TemplateInfo = { templateId: 'ticker', templateType: 'ticker', fields: [] };
const HTML = '<!doctype html><html><head><meta charset="utf-8"></head><body>سلام</body></html>';

it('clearAll CLEARs every on-air item and keeps them all on the stack, idle', async () => {
  const oscPort = await freeUdpPort();
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 40 });
  runtime = new CasparRuntime(connectionFor(mock.amcpPort, oscPort, await freeUdpPort()));
  runtime.start();
  await runtime.startServing();
  runtime.templateImport(LOWER_THIRD, HTML);
  runtime.templateImport(TICKER, HTML);
  await runtime.whenServerHealthy(HEALTH_MS);

  const lowerSlot = { channel: 1, layer: 10 }; // 'lower-third' policy range
  const tickerSlot = { channel: 1, layer: 20 }; // 'ticker' policy range

  // Two items on air, one merely loaded (CG ADD-ed, never PLAYed).
  await runtime.load('item-lower', 'lower-third', { headline: 'سلام' });
  await expect(mock.waitForCgAddResolution(lowerSlot)).resolves.toBe('resolved');
  await runtime.take('item-lower');

  await runtime.load('item-ticker', 'ticker', {});
  await expect(mock.waitForCgAddResolution(tickerSlot)).resolves.toBe('resolved');
  await runtime.take('item-ticker');

  await runtime.load('item-loaded', 'lower-third', {});

  expect(mock.layerState(lowerSlot)?.onAir).toBe(true);
  expect(mock.layerState(tickerSlot)?.onAir).toBe(true);

  // ── clearAll ──
  const result = await runtime.clearAll();
  expect(result).toEqual({ ok: true, cleared: 2 });

  // The WIRE: both on-air layers were CLEARed — the producer is destroyed, exactly as a
  // per-item Clear does. No new verb reached CasparCG.
  expect(mock.layerState(lowerSlot)?.producer).toBe('empty');
  expect(mock.layerState(lowerSlot)?.onAir).toBe(false);
  expect(mock.layerState(tickerSlot)?.producer).toBe('empty');
  expect(mock.layerState(tickerSlot)?.onAir).toBe(false);

  // The STACK: nothing was dropped. That is the whole difference from removeAll.
  const stack = runtime.stackSnapshot();
  expect(stack.map((i) => i.itemId).sort()).toEqual(['item-loaded', 'item-lower', 'item-ticker']);

  // The merely-loaded item was never on air, so it was left alone — still ready to take.
  expect(stack.find((i) => i.itemId === 'item-loaded')?.status).toBe('loaded');

  // …and a cleared item can be taken again: the CLEAR destroyed the producer, not the row,
  // so the retake re-ADDs (empty → html) and renders.
  expect((await runtime.take('item-lower')).accepted).toBe(true);
  expect(mock.layerState(lowerSlot)?.producer).toBe('html');
  await expect(mock.waitForCgAddResolution(lowerSlot)).resolves.toBe('resolved');
  expect(mock.layerState(lowerSlot)?.onAir).toBe(true);
});

it('clearAll is a no-op when nothing is on air', async () => {
  const oscPort = await freeUdpPort();
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 40 });
  runtime = new CasparRuntime(connectionFor(mock.amcpPort, oscPort, await freeUdpPort()));
  runtime.start();
  await runtime.startServing();
  runtime.templateImport(LOWER_THIRD, HTML);
  await runtime.whenServerHealthy(HEALTH_MS);

  await runtime.load('item-loaded', 'lower-third', {});

  expect(await runtime.clearAll()).toEqual({ ok: true, cleared: 0 });
  // Untouched: a loaded item has nothing on air to clear, and is not knocked back to idle.
  expect(runtime.stackSnapshot().find((i) => i.itemId === 'item-loaded')?.status).toBe('loaded');
});
