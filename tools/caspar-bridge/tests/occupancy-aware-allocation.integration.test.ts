import * as dgram from 'node:dgram';
import { afterEach, expect, it } from 'vitest';
import { createMock, type MockHandle, type AmcpRequest, type HandlerContext } from '@cg/amcp-mock';
import { AmcpTransport, CommandQueue } from '@cg/caspar-client';
import type { ConnectionConfig } from '@cg/shared-ipc';
import { CasparRuntime } from '../src/caspar-runtime.js';
import { HEALTH_MS } from './support/harness.js';

/**
 * C-014 — allocation is occupancy-aware: an ordinary "Add item" must never
 * land on — and adopt-CLEAR — another system's output.
 *
 * The discriminator is R-015's: a FRESH non-`html` observation is provably
 * foreign (this system only places html producers; unrecognised kinds fail
 * safe). Wire-asserted throughout: the recorded CLEAR stream is the proof
 * that the foreign coordinate was never touched.
 *
 * The blind-tap direction is PINNED here (fail OPEN — allocation proceeds as
 * before C-014): refusing on silence would turn OSC loss into a total playout
 * outage, and on a hearing tap silence genuinely means empty (B-053).
 */

let mock: MockHandle | null = null;
let runtime: CasparRuntime | null = null;
let foreignQueue: CommandQueue | null = null;
let foreignTransport: AmcpTransport | null = null;

const SWEEP_MS = 150;
const STALE_MS = 800;
const HTML = '<!doctype html><html><body>served</body></html>';

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

async function waitFor(predicate: () => boolean, timeoutMs = 8000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timed out');
    await new Promise((r) => setTimeout(r, 25));
  }
}

function singleServer(amcpPort: number, oscPort: number): ConnectionConfig {
  return {
    servers: { A: { host: '127.0.0.1', amcpPort, oscPort } },
    strategy: 'mirror-sync',
    autoFailoverEnabled: true,
  };
}

/** A second, independent AMCP client — "another system" playing content. */
async function foreignSend(target: MockHandle, line: string): Promise<void> {
  if (foreignTransport === null) {
    foreignTransport = new AmcpTransport();
    await foreignTransport.connect(target.host, target.amcpPort);
    foreignQueue = new CommandQueue(foreignTransport);
  }
  await foreignQueue?.enqueue(line);
}

async function boot(): Promise<{ clears: string[] }> {
  const oscPort = await freeUdpPort();
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 30 });

  // Record every CLEAR that reaches the wire, still emulating the per-layer
  // clear so adoption bookkeeping and OSC keep working.
  const clears: string[] = [];
  mock.setHandler('CLEAR', (req: AmcpRequest, ctx: HandlerContext) => {
    const target = req.args[0] ?? '';
    clears.push(target);
    const parsed = /^(\d+)-(\d+)$/.exec(target);
    if (parsed !== null) {
      ctx.setLayer(
        { channel: Number(parsed[1]), layer: Number(parsed[2]) },
        {
          producer: 'empty',
          filePath: '',
          paused: false,
          onAir: false,
          pageResolution: 'resolved',
        },
      );
    }
    return { kind: 'ok', code: 202, verb: 'CLEAR' };
  });

  runtime = new CasparRuntime(
    singleServer(mock.amcpPort, oscPort),
    {},
    { sweepMs: SWEEP_MS, occupancyStaleMs: STALE_MS },
  );
  runtime.start();
  await runtime.startServing();
  runtime.templateImport(
    { templateId: 'lower-third', templateType: 'lower-third', fields: [] },
    HTML,
  );
  await runtime.whenServerHealthy(HEALTH_MS);
  return { clears };
}

it('a foreign video inside the range is allocated AROUND and never CLEARed', async () => {
  const { clears } = await boot();

  // Another system parks a video on 1-10 — the lower-third range's lowest layer.
  await foreignSend(mock!, 'PLAY 1-10 "parked-video.mp4"');
  await waitFor(() =>
    runtime!.orphans().some((o) => o.channel === 1 && o.layer === 10 && o.producer === 'ffmpeg'),
  );

  expect((await runtime!.load('item1', 'lower-third', {})).accepted).toBe(true);

  // The ADD skipped to 1-11; the only CLEAR ever sent is 1-11's own adopt.
  expect(mock!.lastCgAdd({ channel: 1, layer: 11 })).toBeDefined();
  expect(mock!.lastCgAdd({ channel: 1, layer: 10 })).toBeUndefined();
  expect(clears).toEqual(['1-11']);

  // The video is untouched — still on air, same producer, same file.
  expect(mock!.layerState({ channel: 1, layer: 10 })?.onAir).toBe(true);
  expect(mock!.layerState({ channel: 1, layer: 10 })?.producer).toBe('ffmpeg');
  expect(mock!.layerState({ channel: 1, layer: 10 })?.filePath).toBe('parked-video.mp4');
}, 20000);

it('an html-occupied lowest layer allocates and adopt-CLEARs exactly as before (R-009/B-039 unchanged)', async () => {
  const { clears } = await boot();

  // A dead session's html orphan sits on 1-10 — the adopt-CLEAR's designed prey.
  await foreignSend(mock!, 'PLAY 1-10 "dead-session-orphan" HTML');
  await waitFor(() =>
    runtime!.orphans().some((o) => o.channel === 1 && o.layer === 10 && o.producer === 'html'),
  );

  expect((await runtime!.load('item1', 'lower-third', {})).accepted).toBe(true);

  // Allocated 1-10 itself: adopt-CLEAR then ADD, the pre-C-014 behaviour.
  expect(clears).toEqual(['1-10']);
  expect(mock!.lastCgAdd({ channel: 1, layer: 10 })).toBeDefined();
}, 20000);

it('an unrecognised producer kind is skipped — "not html" fails safe', async () => {
  const { clears } = await boot();

  // A kind the AMCP path never produces (a decklink input), straight onto the wire.
  mock!.emitOsc('/channel/1/stage/layer/10/foreground/producer', ['decklink']);
  await waitFor(() =>
    runtime!.orphans().some((o) => o.channel === 1 && o.layer === 10 && o.producer === 'decklink'),
  );

  expect((await runtime!.load('item1', 'lower-third', {})).accepted).toBe(true);
  expect(mock!.lastCgAdd({ channel: 1, layer: 11 })).toBeDefined();
  expect(mock!.lastCgAdd({ channel: 1, layer: 10 })).toBeUndefined();
  expect(clears).toEqual(['1-11']);
}, 20000);

it('PINNED: a blind tap fails OPEN — allocation proceeds exactly as before C-014', async () => {
  // No OSC reaches the tap (B-094's shape): nothing can be quarantined — and
  // nothing may be refused. Refusing on silence would make a no-OSC install
  // unable to play out AT ALL; before C-014 every allocation was blind, so
  // failing open makes nothing worse where no evidence exists. The residual
  // risk (this very video) is the documented, deliberate trade.
  //
  // The video is parked BEFORE the runtime boots: `setLayer` emits one
  // immediate datagram per command even with the emitter loop disabled, so
  // parking it early sends that datagram into the void — the runtime's tap
  // then genuinely never hears about the layer.
  const oscPort = await freeUdpPort();
  mock = await createMock({
    amcpPort: 0,
    oscPort,
    oscHost: '127.0.0.1',
    oscHz: 30,
    disableOsc: true,
  });
  const clears: string[] = [];
  mock.setHandler('CLEAR', (req: AmcpRequest) => {
    clears.push(req.args[0] ?? '');
    return { kind: 'ok', code: 202, verb: 'CLEAR' };
  });
  await foreignSend(mock, 'PLAY 1-10 "invisible-video.mp4"');

  runtime = new CasparRuntime(
    singleServer(mock.amcpPort, oscPort),
    {},
    { sweepMs: SWEEP_MS, occupancyStaleMs: STALE_MS },
  );
  runtime.start();
  await runtime.startServing();
  runtime.templateImport(
    { templateId: 'lower-third', templateType: 'lower-third', fields: [] },
    HTML,
  );
  await runtime.whenServerHealthy(HEALTH_MS);

  expect((await runtime.load('item1', 'lower-third', {})).accepted).toBe(true);

  // Lowest layer in range, adopt-CLEAR included — the pre-C-014 behaviour.
  expect(clears).toEqual(['1-10']);
  expect(mock.lastCgAdd({ channel: 1, layer: 10 })).toBeDefined();
}, 20000);

it('a range exhausted by foreign producers refuses legibly — zero wire traffic, never a silent CLEAR', async () => {
  const { clears } = await boot();

  // Videos on every layer of the lower-third range (10-19).
  for (let layer = 10; layer <= 19; layer++) {
    await foreignSend(mock!, `PLAY 1-${String(layer)} "wall-${String(layer)}.mp4"`);
  }
  await waitFor(() => runtime!.orphans().length === 10);

  const result = await runtime!.load('item1', 'lower-third', {});
  expect(result).toEqual({ accepted: false, errorCode: 'no-layer-foreign-occupied' });

  // Nothing was sent: no CLEAR anywhere, no ADD on any range coordinate.
  expect(clears).toEqual([]);
  for (let layer = 10; layer <= 19; layer++) {
    expect(mock!.lastCgAdd({ channel: 1, layer })).toBeUndefined();
    expect(mock!.layerState({ channel: 1, layer })?.producer).toBe('ffmpeg');
  }
}, 20000);

it('a foreign producer on an OWNED layer is NOT quarantined — B-056 territory, and our slot survives', async () => {
  const { clears } = await boot();

  // We own 1-10 the ordinary way.
  expect((await runtime!.load('item1', 'lower-third', {})).accepted).toBe(true);
  expect(clears).toEqual(['1-10']);

  // Another system stamps a video over OUR layer (the B-056 shape). Quarantine
  // must not touch it: the slot is ours, the warning is B-056's job, and the
  // release path must never deallocate a layer a live item still holds.
  await foreignSend(mock!, 'PLAY 1-10 "stomped.mp4"');
  await waitFor(() => mock!.layerState({ channel: 1, layer: 10 })?.producer === 'ffmpeg', 5000);
  // Let several sweeps run over that observation.
  await new Promise((r) => setTimeout(r, SWEEP_MS * 4));

  // The layer never becomes an orphan (we own it) and our item keeps its slot.
  expect(runtime!.orphans().some((o) => o.layer === 10)).toBe(false);
  expect(runtime!.stackSnapshot().find((i) => i.itemId === 'item1')?.slot).toMatchObject({
    channel: 1,
    layer: 10,
  });

  // And the slot was NOT silently returned to the pool: the next add takes 1-11.
  expect((await runtime!.load('item2', 'lower-third', {})).accepted).toBe(true);
  expect(mock!.lastCgAdd({ channel: 1, layer: 11 })).toBeDefined();
  expect(clears).toEqual(['1-10', '1-11']);
}, 20000);

it('quarantine FREEZES while the primary is unhealthy — absence of knowledge never releases it', async () => {
  await boot();

  await foreignSend(mock!, 'PLAY 1-10 "parked-video.mp4"');
  await waitFor(() => runtime!.orphans().some((o) => o.channel === 1 && o.layer === 10));

  // Prove it is quarantined: an add skips to 1-11.
  expect((await runtime!.load('item1', 'lower-third', {})).accepted).toBe(true);
  expect(mock!.lastCgAdd({ channel: 1, layer: 11 })).toBeDefined();

  // Kill the server. The tap's entries go stale, but the sweep skips while the
  // primary is not healthy — so the quarantine must NOT dissolve into "free".
  foreignQueue?.dispose();
  foreignQueue = null;
  foreignTransport?.destroy();
  foreignTransport = null;
  const dying = mock!;
  mock = null;
  await dying.stop();
  await waitFor(() => runtime!.health().primary.state !== 'healthy', 5000);
  await new Promise((r) => setTimeout(r, SWEEP_MS * 6));

  // 1-10 is still withheld: the next allocation takes 1-12, never the frozen layer.
  expect((await runtime!.load('item2', 'lower-third', {})).accepted).toBe(true);
  const slot = runtime!.stackSnapshot().find((i) => i.itemId === 'item2')?.slot;
  expect(slot).toMatchObject({ channel: 1, layer: 12 });
}, 25000);

it('quarantine RELEASES when the video leaves — the layer allocates again', async () => {
  const { clears } = await boot();

  await foreignSend(mock!, 'PLAY 1-10 "parked-video.mp4"');
  await waitFor(() => runtime!.orphans().some((o) => o.channel === 1 && o.layer === 10));

  // Skipped while the video is there.
  expect((await runtime!.load('itemA', 'lower-third', {})).accepted).toBe(true);
  expect(mock!.lastCgAdd({ channel: 1, layer: 11 })).toBeDefined();
  expect(clears).toEqual(['1-11']);

  // The other system takes its video down; the mock reports the layer empty.
  await foreignSend(mock!, 'CLEAR 1-10');
  await waitFor(() => !runtime!.orphans().some((o) => o.channel === 1 && o.layer === 10));

  // 1-10 is back in the pool: next add lands on it, with the normal adopt-CLEAR.
  expect((await runtime!.load('itemB', 'lower-third', {})).accepted).toBe(true);
  expect(mock!.lastCgAdd({ channel: 1, layer: 10 })).toBeDefined();
  // itemA's adopt of 1-11 · the OTHER system's own CLEAR 1-10 (the recorder
  // sees every client) · itemB's adopt of the released 1-10.
  expect(clears).toEqual(['1-11', '1-10', '1-10']);
}, 20000);
