import * as dgram from 'node:dgram';
import { afterEach, expect, it, vi } from 'vitest';
import { rasterVerdict, type ConnectionConfig, type TemplateInfo } from '@cg/shared-ipc';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import { CasparRuntime } from '../src/caspar-runtime.js';
import { HEALTH_MS } from './support/harness.js';

/**
 * R-030 — the channel raster, end to end against the amcp-mock:
 *
 *  1. the configured raster reaches the served `CG ADD` URL, so the page can
 *     place itself against the frame it will actually be shown on;
 *  2. the REAL video mode is read off `INFO <channel>` and compared with what
 *     config claims — the check that stops a wrong raster being silent.
 *
 * The mock reports `<video-mode>1080i5000</video-mode>`, which is the real
 * plant's mode (the owner's `casparcg.config`), so the default 1920×1080 config
 * agrees with it and a deliberately-wrong 1280×720 config does not.
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
  // A fast sweep: the video-mode read piggybacks on the orphan sweep rather
  // than arming a second timer, so the test has to let one tick land.
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 30 });
  runtime = new CasparRuntime(singleServer(mock.amcpPort, oscPort), {}, { sweepMs: 60 });
  runtime.start();
  await runtime.startServing();
  runtime.templateImport(TEMPLATE, HTML);
  await runtime.whenServerHealthy(HEALTH_MS);
}

/** Wait until the bridge has read a mode for the channel (bounded). */
async function waitForModeReading(channel: number): Promise<void> {
  await vi.waitFor(
    () => {
      const observed = runtime!.channelSettingsState().observed;
      expect(observed.some((o) => o.channel === channel)).toBe(true);
    },
    { timeout: HEALTH_MS, interval: 25 },
  );
}

it('the CONFIGURED raster rides every served CG ADD, and a change is applied and honoured', async () => {
  await boot();

  // Default: the reference raster, so the ADD is scale-1 and byte-identical in
  // placement to pre-R-030.
  expect((await runtime!.load('item1', 'lower-third', {})).accepted).toBe(true);
  expect(mock!.lastCgAdd(SLOT)?.template).toContain('cw=1920&ch=1080');

  // Configure the channel as 720p (the C-018 box) and re-load: the geometry the
  // page is told must follow config, or the anchor maths runs against a frame
  // the output does not have.
  expect((await runtime!.remove('item1')).accepted).toBe(true);
  expect(runtime!.setChannelSettings({ channel: 1, raster: { width: 1280, height: 720 } })).toEqual(
    {
      ok: true,
    },
  );
  expect((await runtime!.load('item2', 'lower-third', {})).accepted).toBe(true);
  const add = mock!.lastCgAdd(SLOT)?.template;
  expect(add).toContain('cw=1280&ch=720');
  expect(add).not.toContain('cw=1920');
}, 30000);

it('reads the REAL video mode off INFO and reports agreement with config', async () => {
  await boot();
  await waitForModeReading(1);

  const state = runtime!.channelSettingsState();
  const observed = state.observed.find((o) => o.channel === 1);
  // The raw token is kept verbatim — facts, not a resolved label.
  expect(observed?.mode).toBe('1080i5000');
  expect(observed?.raster).toEqual({ width: 1920, height: 1080 });
  // Default config is 1920×1080, which is what the server reports.
  expect(rasterVerdict(state, 1)).toBe('match');
}, 30000);

it('surfaces a CONFIGURED raster that contradicts the server, loudly and on the wire', async () => {
  await boot();
  await waitForModeReading(1);

  const pushes: number[] = [];
  runtime!.channelSettingsChanged.subscribe(() => pushes.push(1));
  const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);

  // Claim 720p on a channel the server says is 1080i5000. Every graphic on it
  // would be placed against the wrong frame, and nothing else in the system
  // would notice — so this must be loud.
  expect(runtime!.setChannelSettings({ channel: 1, raster: { width: 1280, height: 720 } })).toEqual(
    {
      ok: true,
    },
  );

  const state = runtime!.channelSettingsState();
  expect(rasterVerdict(state, 1)).toBe('mismatch');
  // Pushed to every browser: the verdict is a function of config AND the
  // reading, so a config change alone can create a mismatch.
  expect(pushes.length).toBeGreaterThanOrEqual(1);

  // …and shouted on stderr. This is the CONFIG side of the check, and it is the
  // side the first cut of this feature got wrong: warning only when a new
  // reading landed meant the operator who had just typed the wrong raster got
  // silence, which is exactly when they most need telling — they have just
  // formed a false belief about where every graphic lands.
  const written = stderr.mock.calls.map((c) => String(c[0])).join('');
  expect(written).toContain('CHANNEL 1 RASTER MISMATCH');
  expect(written).toContain('1280×720');
  expect(written).toContain('1080i5000');

  // Announced on the TRANSITION, not per publish: re-applying the same wrong
  // raster must not repeat the shout and bury the next distinct problem.
  const before = stderr.mock.calls.length;
  expect(runtime!.setChannelSettings({ channel: 1, raster: { width: 1280, height: 720 } })).toEqual(
    {
      ok: true,
    },
  );
  expect(stderr.mock.calls.length).toBe(before);

  // Correcting it clears the latch, so a LATER mismatch is announced again.
  expect(
    runtime!.setChannelSettings({ channel: 1, raster: { width: 1920, height: 1080 } }),
  ).toEqual({ ok: true });
  expect(rasterVerdict(runtime!.channelSettingsState(), 1)).toBe('match');
  expect(runtime!.setChannelSettings({ channel: 1, raster: { width: 1280, height: 720 } })).toEqual(
    {
      ok: true,
    },
  );
  expect(stderr.mock.calls.length).toBeGreaterThan(before);
  stderr.mockRestore();
}, 30000);

it('refuses a raster change while anything is on air — it would move what is live', async () => {
  await boot();
  expect((await runtime!.load('item1', 'lower-third', {})).accepted).toBe(true);
  expect((await runtime!.take('item1')).accepted).toBe(true);

  const refused = runtime!.setChannelSettings({
    channel: 1,
    raster: { width: 1280, height: 720 },
  });
  expect(refused.ok).toBe(false);
  expect(refused.reason).toBe('on-air-block');
  // Nothing applied — the refusal is total, not partial.
  expect(runtime!.channelSettingsState().settings).toEqual([
    { channel: 1, raster: { width: 1920, height: 1080 } },
  ]);

  // Off air → the same change is accepted.
  expect((await runtime!.out('item1')).accepted).toBe(true);
  expect(runtime!.setChannelSettings({ channel: 1, raster: { width: 1280, height: 720 } })).toEqual(
    {
      ok: true,
    },
  );
}, 30000);

it('refuses a channel this install never declared', async () => {
  await boot();
  const refused = runtime!.setChannelSettings({
    channel: 42,
    raster: { width: 1280, height: 720 },
  });
  expect(refused.ok).toBe(false);
  expect(refused.reason).toBe('unknown-channel');
}, 30000);
