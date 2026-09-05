import * as dgram from 'node:dgram';
import { createBridge, type BridgeHandle } from '@cg/caspar-bridge';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import type { ConnectionConfig, RunningConsumer } from '@cg/shared-ipc';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures/runtime.js';

/**
 * `C-029` — the program-output alarm, end to end through the real browser, a real
 * in-process bridge and a mock CasparCG scripted to answer what the plant answered on
 * 2026-09-04: `INFO CONFIG` declares `<decklink><device>23487013</device>`, `INFO 1` runs
 * only `system-audio` and `screen`. Maps the change's scenarios:
 *
 *   - "The fixture raises the alarm, in words an operator can act on"
 *   - "The alarm clears when the declared consumer is seen running"
 *   - "Nothing lights when every declared consumer is running"
 *   - `B-223`: "A missing local monitor raises no operator alarm" and "The engineering detail
 *     lives on the technical surface"
 *
 * Boots the real `WebSocketRuntime` (the shape `retention-honesty.spec.ts` established)
 * rather than the `app` fixture, because the `MockRuntime` has no bridge and no server to
 * read `INFO` from. Serial for the load reason that file gives: each test boots a bridge
 * and a mock with a 10 Hz OSC emitter.
 */

let bridge: BridgeHandle | null = null;
let mock: MockHandle | null = null;

test.afterEach(async () => {
  await bridge?.close();
  bridge = null;
  await mock?.stop();
  mock = null;
});

test.describe.configure({ mode: 'serial' });

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

function connection(amcpPort: number, oscPort: number): ConnectionConfig {
  return {
    servers: { A: { host: '127.0.0.1', amcpPort, oscPort } },
    strategy: 'mirror-sync',
    autoFailoverEnabled: false,
  };
}

const PLANT_CONFIG =
  '<?xml version="1.0" encoding="utf-8"?>\n<configuration>\n   <channels>\n      <channel>\n' +
  '         <video-mode>1080p5000</video-mode>\n         <consumers>\n            <decklink>\n' +
  '               <device>23487013</device>\n               <embedded-audio>true</embedded-audio>\n' +
  '               <keyer>default</keyer>\n            </decklink>\n            <screen/>\n' +
  '            <system-audio/>\n         </consumers>\n      </channel>\n   </channels>\n' +
  '</configuration>\n';

const MONITORS: RunningConsumer[] = [
  { port: 500, kind: 'system-audio' },
  { port: 600, kind: 'screen' },
];

function channelXml(running: readonly RunningConsumer[]): string {
  const ports = running
    .map(
      (r) =>
        `         <port_${String(r.port)}>\n            <consumer>${r.kind}</consumer>\n         </port_${String(r.port)}>\n`,
    )
    .join('');
  return (
    '<?xml version="1.0" encoding="utf-8"?>\n<channel>\n   <format>1080p5000</format>\n' +
    `   <output>\n      <port>\n${ports}      </port>\n   </output>\n</channel>\n`
  );
}

/** Boot a mock CasparCG scripted from `state`, a real bridge on it, and the page. */
async function boot(
  page: Page,
  state: { running: RunningConsumer[]; config: string | null },
): Promise<void> {
  const oscPort = await freeUdpPort();
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 10 });
  if (state.config !== null) {
    const config = state.config;
    mock.setHandler('INFO', (req) => {
      if (req.args.length === 0) {
        return { kind: 'ok-multi', code: 200, verb: 'INFO', lines: ['1 1080p5000 PLAYING'] };
      }
      if (req.args[0]?.toUpperCase() === 'CONFIG') {
        return { kind: 'ok-line', code: 201, verb: 'INFO', data: config };
      }
      return { kind: 'ok-line', code: 201, verb: 'INFO', data: channelXml(state.running) };
    });
  }
  bridge = await createBridge({
    port: 0,
    connection: connection(mock.amcpPort, oscPort),
    // Fast re-check so the CLEAR half of the scenario lands inside a test.
    runtimeTuning: { outputRecheckMs: 500 },
  });
  const url = bridge.url;
  await page.addInitScript(
    ([u]) => {
      (window as unknown as { __CG_BRIDGE_URL__: string }).__CG_BRIDGE_URL__ = u as string;
    },
    [url],
  );
  await page.goto('/');
  await expect(page.getByRole('status', { name: 'Bridge link' })).toContainText('BRIDGE LIVE');
}

test.describe('C-029 — program output missing', () => {
  test('the plant’s fixture raises the alarm, in words an operator can act on, and it clears when the output is seen', async ({
    page,
  }) => {
    const state = { running: [...MONITORS], config: PLANT_CONFIG };
    await boot(page, state);

    const alert = page.getByRole('alert', { name: 'Program output missing' });
    await expect(alert).toBeVisible({ timeout: 15_000 });
    await expect(alert).toContainText('PROGRAM OUTPUT MISSING');
    await expect(alert).toContainText('CHANNEL 1 HAS NO DECKLINK OUTPUT');
    await expect(alert).toContainText('decklink (device 23487013)');
    await expect(alert).toContainText('Server connection ▸ Outputs');
    // B-223 — the operator's line stops there; the engineering detail is not on the banner.
    await expect(alert).not.toContainText('restart CasparCG');
    // Every reachability signal is still true — the alarm coexists with a green pill.
    await expect(page.getByLabel('Status bar')).toContainText('HEALTHY');

    // B-223 — the technical surface carries what the banner dropped.
    await page.getByRole('button', { name: 'Open server settings' }).click();
    const outputs = page
      .getByRole('dialog', { name: 'Server connection settings' })
      .getByRole('region', { name: 'Program outputs' });
    await expect(outputs).toContainText('decklink (device 23487013)');
    await expect(outputs).toContainText('Running: system-audio, screen');
    await expect(outputs).toContainText('hardware persistent ID 23487013');
    await expect(outputs).toContainText('restart CasparCG');
    await page.keyboard.press('Escape');

    // The declared consumer comes up (a fixed config and a restart, or a hand-typed ADD).
    state.running = [...MONITORS, { port: 23487313, kind: 'decklink' }];
    await expect(alert).toHaveCount(0, { timeout: 15_000 });
  });

  test('B-223 — a stopped screen consumer raises nothing for the operator, and is noted on the technical surface', async ({
    page,
  }) => {
    // The plant on 2026-09-05: the DeckLink running, the screen consumer stopped by hand.
    const state = {
      running: [
        { port: 500, kind: 'system-audio' },
        { port: 23487313, kind: 'decklink' },
      ],
      config: PLANT_CONFIG,
    };
    await boot(page, state);
    await expect(page.getByLabel('Status bar')).toContainText('HEALTHY', { timeout: 15_000 });
    // Give the first sweep tick time to land both reads and publish the verdict.
    await page.waitForTimeout(6_000);
    await expect(page.getByRole('alert', { name: 'Program output missing' })).toHaveCount(0);
    await expect(page.getByRole('alert', { name: 'Program output unverified' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Open server settings' }).click();
    const outputs = page
      .getByRole('dialog', { name: 'Server connection settings' })
      .getByRole('region', { name: 'Program outputs' });
    await expect(outputs).toContainText('Channel 1 on server A');
    await expect(outputs).toContainText('Preview');
    await expect(outputs).toContainText('no effect on air');
    await expect(outputs).not.toContainText('restart CasparCG');
  });

  test('nothing lights when every declared consumer is running (the mock’s own defaults)', async ({
    page,
  }) => {
    // The mock's built-in INFO CONFIG declares screen + system-audio and its INFO 1 runs both.
    await boot(page, { running: [], config: null });
    await expect(page.getByLabel('Status bar')).toContainText('HEALTHY', { timeout: 15_000 });
    // Give the first sweep tick (5 s in a production-tuned bridge) time to land its reads.
    await page.waitForTimeout(6_000);
    await expect(page.getByRole('alert', { name: 'Program output missing' })).toHaveCount(0);
    await expect(page.getByRole('alert', { name: 'Program output unverified' })).toHaveCount(0);
  });
});
