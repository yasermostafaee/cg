import * as dgram from 'node:dgram';
import { afterEach, expect, it } from 'vitest';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import { CasparRuntime } from '../src/caspar-runtime.js';
import type { ConnectionConfig, TemplateInfo } from '@cg/shared-ipc';

/**
 * B-038 Phase 3 — the regression that hid B-038, closed end-to-end. The bridge
 * serves the retained template HTML over HTTP and `CG ADD`s that real URL with the
 * item's real fields; the hardened `amcp-mock` RESOLVES the URL (404 on an
 * unresolvable reference) and exposes the data payload. This asserts a `.vcg`
 * would actually render — not just that commands were acked.
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

// templateId is also the slot-allocation key; 'lower-third' maps to a known
// policy range (channel 1, layer 10) so the served slot is deterministic. (A real
// manifest UUID falls back to the 'custom' range — exercised by the existing
// integration tests.)
const TEMPLATE: TemplateInfo = {
  templateId: 'lower-third',
  templateType: 'lower-third',
  fields: [],
};
// A real, self-contained-ish page (the produced HTML in production); enough that
// an HTTP GET returns 200 so the mock resolves the CG ADD reference.
const HTML = '<!doctype html><html><head><meta charset="utf-8"></head><body>سلام</body></html>';

it('serves the template URL, CG ADDs it with real Persian fields, and CG UPDATE carries data', async () => {
  const oscPort = await freeUdpPort();
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 40 });
  runtime = new CasparRuntime(connectionFor(mock.amcpPort, oscPort, await freeUdpPort()));
  runtime.start();
  await runtime.startServing();
  runtime.templateImport(TEMPLATE, HTML);
  await runtime.whenServerHealthy(5000);

  const slot = { channel: 1, layer: 10 };
  const fields = { headline: 'خبر فوری', ticker: 'اخبار' };

  // ── load → CG ADD references the SERVED URL with REAL fields (not "{}") ──
  const loaded = await runtime.load('item1', 'lower-third', fields);
  expect(loaded.accepted).toBe(true);
  expect(mock.layerState(slot)?.producer).toBe('html');

  const add = mock.lastCgAdd(slot);
  // The CG ADD template arg is the served /template/<id> URL the mock could fetch.
  expect(add?.template).toBe(runtime.templateServeUrl('lower-third'));
  expect(add?.template).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/template\/lower-third$/);
  // …and the data arg is the REAL field JSON (Persian intact), never "{}".
  expect(add?.data).not.toBe('{}');
  expect(JSON.parse(add?.data ?? '{}')).toEqual(fields);

  // ── take → CG PLAY acked ──
  expect((await runtime.take('item1')).accepted).toBe(true);

  // ── update → CG UPDATE carries the operator's edited (merged) fields ──
  const updated = await runtime.update('item1', { headline: 'به‌روزرسانی زنده' }, 'merge');
  expect(updated.accepted).toBe(true);
  const upd = mock.lastCgUpdate(slot);
  expect(JSON.parse(upd?.data ?? '{}')).toMatchObject({
    headline: 'به‌روزرسانی زنده',
    ticker: 'اخبار',
  });
});

it('a load of an UNREGISTERED template 404s (the bridge serves nothing for it)', async () => {
  const oscPort = await freeUdpPort();
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 40 });
  runtime = new CasparRuntime(connectionFor(mock.amcpPort, oscPort, await freeUdpPort()));
  runtime.start();
  await runtime.startServing();
  await runtime.whenServerHealthy(5000);

  // No templateImport → the bridge's /template/<id> returns 404 → the mock cannot
  // resolve the CG ADD reference → load is rejected (this is the B-038 failure mode
  // the regression test now CATCHES instead of blind-acking). The exact slot is in
  // the 'custom' fallback range; the load being rejected is the signal that matters.
  const loaded = await runtime.load('item-x', 'never-imported', { a: 1 });
  expect(loaded.accepted).toBe(false);
});
