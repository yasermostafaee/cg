import * as dgram from 'node:dgram';
import { afterEach, describe, expect, it } from 'vitest';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import type { ConnectionConfig, ConnectionHealth } from '@cg/shared-ipc';
import { CasparRuntime } from '../src/caspar-runtime.js';
import { HEALTH_MS, TEST_LAYER_POLICY } from './support/harness.js';
import { standardBank } from './support/two-channel-rig.js';

/**
 * 🔴 `B-315` — **A CHANNEL THE STATION NO LONGER SERVES IS NEVER "NOT PRODUCING".**
 *
 * Found by `RELEASE-0112-01` on `pnpm dev:station --fake --pair`: a healthy station whose status bar
 * read `⚠ A NOT PRODUCING · CH 2`. Before first-run declares a channel the bridge serves EVERY channel
 * of the core (`#servesOscChannel`), so server A's channel 2 was heard ticking; the channel pick then
 * declared channel 1 alone, OSC for channel 2 was dropped before the tick tap (`CENTRAL-BRIDGE-01`
 * rule 7) — and the tap kept channel 2's last tick, which went stale three seconds later. Only a
 * reconnect cleared it, which is why a run whose first-run write rebuilt server A's session never
 * showed it. The same holds for a channel Change channel… removes.
 *
 * R-058's judgement is the bridge's ("decided HERE"), so the served-channel rule is applied there.
 */

let runtime: CasparRuntime | null = null;
let mock: MockHandle | null = null;

afterEach(async () => {
  await runtime?.stop();
  await mock?.stop();
  runtime = null;
  mock = null;
});

function freeUdpPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const sock = dgram.createSocket('udp4');
    sock.once('error', reject);
    sock.bind(0, '127.0.0.1', () => {
      const { port } = sock.address();
      sock.close(() => resolve(port));
    });
  });
}

const STALE_MS = 400;
const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** The channels server A's snapshot lists, with their verdicts. */
const ticks = (r: CasparRuntime): ConnectionHealth['primary']['channels'] =>
  r.health().primary.channels;

async function until(what: string, ok: () => boolean, ms = HEALTH_MS): Promise<void> {
  const deadline = Date.now() + ms;
  while (!ok()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await delay(25);
  }
}

/** A first-run station: nothing declared, a core serving channels 1 and 2 over OSC. */
async function firstRunStation(): Promise<CasparRuntime> {
  const oscPort = await freeUdpPort();
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 40, channels: 2 });
  const config: ConnectionConfig = {
    servers: { A: { host: '127.0.0.1', amcpPort: mock.amcpPort, oscPort } },
    strategy: 'mirror-sync',
    autoFailoverEnabled: false,
  };
  const r = new CasparRuntime(
    config,
    {},
    {
      layerPolicy: TEST_LAYER_POLICY,
      declaresNothingWithoutBank: true,
      channelTickStaleMs: STALE_MS,
    },
  );
  runtime = r;
  r.start();
  await r.whenServerHealthy(HEALTH_MS);
  return r;
}

describe('B-315 — R-058 reports only the channels this station serves', () => {
  it('declaring channel 1 takes channel 2 out of the list — never "not producing" — while channel 1 ticks on', async () => {
    const r = await firstRunStation();
    // Before the declaration every channel is served: both are heard ticking.
    await until(
      'both channels ticking',
      () => (ticks(r) ?? []).filter((c) => c.ticking).length === 2,
    );

    expect(r.setFixedLayers(standardBank(1)).ok).toBe(true);
    // Past the stale window: channel 2's OSC is dropped now, so its last tick has aged out.
    await delay(STALE_MS * 3);
    expect(ticks(r)).toEqual([{ channel: 1, ticking: true }]);
  });

  it('CONTROL — a served channel that really stops is still reported as not producing', async () => {
    const r = await firstRunStation();
    await until(
      'both channels ticking',
      () => (ticks(r) ?? []).filter((c) => c.ticking).length === 2,
    );
    expect(r.setFixedLayers(standardBank(1)).ok).toBe(true);
    // The core stops sending OSC altogether: channel 1 — served — goes quiet.
    await mock?.stop();
    mock = null;
    await until('channel 1 reported stopped', () =>
      (ticks(r) ?? []).some((c) => c.channel === 1 && !c.ticking),
    );
  });
});
