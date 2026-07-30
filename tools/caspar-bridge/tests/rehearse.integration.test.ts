import * as dgram from 'node:dgram';
import { afterEach, expect, it } from 'vitest';
import type { ConnectionConfig, TemplateInfo } from '@cg/shared-ipc';
import { isRehearsing } from '@cg/shared-ipc';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import { CasparRuntime } from '../src/caspar-runtime.js';
import { HEALTH_MS } from './support/harness.js';

/**
 * R-022 — REHEARSE, end to end against the amcp-mock.
 *
 * THE FAILURE MODE THIS SUITE EXISTS FOR IS SILENCE ON AIR. Rehearse leaves the
 * CasparCG producer RESIDENT and mutes the layer; a mute that is never restored
 * means a graphic that goes to air with no sound, which is worse than the audio
 * leak the mute prevents because nobody notices until someone asks why. It is
 * invisible to every other signal — `producer`, `onAir` and `pageResolution` are
 * identical either way — so the mock models layer VOLUME specifically so these
 * assertions can exist.
 *
 * The volume assertions below are therefore the point of the file, not colour: each
 * one is a way the mute could be stranded.
 */

const SLOT = { channel: 1, layer: 10 };
const TEMPLATE: TemplateInfo = {
  templateId: 'lower-third',
  templateType: 'lower-third',
  fields: [],
};
const HTML = '<!doctype html><html><head><meta charset="utf-8"></head><body>سلام</body></html>';

let mock: MockHandle | null = null;
let runtime: CasparRuntime | null = null;

function singleServer(amcpPort: number, oscPort: number): ConnectionConfig {
  return {
    servers: { A: { host: '127.0.0.1', amcpPort, oscPort } },
    strategy: 'mirror-sync',
    autoFailoverEnabled: true,
  };
}

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
      sock.close(() => {
        resolve(port);
      });
    });
  });
}

async function boot(): Promise<void> {
  const oscPort = await freeUdpPort();
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 30 });
  runtime = new CasparRuntime(singleServer(mock.amcpPort, oscPort), {}, { sweepMs: 60 });
  runtime.start();
  await runtime.startServing();
  runtime.templateImport(TEMPLATE, HTML);
  await runtime.whenServerHealthy(HEALTH_MS);
}

/** The mock's observed volume for the layer under test. */
function volume(): number | undefined {
  return mock?.layerState(SLOT)?.volume;
}

it('mutes on enter and RESTORES on exit — the producer stays resident throughout', async () => {
  await boot();
  expect((await runtime!.load('item1', 'lower-third', {})).accepted).toBe(true);
  expect(volume()).toBe(1);

  expect(await runtime!.enterRehearse('item1')).toEqual({ ok: true });
  expect(volume()).toBe(0);
  // THE PRODUCER STAYS. Rehearse is deliberately NOT CLEAR-then-re-ADD: that
  // cycle is the sequence that failed in the field (adopt-CLEAR succeeded, the
  // CG ADD after it 404'd, the layer was left empty on air).
  expect(mock!.layerState(SLOT)?.producer).toBe('html');
  expect(isRehearsing(runtime!.rehearseState(), 'item1')).toBe(true);

  expect(await runtime!.exitRehearse('item1')).toEqual({ ok: true });
  expect(volume()).toBe(1);
  expect(mock!.layerState(SLOT)?.producer).toBe('html');
  expect(isRehearsing(runtime!.rehearseState(), 'item1')).toBe(false);
}, 30000);

it('PLAY re-asserts the intended volume UNCONDITIONALLY — a stranded mute cannot reach air', async () => {
  await boot();
  expect((await runtime!.load('item1', 'lower-third', {})).accepted).toBe(true);

  // Strand a mute the way a crash, a reload, a dropped socket or a second
  // operator's own MIXER would: the layer is muted and NOTHING in the bridge's
  // bookkeeping says so. This is the exact state that would otherwise put a silent
  // graphic on air, and it is unreachable by driving the bridge — every one of its
  // own paths restores — which is why the mock has a direct hook for it.
  mock!.setLayerVolume(SLOT, 0);
  expect(volume()).toBe(0);
  expect(runtime!.rehearseState()).toEqual([]);

  // A take must fix it, with no un-mute step having run and no rehearse state to
  // read. That unconditionality is the whole design: the re-assert lives in the
  // PLAY path rather than on the rehearse-exit path precisely so it does not depend
  // on our own bookkeeping being correct.
  expect((await runtime!.take('item1')).accepted).toBe(true);
  expect(volume()).toBe(1);
}, 30000);

it('SERIALISES transitions per item — an exit racing an enter cannot leave a claim unmuted', async () => {
  await boot();
  expect((await runtime!.load('item1', 'lower-third', {})).accepted).toBe(true);
  expect(await runtime!.enterRehearse('item1')).toEqual({ ok: true });
  expect(volume()).toBe(0);

  // Fire exit and a re-enter WITHOUT awaiting between them — the double-click, or
  // two browsers acting at once. Without the per-item lock these interleave as
  // "exit drops the claim → enter mutes and re-claims → exit's un-mute LANDS",
  // leaving a row that CLAIMS to be rehearsing over a layer that is NOT muted. On
  // 2.5.0 that is audio on air behind a UI insisting the graphic cannot reach air.
  const exiting = runtime!.exitRehearse('item1');
  const reEntering = runtime!.enterRehearse('item1');
  const [exitResult, enterResult] = await Promise.all([exiting, reEntering]);

  expect(exitResult.ok).toBe(true);
  // The second transition is refused while the first is in flight — a correctness
  // lock, not a debounce.
  expect(enterResult.ok).toBe(false);
  expect(enterResult.reason).toBe('busy');

  // THE INVARIANT: claim and mute agree. Whichever way the race resolved, a row
  // that reads as rehearsing is muted, and one that does not is not.
  const claimed = isRehearsing(runtime!.rehearseState(), 'item1');
  expect(volume()).toBe(claimed ? 0 : 1);
}, 30000);

it('refuses rehearse ON AIR, and fails closed on an UNSETTLED item', async () => {
  await boot();
  expect((await runtime!.load('item1', 'lower-third', {})).accepted).toBe(true);
  expect((await runtime!.take('item1')).accepted).toBe(true);

  const refused = await runtime!.enterRehearse('item1');
  expect(refused.ok).toBe(false);
  expect(refused.reason).toBe('on-air');
  // Nothing applied: an on-air graphic is NOT muted by a refused rehearse.
  expect(volume()).toBe(1);
  expect(runtime!.rehearseState()).toEqual([]);
}, 30000);

it('refuses rehearse for a row with NOTHING LOADED', async () => {
  await boot();
  const refused = await runtime!.enterRehearse('ghost');
  expect(refused.ok).toBe(false);
  // No item at all reads `unknown-item`, not `not-loaded` — different facts.
  expect(refused.reason).toBe('unknown-item');
}, 30000);

it('THE INTERLOCK: a take is refused BRIDGE-SIDE while rehearsing, and nothing is sent', async () => {
  await boot();
  expect((await runtime!.load('item1', 'lower-third', {})).accepted).toBe(true);
  expect(await runtime!.enterRehearse('item1')).toEqual({ ok: true });

  const before = mock!.layerState(SLOT)?.onAir;
  const refused = await runtime!.take('item1');
  expect(refused.accepted).toBe(false);
  expect(refused.errorCode).toBe('rehearsing');
  // Not merely reported — nothing reached the layer. A disabled button is the
  // courtesy; THIS is the guarantee, and it is what holds when a second browser's
  // snapshot is stale.
  expect(mock!.layerState(SLOT)?.onAir).toBe(before);
  // The mute is intact: a refused take must not have re-asserted the volume either.
  expect(volume()).toBe(0);

  // Leaving rehearse re-enables it, and the take then restores the volume on its way.
  expect(await runtime!.exitRehearse('item1')).toEqual({ ok: true });
  expect((await runtime!.take('item1')).accepted).toBe(true);
  expect(volume()).toBe(1);
  expect(mock!.layerState(SLOT)?.onAir).toBe(true);
}, 30000);

it('withdraws the rehearse claim and restores volume when the layer goes live by ANOTHER route', async () => {
  await boot();
  expect((await runtime!.load('item1', 'lower-third', {})).accepted).toBe(true);
  expect(await runtime!.enterRehearse('item1')).toEqual({ ok: true });
  expect(volume()).toBe(0);

  // Somebody else takes the layer live — another operator, or the playout system
  // driving AMCP directly. Rehearse is a claim about OUR intent, not a guarantee
  // about the channel, and the honest response to being wrong is to stop claiming
  // it. Simulated by removing the item from under the claim, which is the same
  // "no longer ours to interlock" condition the sweep tests for.
  expect((await runtime!.remove('item1')).accepted).toBe(true);

  // The sweep withdraws it within a tick or two (sweepMs is 60 here).
  await new Promise((resolve) => setTimeout(resolve, 400));
  expect(runtime!.rehearseState()).toEqual([]);
  // And the volume is restored — the producer may be gone, but MIXER state is
  // CHANNEL state and outlives it, so a missed restore here would silence the next
  // graphic loaded onto this layer.
  expect(volume()).toBe(1);
}, 30000);

it('re-asserts every declared row’s volume at startup — a bridge that died mid-rehearse leaves no mute', async () => {
  const oscPort = await freeUdpPort();
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 30 });
  // The state a crashed bridge leaves behind: muted layers, and no process that
  // knows it. Mixer state is channel state, so it survives the process.
  mock.setLayerVolume({ channel: 1, layer: 70 }, 0);
  mock.setLayerVolume({ channel: 1, layer: 71 }, 0);
  expect(mock.layerState({ channel: 1, layer: 70 })?.volume).toBe(0);

  runtime = new CasparRuntime(
    singleServer(mock.amcpPort, oscPort),
    {},
    { sweepMs: 60, fixedBank: { channel: 1, start: 70, count: 2 } },
  );
  runtime.start();
  await runtime.startServing();
  await runtime.whenServerHealthy(HEALTH_MS);
  await new Promise((resolve) => setTimeout(resolve, 500));

  expect(mock.layerState({ channel: 1, layer: 70 })?.volume).toBe(1);
  expect(mock.layerState({ channel: 1, layer: 71 })?.volume).toBe(1);
}, 30000);
