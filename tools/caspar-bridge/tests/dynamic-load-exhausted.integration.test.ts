import * as dgram from 'node:dgram';
import { afterEach, expect, it } from 'vitest';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import type { ConnectionConfig } from '@cg/shared-ipc';
import { CasparRuntime } from '../src/caspar-runtime.js';
import { HEALTH_MS } from './support/harness.js';

/**
 * R-028 part B — CONFIRMING the owner's observation, from the bridge's own
 * refusal reason rather than by assumption.
 *
 * What was seen: after reserving 60–69, a Load from the old Library produced a
 * stack item in `ERROR / no layer`.
 *
 * What is actually happening, and it is CORRECT-and-early rather than a bug:
 * `stack.load` resolves its layer by DYNAMIC allocation. `#allocate` passes the
 * templateId to `LayerManager.allocate`, which finds no policy range for it (a
 * template id is not a template TYPE), throws `UnknownTemplateTypeError`, and
 * falls back to the `custom` range — which the default policy puts at 60–69.
 * That is precisely the range now declared as the playout system's. Part A
 * fenced reserved layers out of allocation, so the range is exhausted by
 * construction and the load refuses with `no-layer`.
 *
 * The refusal is the fence working. The fix is NOT to widen the fence — it is
 * that no operator path should reach dynamic allocation at all any more, which
 * is what R-028's row surface does (every load is an exact-slot
 * `fixedLayers.load`) and what section 6 finishes by retiring the dynamic path.
 * A renderer-side test asserts the UI can no longer reach `stack.load`; this
 * one pins the bridge behaviour it used to reach.
 */

let mock: MockHandle | null = null;
let runtime: CasparRuntime | null = null;

const HTML = '<!doctype html><html><body>x</body></html>';

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

async function boot(reservedLayers: readonly number[]): Promise<CasparRuntime> {
  const oscPort = await freeUdpPort();
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 30 });
  runtime = new CasparRuntime(
    singleServer(mock.amcpPort, oscPort),
    {},
    { sweepMs: 150, occupancyStaleMs: 800, reservedLayers },
  );
  runtime.start();
  await runtime.startServing();
  runtime.templateImport(
    { templateId: 'tpl-uuid-1', templateType: 'lower-third', fields: [] },
    HTML,
  );
  await runtime.whenServerHealthy(HEALTH_MS);
  return runtime;
}

it('CONFIRMED — with the custom range (60–69) reserved, a dynamic stack.load refuses `no-layer`', async () => {
  const r = await boot([60, 61, 62, 63, 64, 65, 66, 67, 68, 69]);

  const result = await r.load('item-1', 'tpl-uuid-1', {});

  // The bridge's OWN reason, not an inference: the fallback range has nowhere
  // left to allocate because every layer in it belongs to playout.
  expect(result).toEqual({ accepted: false, errorCode: 'no-layer' });
  const item = r.stackSnapshot().find((i) => i.itemId === 'item-1');
  expect(item?.status).toBe('error');
  expect(item?.errorCode).toBe('no-layer');
});

it('…and the SAME load succeeds with nothing reserved — the reservation is the cause', async () => {
  const r = await boot([]);

  const result = await r.load('item-1', 'tpl-uuid-1', {});

  expect(result.accepted).toBe(true);
  // It landed in `custom` 60–69 — which is exactly why reserving that range
  // exhausts the only pool the dynamic path can reach.
  const slot = r.stackSnapshot().find((i) => i.itemId === 'item-1')?.slot;
  expect(slot?.layer).toBeGreaterThanOrEqual(60);
  expect(slot?.layer).toBeLessThanOrEqual(69);
});

it('the EXACT-SLOT path is unaffected — R-028 rows load onto their own declared layer', async () => {
  const oscPort = await freeUdpPort();
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 30 });
  runtime = new CasparRuntime(
    singleServer(mock.amcpPort, oscPort),
    {},
    {
      sweepMs: 150,
      occupancyStaleMs: 800,
      reservedLayers: [60, 61, 62, 63, 64, 65, 66, 67, 68, 69],
      fixedSlots: [70, 71].map((layer) => ({ channel: 1, layer })),
      fixedBank: { channel: 1, low: { start: 1, count: 9 }, start: 70, count: 2 },
    },
  );
  runtime.start();
  await runtime.startServing();
  runtime.templateImport(
    { templateId: 'tpl-uuid-1', templateType: 'lower-third', fields: [] },
    HTML,
  );
  await runtime.whenServerHealthy(HEALTH_MS);

  // The row's load never consults the policy ranges at all, so a reserved
  // `custom` range cannot starve it. This is why the new surface makes the
  // `no-layer` failure UNREACHABLE rather than merely invisible.
  const result = await runtime.loadFixed({ channel: 1, layer: 70 }, 'item-1', 'tpl-uuid-1', {});
  expect(result).toEqual({ accepted: true });
});
