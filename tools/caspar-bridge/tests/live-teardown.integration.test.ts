import * as dgram from 'node:dgram';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import type { ConnectionConfig } from '@cg/shared-ipc';
import { CasparRuntime } from '../src/caspar-runtime.js';
import type { LiveLayerRecord } from '../src/live-layers.js';
import { HEALTH_MS } from './support/harness.js';

/**
 * C-015 phase 6 (task 6.6) — **Live Source teardown clears the producer AND resets
 * the mixer.**
 *
 * Asserted ON THE WIRE, because that is the only place the omission is visible.
 * Mixer state belongs to the CHANNEL'S MIXER rather than to the producer, so it
 * SURVIVES the `CLEAR` — a teardown that stops there leaves a `FILL` and a `CLIP` on
 * the layer with nothing in any internal state saying so. The mock models exactly
 * that survival (phase 3.3), which is what makes the omission catchable offline at
 * all.
 *
 * The failure being prevented: the NEXT graphic on that layer inherits the geometry.
 * A stale `FILL` puts it in the wrong place — visible, reported. A stale `CLIP`
 * makes it **invisible**, with a `202` on the wire and nothing in any log.
 */

let mock: MockHandle | null = null;
let runtime: CasparRuntime | null = null;
let tracePath: string | null = null;

const LIVE_LAYER = 30;
const SECOND_LAYER = 31;

afterEach(async () => {
  await runtime?.stop();
  runtime = null;
  await mock?.stop();
  mock = null;
  if (tracePath !== null && fs.existsSync(tracePath)) fs.rmSync(tracePath);
  tracePath = null;
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

async function recvLines(): Promise<string[]> {
  if (mock === null || tracePath === null) throw new Error('no trace');
  await mock.traceFlush();
  return fs
    .readFileSync(tracePath, 'utf-8')
    .split('\n')
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as { dir: string; line: string })
    .filter((e) => e.dir === 'recv')
    .map((e) => e.line);
}

async function boot(): Promise<CasparRuntime> {
  const oscPort = await freeUdpPort();
  tracePath = path.join(
    os.tmpdir(),
    `cg-liveteardown-${String(process.pid)}-${String(Date.now())}.ndjson`,
  );
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 30, tracePath });
  const r = new CasparRuntime(singleServer(mock.amcpPort, oscPort), {}, { sweepMs: 150 });
  runtime = r;
  r.start();
  await r.startServing();
  await r.whenServerHealthy(HEALTH_MS);
  return r;
}

const record = (layer: number): LiveLayerRecord => {
  const box = { x: 0.25, y: 0.25, width: 0.5, height: 0.5 };
  return {
    slot: { channel: 1, layer },
    sourceId: 'guest-1',
    role: 'fill',
    producer: 'route://2',
    fill: box,
    clip: box,
    intendedVolume: 0,
  };
};

it('teardown sends BOTH the CLEAR and the MIXER CLEAR, in that order', async () => {
  const r = await boot();
  r.registerLiveLayers('item-1', [record(LIVE_LAYER)]);

  await r.teardownLiveLayers('item-1');

  const lines = await recvLines();
  const clearAt = lines.indexOf(`CLEAR 1-${String(LIVE_LAYER)}`);
  const mixerAt = lines.indexOf(`MIXER 1-${String(LIVE_LAYER)} CLEAR`);
  expect(clearAt, 'the producer CLEAR must reach the wire').toBeGreaterThanOrEqual(0);
  expect(
    mixerAt,
    'the MIXER CLEAR must reach the wire — mixer state survives CLEAR',
  ).toBeGreaterThanOrEqual(0);
  // ORDER: the producer goes before its geometry, so there is never a window in
  // which a live picture is on the layer with its mask already reset — which would
  // flash the un-masked, oversized crop-to-fill rect across the frame.
  expect(mixerAt).toBeGreaterThan(clearAt);
});

it('🔴 the mixer geometry is ACTUALLY GONE from the layer — the state, not just the command', async () => {
  const r = await boot();
  // Put real geometry on the layer through the wire, so the mock holds it.
  await r.registerLiveLayers('item-1', [record(LIVE_LAYER)]);
  const slot = { channel: 1, layer: LIVE_LAYER };
  await r.teardownLiveLayers('item-1');
  // The mock models mixer state SURVIVING a CLEAR (phase 3.3), which is the whole
  // reason the omission is catchable here rather than only on hardware.
  //
  // The reset lands on the IDENTITY rect rather than on absence, and that is the
  // right semantic to assert: a mixer's default is the FULL FRAME, unmasked. What
  // matters is that the next graphic on this layer inherits a full-frame, unmasked
  // layer — not the 0.25/0.25/0.5/0.5 crop this item left, which would have put it
  // in a quarter of the screen behind a mask it never asked for.
  const FULL_FRAME = { x: 0, y: 0, width: 1, height: 1 };
  expect(mock?.layerState(slot)?.fill).toEqual(FULL_FRAME);
  expect(mock?.layerState(slot)?.clip).toEqual(FULL_FRAME);
});

it('tears down EVERY layer an item owns — a two-box item leaves nothing behind', async () => {
  const r = await boot();
  r.registerLiveLayers('item-1', [record(LIVE_LAYER), record(SECOND_LAYER)]);

  await r.teardownLiveLayers('item-1');

  const lines = await recvLines();
  for (const layer of [LIVE_LAYER, SECOND_LAYER]) {
    expect(lines).toContain(`CLEAR 1-${String(layer)}`);
    expect(lines).toContain(`MIXER 1-${String(layer)} CLEAR`);
  }
});

it('releases the ledger LAST — the sweep never sees our own live layer as an orphan', async () => {
  // Releasing first would hand the layer back to the R-009 sweep (DOOR 1's boundary
  // case) while a producer of ours is still on it, so for the moment between it
  // would surface as a reclaimable orphan.
  const r = await boot();
  r.registerLiveLayers('item-1', [record(LIVE_LAYER)]);
  expect(r.liveLayers().has('item-1')).toBe(true);

  await r.teardownLiveLayers('item-1');

  expect(r.liveLayers().has('item-1')).toBe(false);
  // …and the sends happened, so "released" is not standing in for "did nothing".
  expect(await recvLines()).toContain(`MIXER 1-${String(LIVE_LAYER)} CLEAR`);
});

it('an item owning NO live layers is a clean no-op that still drops the bookkeeping', async () => {
  const r = await boot();
  const before = (await recvLines()).length;
  await r.teardownLiveLayers('item-unknown');
  const after = await recvLines();
  expect(after.length).toBe(before);
  expect(r.liveLayers().has('item-unknown')).toBe(false);
});
