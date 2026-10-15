import { afterEach, describe, expect, it } from 'vitest';
import { BridgeCapabilitiesChannel, clockWords, machineClock, sameClock } from '@cg/shared-ipc';
import { createBridge, type BridgeHandle } from '../src/index.js';
import { buildRoutes } from '../src/bridge.js';
import { CasparRuntime } from '../src/caspar-runtime.js';
import { deadConnection, openClient } from './support/auth-harness.js';
import { TEST_LAYER_POLICY } from './support/harness.js';

/**
 * `DELTA-RUN-NEXT-VERSION-01-C` §2 — **`bridge.capabilities` carries the clock of the machine CG
 * Bridge runs on**, so a console in another zone states both clocks beside a countdown target
 * field. Asked over a real socket, the field is THIS process's `machineClock()` — the one reading
 * CG Control makes of its own — and it parses through the channel's own response schema.
 */

let handle: BridgeHandle | null = null;

afterEach(async () => {
  await handle?.close();
  handle = null;
});

describe('bridge.capabilities — the bridge host’s clock', () => {
  it('rides the answer over a real socket, as this machine reads it', async () => {
    handle = await createBridge({ port: 0, connection: deadConnection() });
    const client = await openClient(handle);
    const caps = await client.ask('c', 'bridge.capabilities', {});
    expect(caps.error).toBeUndefined();
    const parsed = BridgeCapabilitiesChannel.response.parse(caps.payload);
    expect(parsed.clock).toEqual(machineClock());
    expect(parsed.clock?.offsetMinutes).toBe(-new Date().getTimezoneOffset());
  });

  it('is read when the answer is made — an injected clock is what the route answers', async () => {
    const runtime = new CasparRuntime(deadConnection(), {}, { layerPolicy: TEST_LAYER_POLICY });
    const routes = buildRoutes(runtime, {
      clock: () => ({ timeZone: 'Europe/London', offsetMinutes: 60 }),
    });
    const route = routes.get('bridge.capabilities');
    if (route === undefined) throw new Error('bridge.capabilities is not routed');
    const answer = (await route.handle({})) as { clock?: unknown };
    expect(answer.clock).toEqual({ timeZone: 'Europe/London', offsetMinutes: 60 });
    await runtime.stop();
  });
});

describe('the clock words and the one comparison', () => {
  it('a clock reads as its zone and its ISO-style offset', () => {
    expect(clockWords({ timeZone: 'Asia/Tehran', offsetMinutes: 210 })).toBe('Asia/Tehran +03:30');
    expect(clockWords({ timeZone: 'America/New_York', offsetMinutes: -240 })).toBe(
      'America/New_York -04:00',
    );
    expect(clockWords({ timeZone: '', offsetMinutes: 0 })).toBe('+00:00');
  });

  it('two clocks are the same only when zone AND offset agree', () => {
    const tehran = { timeZone: 'Asia/Tehran', offsetMinutes: 210 };
    expect(sameClock(tehran, { ...tehran })).toBe(true);
    expect(sameClock(tehran, { ...tehran, offsetMinutes: 270 })).toBe(false);
    expect(sameClock(tehran, { timeZone: 'Asia/Dubai', offsetMinutes: 210 })).toBe(false);
  });
});
