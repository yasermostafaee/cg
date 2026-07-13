import * as dgram from 'node:dgram';
import { afterEach, expect, it } from 'vitest';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import { CasparRuntime } from '../src/caspar-runtime.js';
import type { ConnectionConfig } from '@cg/shared-ipc';
import { HEALTH_MS } from './support/harness.js';

/**
 * B-046 — declared single-server operation. The operator's default is ONE
 * local CasparCG; the config declares no backup, so the redundancy machinery
 * must be inert: `whenServerHealthy()` resolves on A alone (the old
 * both-sessions contract could never resolve), playout works, health carries
 * no backup entry, manual failover is refused, and the steady state publishes
 * no health churn.
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

it('single-server: healthy on A alone, playout works, no backup in health, failover refused, no churn', async () => {
  const oscPort = await freeUdpPort();
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 30 });
  runtime = new CasparRuntime(singleServer(mock.amcpPort, oscPort));
  runtime.start();
  await runtime.startServing();
  runtime.templateImport(
    { templateId: 'lower-third', templateType: 'lower-third', fields: [] },
    '<!doctype html><html><body>served</body></html>',
  );

  // The B-046 footgun: with the old both-sessions contract this could never
  // resolve without a phantom backup connecting.
  await runtime.whenServerHealthy(HEALTH_MS);

  const health = runtime.health();
  expect(health.currentPrimary).toBe('A');
  expect(health.primary.state).toBe('healthy');
  expect(health.backup).toBeUndefined();

  // Playout drives the single primary.
  expect((await runtime.load('item1', 'lower-third', {})).accepted).toBe(true);
  expect((await runtime.take('item1')).accepted).toBe(true);

  // Nothing to fail over to — refused, primary unchanged.
  const failover = await runtime.failover();
  expect(failover.ok).toBe(false);
  expect(failover.newPrimary).toBe('A');
  expect(runtime.health().lastFailover).toBeUndefined();

  // Steady state is QUIET: no reconnect-looping phantom session publishing
  // unchanged health ~2×/cycle (the B-046 churn).
  //
  // The property is asserted on the VALUE of what was published, never on a
  // count of events inside a wall-clock window. The old `publishes === 0` after
  // a 1.5 s sleep also encoded "and this fork is scheduled promptly": a starved
  // fork lets the OSC stream go stale, HONESTLY flaps A to 'degraded' and back,
  // and that state-CHANGING publish reddened the test for something it never
  // meant to assert. The churn's signature is the exact opposite — a REDUNDANT
  // publish: the phantom backup never appears in a single-server snapshot, so
  // its reconnect loop re-emits an IDENTICAL ConnectionHealth. That value is
  // pure (label/state/currentPrimary/strategy — no timestamps, no counters), so
  // "identical to the previously published snapshot" is an exact comparison, not
  // a tolerance. The window now bounds only how much evidence we gather; it can
  // no longer decide the verdict.
  const redundant: string[] = [];
  let last = JSON.stringify(runtime.health());
  const off = runtime.healthChanged.subscribe((next) => {
    const published = JSON.stringify(next);
    if (published === last) redundant.push(published); // a no-op publish IS the churn
    last = published;
  });
  await new Promise((r) => setTimeout(r, 1500));
  off();
  expect(redundant).toEqual([]);

  // …and the declared session converged back to HEALTHY with still no backup:
  // a starvation blip is transient, a phantom reconnect loop would not be.
  await runtime.whenServerHealthy(HEALTH_MS);
  expect(runtime.health().backup).toBeUndefined();
}, 20000);
