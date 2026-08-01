import * as dgram from 'node:dgram';
import { afterEach, expect, it } from 'vitest';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import { AmcpTransport, CommandQueue } from '@cg/caspar-client';
import type { ConnectionConfig } from '@cg/shared-ipc';
import { CasparRuntime } from '../src/caspar-runtime.js';
import { HEALTH_MS } from './support/harness.js';

/**
 * R-028 part B — the DELIBERATE playout clear, and everything it must refuse.
 *
 * This is the safety surface of the change: the tab can take the playout
 * system's graphics off air. The bridge holds the gate INDEPENDENTLY of the UI
 * (hiding a control is courtesy; refusing is the guarantee), so every refusal
 * is pinned here against a real AMCP mock and a real OSC occupancy tap.
 *
 * The premise the gate rests on was verified against the station's running
 * CasparCG 2.3.2 during this change: producer kind IS legible for layers this
 * process did not create. See `playoutLayers.ts` for the evidence.
 */

let mock: MockHandle | null = null;
let runtime: CasparRuntime | null = null;
let foreignQueue: CommandQueue | null = null;
let foreignTransport: AmcpTransport | null = null;

const SWEEP_MS = 150;
const STALE_MS = 800;
const RESERVED = [60, 61, 62];

afterEach(async () => {
  foreignQueue?.dispose();
  foreignQueue = null;
  foreignTransport?.destroy();
  foreignTransport = null;
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

async function boot(): Promise<CasparRuntime> {
  const oscPort = await freeUdpPort();
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 30 });
  runtime = new CasparRuntime(
    singleServer(mock.amcpPort, oscPort),
    {},
    { sweepMs: SWEEP_MS, occupancyStaleMs: STALE_MS, reservedLayers: RESERVED },
  );
  runtime.start();
  await runtime.startServing();
  return runtime;
}

async function foreignPlay(target: MockHandle, line: string): Promise<void> {
  if (foreignTransport === null) {
    foreignTransport = new AmcpTransport();
    await foreignTransport.connect(target.host, target.amcpPort);
    foreignQueue = new CommandQueue(foreignTransport);
  }
  await foreignQueue?.enqueue(line);
}

async function waitFor(predicate: () => boolean, timeoutMs = 8000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timed out');
    await new Promise((r) => setTimeout(r, 25));
  }
}

it('reports every declared playout layer, and unknown BEFORE the tap is hearing', async () => {
  const r = await boot();
  const early = r.playoutLayersState();
  expect(early.map((l) => l.layer)).toEqual(RESERVED);
  // Never `empty` before the tap can see: unknown is its own state.
  expect(early.every((l) => l.observed.kind === 'unknown')).toBe(true);
});

it('an html occupant on a reserved layer IS clearable, and the clear reaches the wire', async () => {
  const r = await boot();
  if (mock === null) throw new Error('mock not booted');
  await r.whenServerHealthy(HEALTH_MS);
  await foreignPlay(mock, 'PLAY 1-60 "playout-lower-third" HTML');
  await waitFor(() =>
    r.playoutLayersState().some((l) => l.layer === 60 && l.observed.kind === 'producer'),
  );

  expect(await r.playoutClear(1, 60)).toEqual({ ok: true });
});

it('a NON-html occupant is REFUSED, naming the kind — the antenna/live-feed guard', async () => {
  const r = await boot();
  if (mock === null) throw new Error('mock not booted');
  await r.whenServerHealthy(HEALTH_MS);
  // A video on a playout layer: the playout team's own mistake is exactly the
  // case the reservation exists to protect, so the CG operator must not be able
  // to clear it — from the tab or from anywhere else.
  await foreignPlay(mock, 'PLAY 1-61 "program-feed.mov"');
  await waitFor(() =>
    r.playoutLayersState().some((l) => l.layer === 61 && l.observed.kind === 'producer'),
  );

  const refused = await r.playoutClear(1, 61);
  expect(refused.ok).toBe(false);
  expect(refused.reason).toBe('not-html');
  expect(refused.observedProducer).toBe('ffmpeg');
  // …and nothing was sent: the producer is still there on the next sample.
  await new Promise((res) => setTimeout(res, SWEEP_MS * 2));
  expect(r.playoutLayersState().find((l) => l.layer === 61)?.observed).toEqual({
    kind: 'producer',
    producer: 'ffmpeg',
  });
});

it('an UNVERIFIABLE layer is REFUSED — a gate that cannot read its input never guesses', async () => {
  const r = await boot();
  // Before the session is healthy the tap has never heard: occupancy is
  // unknown, and unknown refuses rather than being treated as empty.
  const blind = await r.playoutClear(1, 60);
  expect(blind.ok).toBe(false);
  expect(blind.reason).toBe('unknown-occupancy');

  // A hearing tap with nothing on the layer also refuses — but with its OWN
  // reason: there is nothing to clear, and reporting ok would claim an act
  // that never happened. `already-empty` is asserted in its own test below;
  // what matters here is that it is NOT confused with being unable to see.
  await r.whenServerHealthy(HEALTH_MS);
  await waitFor(() => r.playoutLayersState().every((l) => l.observed.kind === 'empty'));
  const empty = await r.playoutClear(1, 60);
  expect(empty.ok).toBe(false);
  expect(empty.reason).not.toBe('unknown-occupancy');
});

it('a layer OUTSIDE the declared reserved set is refused — this is not a clear-anything door', async () => {
  const r = await boot();
  await r.whenServerHealthy(HEALTH_MS);
  const refused = await r.playoutClear(1, 45);
  expect(refused).toEqual({ ok: false, reason: 'not-reserved' });
});

it('part A stands: the orphan sweep still excludes reserved layers and layers.clear still refuses them', async () => {
  const r = await boot();
  if (mock === null) throw new Error('mock not booted');
  await r.whenServerHealthy(HEALTH_MS);
  await foreignPlay(mock, 'PLAY 1-60 "playout-lower-third" HTML');
  await foreignPlay(mock, 'PLAY 1-45 "stray" HTML');
  await waitFor(() => r.orphans().some((o) => o.layer === 45));
  await new Promise((res) => setTimeout(res, SWEEP_MS * 3));

  // The AUTOMATIC surface never invites the operator to reclaim playout output…
  expect(r.orphans().some((o) => o.layer === 60)).toBe(false);
  // …and the orphan banner's own clear still refuses reserved layers outright.
  expect(await r.clearLayer(1, 60)).toEqual({ ok: false, reason: 'reserved' });
  // Only the deliberate, kind-gated tab channel may act.
  expect(await r.playoutClear(1, 60)).toEqual({ ok: true });
});

it('publishes the playout state only when it CHANGES', async () => {
  const r = await boot();
  if (mock === null) throw new Error('mock not booted');
  await r.whenServerHealthy(HEALTH_MS);
  await waitFor(() => r.playoutLayersState().every((l) => l.observed.kind === 'empty'));
  await new Promise((res) => setTimeout(res, SWEEP_MS * 2));

  let publishes = 0;
  r.playoutStateChanged.subscribe(() => publishes++);
  await new Promise((res) => setTimeout(res, SWEEP_MS * 4));
  expect(publishes).toBe(0);

  await foreignPlay(mock, 'PLAY 1-62 "graphic" HTML');
  await waitFor(() => publishes >= 1);
  await new Promise((res) => setTimeout(res, SWEEP_MS * 4));
  expect(publishes).toBe(1);
});

it('an EMPTY layer is refused as already-empty, NOT as unverifiable', async () => {
  const r = await boot();
  await r.whenServerHealthy(HEALTH_MS);
  await waitFor(() => r.playoutLayersState().every((l) => l.observed.kind === 'empty'));
  // "I looked and found nothing" must never be reported as "I cannot see":
  // they are opposite statements about our knowledge, and the alarming one
  // must not be shown when the calm one is true.
  expect(await r.playoutClear(1, 60)).toEqual({ ok: false, reason: 'already-empty' });
});

/**
 * REGRESSION GUARD (adversarial review, part B) — the playout state MUST be
 * published from the sweep BEFORE its `state !== 'healthy'` early return.
 *
 * The bug: published after the guard, a CasparCG outage stopped the publishes
 * entirely, so the tab kept serving the last "Graphic on air (html)" snapshot
 * with an ENABLED CLEAR the bridge could only refuse — unverifiable occupancy
 * displayed as verified, plus an enabled control that can only reject.
 *
 * Asserted on the SOURCE because the alternative is a timing race against the
 * session's reconnect backoff, and a flaky guard on a safety property is worse
 * than a precise one. The fixed-slot publish has sat before that guard since
 * R-021 for exactly this reason; this pins that the playout publish stays
 * beside it.
 */
it('the playout publish sits BEFORE the healthy guard, beside the fixed-slot publish', async () => {
  const src = await import('node:fs').then((fs) =>
    fs.readFileSync(new URL('../src/caspar-runtime.ts', import.meta.url), 'utf8'),
  );
  const sweep = src.slice(src.indexOf('#sweepOccupancy(): void {'));
  const playoutPublish = sweep.indexOf('#publishPlayoutStateIfChanged()');
  const fixedPublish = sweep.indexOf('#publishFixedStateIfChanged()');
  const guard = sweep.indexOf("if (session.state !== 'healthy') return;");
  expect(playoutPublish).toBeGreaterThan(-1);
  expect(guard).toBeGreaterThan(-1);
  expect(fixedPublish).toBeLessThan(guard);
  expect(playoutPublish).toBeLessThan(guard);
});
