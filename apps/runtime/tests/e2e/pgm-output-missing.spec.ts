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
    await expect(alert).toContainText('Station setup ▸ Outputs');
    // B-223 — the operator's line stops there; the engineering detail is not on the banner.
    await expect(alert).not.toContainText('restart CasparCG');
    // Every reachability signal is still true — the alarm coexists with a green pill.
    await expect(page.getByLabel('Status bar')).toContainText('HEALTHY');

    // B-223 — the technical surface carries what the banner dropped.
    await page.getByRole('button', { name: 'Open Station setup', exact: true }).click();
    const outputs = page
      .getByRole('dialog', { name: 'Station setup' })
      .getByRole('region', { name: 'Program outputs' });
    await expect(outputs).toContainText('decklink (device 23487013)');
    await expect(outputs).toContainText('Running: system-audio, screen');
    // `RUNTIME-REDESIGN-01` Phase 7 — the reference's table over the same detail: one row per
    // declared consumer, the missing DeckLink's row marked, the count beside the heading.
    await expect(outputs.locator('[data-output-table] th')).toHaveText([
      'Slot',
      'Configured output',
      'Runtime status',
    ]);
    await expect(outputs.locator('[data-output-row="missing"]')).toHaveCount(1);
    await expect(outputs.locator('[data-output-count]')).toHaveText('2 of 3 running');
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

    await page.getByRole('button', { name: 'Open Station setup', exact: true }).click();
    const outputs = page
      .getByRole('dialog', { name: 'Station setup' })
      .getByRole('region', { name: 'Program outputs' });
    await expect(outputs).toContainText('Channel 1 on server A');
    await expect(outputs).toContainText('Preview');
    await expect(outputs).toContainText('no effect on air');
    await expect(outputs).not.toContainText('restart CasparCG');
  });

  /**
   * 🔴 `SETTINGS-POLISH-04` §8 — **THE OUTPUTS TABLE IS READ-ONLY, SO IT HAS NO ROW HOVER —
   * AND THE HOVER WAS NOT MERELY A FALSE PROMISE.**
   *
   * The rule, written down because it is the rule and not the exception: a row that lights
   * under the pointer is promising an interaction. Outputs reports what the server declares
   * against what it is running and there is nothing to click on any row of it (`R-055`, §6 one
   * surface along).
   *
   * ⚠ **AND THE MEASUREMENT FOUND SOMETHING WORSE THAN THE FALSE PROMISE.** The hover painted
   * the CELLS, and so does the not-running row's amber wash — so hovering the one row that says
   * an output is DOWN replaced its alarm colour with the neutral grey. Measured here before the
   * fix: at rest `rgb(53, 45, 30)`, under the pointer `rgb(29, 36, 45)`. The operator moved the
   * mouse towards the row he was reading and the evidence went out from under it.
   *
   * ⚠ **THIS TEST LIVES HERE AND NOT IN `settings-polish.spec.ts` FOR A REASON THAT IS ABOUT
   * THE FIXTURE, NOT CONVENIENCE.** The offline `MockRuntime` publishes no output check at all,
   * so there is no table to measure without a real bridge and a mock CasparCG — which this file
   * already boots, scripted to the plant's 2026-09-04 answers. A copy of that harness next door
   * would be a second place for it to drift.
   */
  test('SETTINGS-POLISH-04 §8 — the Outputs table has no row hover, and the alarm wash survives the pointer', async ({
    page,
  }) => {
    await boot(page, { running: [...MONITORS], config: PLANT_CONFIG });
    await expect(page.getByLabel('Status bar')).toContainText('HEALTHY', { timeout: 15_000 });
    await page.getByRole('button', { name: 'Open Station setup', exact: true }).click();
    const outputs = page
      .getByRole('dialog', { name: 'Station setup' })
      .getByRole('region', { name: 'Program outputs' });
    const rows = outputs.locator('[data-output-table] tbody tr');
    await expect(rows).toHaveCount(3, { timeout: 30_000 });

    /** Every row's state and its first cell's PAINTED ground, top to bottom. */
    const snapshot = (): Promise<{ state: string | null; cell: string }[]> =>
      outputs.evaluate((el) =>
        [...el.querySelectorAll('[data-output-table] tbody tr')].map((tr) => ({
          state: tr.getAttribute('data-output-row'),
          cell: getComputedStyle(tr.querySelector('td')!).backgroundColor,
        })),
      );

    const rest = await snapshot();
    const missing = rest.find((r) => r.state === 'missing');
    const running = rest.find((r) => r.state === 'running');
    expect(missing, 'the plant fixture declares a DeckLink that is not running').toBeDefined();
    expect(running, 'and two consumers that are — the positive control').toBeDefined();

    /*
      THE WASH — `.output-warning td{background:#28241d40}`. The ALPHA is the design: it
      composites over whatever the cell already has instead of replacing it, which is what stops
      anything under it being painted out again.
    */
    expect(missing?.cell, 'the not-running row wears the amber wash at 25 %').toBe(
      'rgba(40, 36, 29, 0.25)',
    );
    expect(running?.cell, 'a running row wears nothing').toBe('rgba(0, 0, 0, 0)');

    // Hovering EITHER row changes nothing about ANY row — and the alarm colour survives.
    for (const state of ['missing', 'running'] as const) {
      const row = outputs
        .locator(`[data-output-table] tbody tr[data-output-row="${state}"]`)
        .first();
      await row.scrollIntoViewIfNeeded();
      await row.hover();
      await expect(row).toHaveCSS('cursor', 'auto');
      expect(
        await snapshot(),
        `hovering the ${state} row must change nothing — the table is read-only`,
      ).toEqual(rest);
    }

    // ⭐ AND OUR SENTENCES STAY. They are more honest than the reference's single line.
    await expect(outputs).toContainText('Declared: decklink, screen, system-audio');
    await expect(outputs).toContainText('Running: system-audio, screen');
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
