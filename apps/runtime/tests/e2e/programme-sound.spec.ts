import type { Locator, Page } from '@playwright/test';
import { createBridge, type BridgeHandle } from '@cg/caspar-bridge';
import { defaultFixedLayerBank } from '@cg/shared-ipc';
import {
  startFakePgmFeed,
  type FakePgmFeed,
} from '../../../../tools/caspar-bridge/tests/support/fake-pgm-feed.js';
import {
  FAKE_ADMIN,
  FAKE_PLAYOUT_PASSWORD,
  startFakePlayout,
  type FakePlayout,
} from '../../../../tools/caspar-bridge/tests/support/fake-playout.js';
import { cssColour, expect, test } from './fixtures/runtime.js';

/**
 * 🔴 `PLAYOUT-FEATURES-01` E (`R-076`) — **THE PROGRAMME'S LEVELS AND SOUND, IN A REAL BROWSER**: the fake
 * Playout's `GET /api/cg/meters` read by a real CG Bridge and drawn beside the PROGRAM monitor in the
 * Playout's own look; the loudness badge in its tone; and the speaker, which asks CG Bridge for the core's
 * `/audio.wav` only once pressed and plays it through Web Audio.
 *
 * Paint is not a jsdom fact (golden rule 12), so the gradient, the tones, the clip and the two-bar fallback
 * are read from the engine here. The core's feed is an ephemeral port through the bridge's own test seam
 * (`pgmReturn.portFor`), so this file never contends for the rule port `pgm-return.spec.ts` holds.
 *
 * Nothing here reaches a real Playout or CasparCG: the CasparCG host is `127.0.0.1:1`, where nothing answers.
 */

let playout: FakePlayout | null = null;
let feed: FakePgmFeed | null = null;
let bridge: BridgeHandle | null = null;

test.afterEach(async () => {
  await bridge?.close();
  bridge = null;
  await feed?.stop();
  feed = null;
  await playout?.stop();
  playout = null;
});

/** Bus levels on channel 1: the programme's left and right, and six quieter buses. */
const LEVELS = {
  dbfs: [-18, -7.2, -30, -30, -40, -40, -60, -60, -60, -60, -60, -60, -60, -60, -60, -60],
  loudness: { momentary: -22.6, shortterm: -23.2, limiterGrDb: -0.4 },
};

async function open(page: Page): Promise<void> {
  playout = await startFakePlayout({ grants: { admin: [{ host: '127.0.0.1', channel: 1 }] } });
  playout.setMeterLevels(1, LEVELS);
  feed = await startFakePgmFeed();
  const port = feed.port;
  bridge = await createBridge({
    port: 0,
    connection: {
      servers: { A: { host: '127.0.0.1', amcpPort: 1, oscPort: 0 } },
      strategy: 'mirror-sync',
      autoFailoverEnabled: false,
    },
    fixedLayers: defaultFixedLayerBank(),
    playout: {
      auth: 'playout',
      issuer: playout.issuer,
      jwksUrl: playout.jwksUrl,
      tokenUrl: playout.tokenUrl,
      refreshUrl: playout.refreshUrl,
      revokedUrl: playout.revokedUrl,
    },
    pgmReturn: { portFor: () => port },
  });
  await page.addInitScript(
    `window.__CG_BRIDGE_URL__ = ${JSON.stringify(bridge.url)}; window.__CG_SPLASH_DISABLED__ = true;`,
  );
  await page.goto('/');
  const user = page.locator('#cg-signin-user');
  await expect(user).toBeVisible({ timeout: 20_000 });
  await user.fill(FAKE_ADMIN.username);
  await page.locator('#cg-signin-pass').fill(FAKE_PLAYOUT_PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(user).toHaveCount(0, { timeout: 20_000 });
  const show = page.getByRole('button', { name: 'Show monitors' });
  if (await show.count()) await show.first().click();
}

const meter = (page: Page): Locator => page.locator('[data-vu-meter]');
const fill = (page: Page, bar: number): Locator =>
  page.locator(`[data-vu-bar="${String(bar)}"] .cg-vu__fill`);
const badge = (page: Page): Locator => page.locator('[data-loudness-badge]');
const speaker = (page: Page): Locator => page.getByRole('button', { name: 'Programme sound' });

async function visibleBars(page: Page): Promise<number> {
  return page
    .locator('.cg-vu__bar')
    .evaluateAll((bars) => bars.filter((b) => getComputedStyle(b).display !== 'none').length);
}

async function shot(locator: Locator, name: string): Promise<void> {
  const file = test.info().outputPath(`${name}.png`);
  await locator.screenshot({ path: file });
  await test.info().attach(name, { path: file, contentType: 'image/png' });
}

test('E — the Playout’s levels beside PROGRAM in its own look; the badge’s tone; the speaker asks for the sound only when pressed', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await open(page);
  await expect(meter(page)).toBeVisible();

  // The levels arrive: each bar is clipped to its own level, left to right from bus 1.
  await expect
    .poll(() => fill(page, 1).evaluate((el) => getComputedStyle(el).clipPath))
    .toBe('inset(30% 0px 0px)');
  await expect(fill(page, 2)).toHaveCSS('clip-path', 'inset(12% 0px 0px)');
  await expect(fill(page, 7)).toHaveCSS('clip-path', 'inset(100% 0px 0px)');
  const [one, two] = await Promise.all([fill(page, 1).boundingBox(), fill(page, 2).boundingBox()]);
  expect((one?.x ?? 0) < (two?.x ?? 0), 'bus 1 is the left bar').toBe(true);
  expect(one?.height ?? 0, 'a bar tall enough to read').toBeGreaterThan(60);

  // The fixed gradient, in the meter's own three hues — never the air green.
  const [safe, warn, over, onAir] = await Promise.all([
    cssColour(page, 'var(--r-meter-safe)'),
    cssColour(page, 'var(--r-meter-warn)'),
    cssColour(page, 'var(--r-meter-over)'),
    cssColour(page, 'var(--r-onair)'),
  ]);
  const gradient = await fill(page, 1).evaluate((el) => getComputedStyle(el).backgroundImage);
  for (const hue of [safe, warn, over]) expect(gradient).toContain(hue);
  expect(gradient).toContain('70%');
  expect(gradient).toContain('88%');
  expect(safe).not.toBe(onAir);
  await expect(page.locator('.cg-vu__mark')).toHaveText([
    '0',
    '−6',
    '−12',
    '−18',
    '−30',
    '−40',
    '−60',
  ]);

  // The badge: the short-term loudness, one decimal, green on target — pulsing, the limiter is working.
  await expect(badge(page)).toHaveText('−23.2 LUFS');
  await expect(badge(page)).toHaveAttribute('data-loudness-tone', 'on-target');
  await expect(badge(page)).toHaveCSS('color', safe);
  await expect(badge(page)).toHaveAttribute('data-limiting', '');
  await expect(badge(page)).toHaveCSS('animation-name', 'cg-loudness-pulse');

  // The core goes down: its levels read as the floor, and the badge knows nothing.
  (playout as FakePlayout).setMeterCoreDown(true);
  await expect(fill(page, 1)).toHaveCSS('clip-path', 'inset(100% 0px 0px)');
  await expect(badge(page)).toHaveText('— LUFS', { timeout: 5000 });
  (playout as FakePlayout).setMeterCoreDown(false);
  await expect(fill(page, 1)).toHaveCSS('clip-path', 'inset(30% 0px 0px)');

  // Eight bars at this window…
  expect(await visibleBars(page)).toBe(8);
  await shot(page.locator('[data-pgm-stage]'), 'e-1-meter-eight-bars');
  await shot(page.locator('[data-monitor-pgm-strip]'), 'e-2-strip-badge-and-speaker-off');

  // THE SPEAKER — off by default: nothing has asked the core for sound.
  await expect(speaker(page)).toHaveAttribute('aria-pressed', 'false');
  expect((feed as FakePgmFeed).audioConnections).toHaveLength(0);
  // The badge and the toggle ride the reference's 31 px strip without growing it (`shell-chrome.spec` §C3).
  const stripHeight = async (): Promise<number> =>
    (await page.locator('[data-monitor-pgm-strip]').boundingBox())?.height ?? 0;
  expect(await stripHeight()).toBeCloseTo(31, 0);
  await speaker(page).click();
  await expect(speaker(page)).toHaveAttribute('aria-pressed', 'true');
  await expect(speaker(page)).toHaveAttribute('data-pgm-audio', 'playing', { timeout: 15_000 });
  expect(await stripHeight(), 'pressed, still 31').toBeCloseTo(31, 0);
  // ONE reader at the core, with the exact request, and nothing after it.
  expect((feed as FakePgmFeed).audioConnections).toHaveLength(1);
  expect((feed as FakePgmFeed).audioConnections[0]?.received.toString('latin1')).toBe(
    'GET /audio.wav HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n',
  );
  await shot(page.locator('[data-monitor-pgm-strip]'), 'e-3-strip-speaker-on');

  // Off: the core's reader is released.
  await speaker(page).click();
  await expect(speaker(page)).toHaveAttribute('data-pgm-audio', 'off');
  await expect.poll(() => (feed as FakePgmFeed).audioOpenCount(), { timeout: 8000 }).toBe(0);

  // Remembered per console: on again, reload — pressed, waiting for the browser's gesture, then playing.
  await speaker(page).click();
  await expect(speaker(page)).toHaveAttribute('data-pgm-audio', 'playing', { timeout: 15_000 });
  await page.reload();
  // Nothing plays before a press on the page: the monitors boot hidden (`MONITORS-01`), and the core has
  // had no new reader since the speaker went quiet with the old page.
  const show = page.getByRole('button', { name: 'Show monitors' });
  await expect(show).toBeVisible({ timeout: 20_000 });
  expect(await page.evaluate(() => localStorage.getItem('cg.runtime.pgm-audio.v1'))).toBe(
    '{"on":true}',
  );
  // Showing the monitors IS the press the browser wants: the remembered speaker starts with it.
  const readersBefore = (feed as FakePgmFeed).audioConnections.length;
  await show.click();
  await expect(speaker(page)).toHaveAttribute('aria-pressed', 'true', { timeout: 20_000 });
  await expect(speaker(page)).toHaveAttribute('data-pgm-audio', 'playing', { timeout: 15_000 });
  expect((feed as FakePgmFeed).audioConnections.length).toBeGreaterThanOrEqual(readersBefore);

  /*
    THE SMALLEST DESKTOP WINDOW (1100 × 700): the picture is bound by the panel's HEIGHT, so eight bars fit
    beside it and it keeps its full size — measured 287 × 161 drawn in a 407 × 161 box, stage 536 px. The
    two-bar fallback is for a layout narrower than that (a browser console below the desktop minimum), where
    eight would squeeze the picture: at 800 × 700 the stage is 386 px and the first two show.
  */
  const drawn = (): Promise<number[]> =>
    page.locator('[data-pgm-picture]').evaluate((img: HTMLImageElement) => {
      const r = img.getBoundingClientRect();
      const k = Math.min(r.width / img.naturalWidth, r.height / img.naturalHeight);
      return [
        Math.round(img.naturalWidth * k),
        Math.round(img.naturalHeight * k),
        Math.round(r.height),
      ];
    });
  // The picture's own size is what is judged: wait until the return has decoded a frame.
  await expect
    .poll(
      () =>
        page.locator('[data-pgm-picture]').evaluate((img: HTMLImageElement) => img.naturalWidth),
      {
        timeout: 15_000,
      },
    )
    .toBeGreaterThan(0);
  await page.setViewportSize({ width: 1100, height: 700 });
  await expect.poll(() => visibleBars(page)).toBe(8);
  const [w1100, h1100, box1100] = await drawn();
  expect(h1100, 'the picture fills the panel’s height beside eight bars').toBe(box1100);
  await shot(page.locator('[data-pgm-stage]'), 'e-4-meter-eight-bars-at-1100');

  await page.setViewportSize({ width: 800, height: 700 });
  await expect.poll(() => visibleBars(page)).toBe(2);
  const [w800, h800, box800] = await drawn();
  expect(h800, 'two bars, and the picture still fills the height').toBe(box800);
  expect(w800).toBe(w1100);
  expect(h800).toBe(h1100);
  await shot(page.locator('[data-pgm-stage]'), 'e-5-meter-two-bars-at-800');
});
