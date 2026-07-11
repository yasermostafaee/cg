import * as dgram from 'node:dgram';
import { afterEach, expect, it } from 'vitest';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import { CasparRuntime } from '../src/caspar-runtime.js';
import type { ConnectionConfig } from '@cg/shared-ipc';

/**
 * REPRO (CI-deterministic failure of reconnect-reconciliation :133/:243) —
 * the B-064 forceful stop() can sever the mock's IN-FLIGHT template GET
 * when the bridge dies right after take; the mock then faithfully settles
 * the page 'failed' → onAir:false with producer still 'html'
 * (mock.ts completeCgAdd), silently deleting the ON-AIR ORPHAN the
 * reconnect fixtures depend on. The race is scheduling-dependent (loopback
 * headers usually win on a fast idle box, lose under CI contention), so
 * this repro runs the exact fixture shape in a tight loop and requires the
 * orphan to survive EVERY iteration.
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
    await r.whenServerHealthy(5000);

    // The reconnect fixtures' exact shape: load → take → IMMEDIATE death.
    expect((await r.load('item1', 'lower-third', {})).accepted).toBe(true);
    expect((await r.take('item1')).accepted).toBe(true);
    await r.stop();
    runtime = null;

    // Give the (possibly severed) GET time to settle either way.
    await new Promise((res) => setTimeout(res, 120));
    const layer = mock.layerState(SLOT);
    if (layer?.onAir !== true) failures.push(i);

    await mock.stop();
    mock = null;
  }
  // On failure the diff shows exactly which iterations lost the orphan.
  expect(failures).toEqual([]);
}, 120000);
