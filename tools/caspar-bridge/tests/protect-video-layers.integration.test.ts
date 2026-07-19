import * as dgram from 'node:dgram';
import { afterEach, expect, it } from 'vitest';
import { createMock, type MockHandle, type AmcpRequest, type HandlerContext } from '@cg/amcp-mock';
import { AmcpTransport, CommandQueue } from '@cg/caspar-client';
import type { ConnectionConfig } from '@cg/shared-ipc';
import { CasparRuntime } from '../src/caspar-runtime.js';
import { HEALTH_MS } from './support/harness.js';

/**
 * R-015 — a graphics operator must never be able to clear a VIDEO layer.
 *
 * The discriminator is the OBSERVED producer kind on the OSC wire: this
 * system only ever places `html` producers, so `clearLayer` refuses
 * (`foreign`) any layer whose fresh observation is not `html` — a video
 * (`ffmpeg`), an unrecognised kind ("not html" fails safe), or NO fresh
 * observation at all (silence licenses nothing). The html orphan path —
 * R-009's own case — is unchanged.
 *
 * The mock's media PLAY reports `ffmpeg` (matching real CasparCG), so the
 * refusal is exercised against the real wire signal, not a shim.
 */

let mock: MockHandle | null = null;
let runtime: CasparRuntime | null = null;
let foreignQueue: CommandQueue | null = null;
let foreignTransport: AmcpTransport | null = null;

const SWEEP_MS = 150;
const STALE_MS = 800;

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
async function foreignPlay(target: MockHandle, line: string): Promise<void> {
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

  // Record every CLEAR that reaches the wire (while still emulating the
  // per-layer clear, so resolve-on-observed-empty keeps working).
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
  await runtime.whenServerHealthy(HEALTH_MS);
  return { clears };
}

it('a video layer surfaces with its ffmpeg kind and can NEVER be cleared — refused foreign, nothing on the wire', async () => {
  const { clears } = await boot();

  // Another system plays a program feed on layer 1 — a media file, no HTML
  // keyword, so the mock reports the ffmpeg producer (as real CasparCG does).
  await foreignPlay(mock!, 'PLAY 1-1 "program-feed.mov"');
  await waitFor(() => runtime!.orphans().some((o) => o.channel === 1 && o.layer === 1));

  // The feed surfaces with its observed kind — the UI's discriminator.
  expect(runtime!.orphans()).toMatchObject([{ channel: 1, layer: 1, producer: 'ffmpeg' }]);

  // The prohibition: refused with the REASON, and no CLEAR ever hits the wire.
  expect(await runtime!.clearLayer(1, 1)).toEqual({ ok: false, reason: 'foreign' });
  expect(clears).toEqual([]);

  // The feed is untouched — still on air, same producer, same file.
  expect(mock!.layerState({ channel: 1, layer: 1 })?.onAir).toBe(true);
  expect(mock!.layerState({ channel: 1, layer: 1 })?.producer).toBe('ffmpeg');
}, 20000);

it('an orphaned html layer keeps its clear path — R-009 survives for our own kind', async () => {
  const { clears } = await boot();

  // A dead previous session left an HTML graphic on layer 77.
  await foreignPlay(mock!, 'PLAY 1-77 "foreign" HTML');
  await waitFor(() => runtime!.orphans().some((o) => o.channel === 1 && o.layer === 77));
  expect(runtime!.orphans()).toMatchObject([{ channel: 1, layer: 77, producer: 'html' }]);

  expect(await runtime!.clearLayer(1, 77)).toEqual({ ok: true });
  expect(clears).toEqual(['1-77']);
  await waitFor(() => runtime!.orphans().length === 0);
}, 20000);

it('an unrecognised producer kind is treated as not-ours — "not html" fails safe', async () => {
  const { clears } = await boot();

  // Hand-emit an OSC observation for a kind the mock's AMCP path never
  // produces (decklink input). The tap notes whatever the wire reports.
  mock!.emitOsc('/channel/1/stage/layer/33/foreground/producer', ['decklink']);
  await waitFor(() =>
    runtime!.orphans().some((o) => o.channel === 1 && o.layer === 33 && o.producer === 'decklink'),
  );

  expect(await runtime!.clearLayer(1, 33)).toEqual({ ok: false, reason: 'foreign' });
  expect(clears).toEqual([]);
}, 20000);

it('a layer with NO fresh observation is refused — silence licenses nothing', async () => {
  const { clears } = await boot();

  // Nothing was ever observed on 1-99: no surfaced orphan, no fresh entry.
  // A blind CLEAR here could cut a video the tap simply cannot see (the
  // B-094 AMCP-alive/OSC-dead shape) — so the bridge refuses.
  expect(await runtime!.clearLayer(1, 99)).toEqual({ ok: false, reason: 'foreign' });
  expect(clears).toEqual([]);
}, 20000);
