import * as dgram from 'node:dgram';
import { afterEach, expect, it } from 'vitest';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import { CasparRuntime } from '../src/caspar-runtime.js';
import type { ConnectionConfig, TemplateInfo } from '@cg/shared-ipc';
import { HEALTH_MS } from './support/harness.js';

/**
 * B-094 — the health snapshot must distinguish "this server is down" from "this
 * server is fine but I cannot hear it".
 *
 * They are identical on the AMCP axis and call for OPPOSITE remedies: one is a
 * CasparCG config fix, the other is a dead server. The operator's install was the
 * second-looking-like-the-first — a `predefined-client` on the wrong port — and the
 * UI showed a confident green HEALTHY, then DEGRADED, which reads as "the server is
 * down" and sends someone to restart a box that is working.
 *
 * `oscFreshAt` carries the distinction. It is populated from the SAME
 * source-filtered signal B-093's restore guard reads, so there is one source of
 * truth, not two that can disagree.
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
    autoFailoverEnabled: false,
  };
}

const TEMPLATE: TemplateInfo = {
  templateId: 'lower-third',
  templateType: 'lower-third',
  fields: [],
};

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function waitFor(cond: () => boolean, timeoutMs: number, what: string): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!cond()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await delay(25);
  }
}

it('OSC flowing: health reports when the server was last heard', async () => {
  const oscPort = await freeUdpPort();
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 40 });
  const r = new CasparRuntime(singleServer(mock.amcpPort, oscPort));
  runtime = r;
  r.start();
  await r.whenServerHealthy(HEALTH_MS);

  await waitFor(() => r.health().primary.oscFreshAt !== undefined, 8000, 'OSC heard');
  const at = r.health().primary.oscFreshAt;
  expect(at).toBeDefined();
  expect(Number.isNaN(Date.parse(at ?? ''))).toBe(false); // a real ISO timestamp
  expect(r.health().primary.state).toBe('healthy');
}, 30_000);

it('AMCP answering but OSC never arrives: HEALTHY with no oscFreshAt — the mis-attributed case', async () => {
  // The install shape: AMCP is perfect, OSC goes to a port nobody is listening on.
  const oscPort = await freeUdpPort();
  const deafPort = await freeUdpPort();
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 40 });
  const r = new CasparRuntime(singleServer(mock.amcpPort, deafPort));
  runtime = r;
  r.start();
  await r.startServing();
  r.templateImport(TEMPLATE, '<html></html>');
  await r.whenServerHealthy(HEALTH_MS);

  // The server is genuinely answering — a load is accepted…
  expect((await r.load('item1', 'lower-third', {})).accepted).toBe(true);
  // …and health says HEALTHY on the AMCP axis, with NOTHING heard on OSC. That
  // conjunction is what the indicator renders, and it is only expressible because
  // the two axes are reported separately.
  const h = r.health();
  expect(h.primary.state).toBe('healthy');
  expect(h.primary.amcpAxisOk).toBe(true);
  expect(h.primary.oscFreshAt).toBeUndefined();
}, 30_000);

it('an idle-but-healthy server still counts as HEARD — no per-layer producers needed', async () => {
  // The false-positive this must never produce. Verified on real CasparCG 2.3.2: a
  // channel whose layers are all empty emits NO per-layer producer messages, only
  // channel-level ones. If the signal were derived from producer observations, a
  // perfectly healthy idle server would look deaf and the indicator would cry wolf
  // on every install between shows.
  const oscPort = await freeUdpPort();
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 40 });
  const r = new CasparRuntime(singleServer(mock.amcpPort, oscPort));
  runtime = r;
  r.start();
  await r.whenServerHealthy(HEALTH_MS);

  // Nothing has ever been loaded — no layer holds a producer.
  expect(r.stackSnapshot()).toEqual([]);
  await waitFor(() => r.health().primary.oscFreshAt !== undefined, 8000, 'idle server heard');
  expect(r.health().primary.oscFreshAt).toBeDefined();
}, 30_000);

it('the signal clears and re-publishes on its own once OSC starts arriving', async () => {
  // Health is otherwise emitted only on adapter/failover/setConfig events, so
  // without the sweep re-publish the indicator would appear or clear only when
  // something unrelated happened to change.
  const oscPort = await freeUdpPort();
  const deafPort = await freeUdpPort();
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 40 });
  const r = new CasparRuntime(singleServer(mock.amcpPort, deafPort), undefined, { sweepMs: 300 });
  runtime = r;

  const published: (string | undefined)[] = [];
  r.healthChanged.subscribe((h) => published.push(h.primary.oscFreshAt));

  r.start();
  await r.whenServerHealthy(HEALTH_MS);
  expect(r.health().primary.oscFreshAt).toBeUndefined();

  // The operator fixes casparcg.config: OSC starts arriving at the bridge's port.
  mock.addOscObserver('127.0.0.1', deafPort);

  await waitFor(() => r.health().primary.oscFreshAt !== undefined, 10_000, 'OSC starts arriving');
  // …and it was PUBLISHED, not merely observable on demand.
  await waitFor(() => published.some((v) => v !== undefined), 10_000, 'health re-published');
}, 30_000);
