import * as dgram from 'node:dgram';
import { afterEach, expect, it } from 'vitest';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import { CasparRuntime } from '../src/caspar-runtime.js';
import type { ConnectionConfig } from '@cg/shared-ipc';
import { HEALTH_MS } from './support/harness.js';

/**
 * REGRESSION canary (CI failure of reconnect-reconciliation :133/:243) —
 * the B-064 forceful stop() severed the mock's IN-FLIGHT template GET when
 * the bridge died right after take: a socket joins stop()'s #busy set only
 * once Node fires 'request', so request bytes ARRIVED but not yet parsed
 * (an event-loop-lag window, contention-scaled) were instantly destroyed →
 * ECONNRESET → the mock faithfully settles the page 'failed' → onAir:false
 * with producer still 'html' (mock.ts completeCgAdd), silently deleting the
 * ON-AIR ORPHAN the reconnect fixtures depend on. stop() now defers the whole
 * teardown (including `server.close()`, which itself reaps "idle" sockets on
 * Node ≥19) one full event-loop iteration, so an arrived fetch always joins
 * #busy and flushes within the grace; this loop runs the exact fixture shape
 * and requires the orphan to survive EVERY iteration.
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

const SLOT = { channel: 1, layer: 10 };
const ITERATIONS = 25;

it(`the orphan survives a bridge death racing the template fetch — ${String(ITERATIONS)}/${String(ITERATIONS)} iterations`, async () => {
  const failures: number[] = [];
  for (let i = 0; i < ITERATIONS; i++) {
    const oscPort = await freeUdpPort();
    mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 40 });
    const config: ConnectionConfig = {
      servers: { A: { host: '127.0.0.1', amcpPort: mock.amcpPort, oscPort } },
      strategy: 'mirror-sync',
      autoFailoverEnabled: true,
    };
    const r = new CasparRuntime(config);
    runtime = r;
    r.start();
    await r.startServing();
    r.templateImport(
      { templateId: 'lower-third', templateType: 'lower-third', fields: [] },
      '<!doctype html><html><body>x</body></html>',
    );
    await r.whenServerHealthy(HEALTH_MS);

    // The reconnect fixtures' exact shape: load → take → IMMEDIATE death.
    expect((await r.load('item1', 'lower-third', {})).accepted).toBe(true);
    expect((await r.take('item1')).accepted).toBe(true);
    await r.stop();
    runtime = null;

    // Deterministic settle barrier (either verdict) — a fixed sleep can read
    // the layer while the GET verdict is still pending under contention.
    await mock.waitForCgAddResolution(SLOT);
    const layer = mock.layerState(SLOT);
    if (layer?.onAir !== true) failures.push(i);

    await mock.stop();
    mock = null;
  }
  // On failure the diff shows exactly which iterations lost the orphan.
  expect(failures).toEqual([]);
  // Budget covers the legitimate per-iteration worst case (5s healthy deadline
  // + acked round-trips + the 2.5s settle barrier) × 25 under contention.
}, 240000);
