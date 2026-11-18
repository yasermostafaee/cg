import { createSocket } from 'node:dgram';
import { createMock } from '@cg/amcp-mock';
import { createBridge } from '@cg/caspar-bridge';
import { defaultFixedLayerBank, type TemplateInfo } from '@cg/shared-ipc';
import type { Locator } from '@playwright/test';
import { FakeLivePreview } from '../../../../tools/caspar-bridge/tests/support/fake-live-preview.js';
import { startFakePgmFeed } from '../../../../tools/caspar-bridge/tests/support/fake-pgm-feed.js';
import {
  FAKE_OPERATOR,
  FAKE_PLAYOUT_PASSWORD,
  startFakePlayout,
} from '../../../../tools/caspar-bridge/tests/support/fake-playout.js';
import { expect, test } from './fixtures/runtime.js';

const picture = '[data-input-picture]';
const state = '[data-input-check-state]';
const thumbnail = '[data-input-thumbnail]';
const previewName = 'Live input preview';
const PGM_PREFERENCE = 'cg.runtime.pgm-audio.v1';
const templateId = 'tpl-live-input-check';
const itemId = 'row-live-input-check';

function freeUdpPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const socket = createSocket('udp4');
    socket.once('error', reject);
    socket.bind(0, '127.0.0.1', () => {
      const port = socket.address().port;
      socket.close(() => resolve(port));
    });
  });
}

async function visibleCheckThumbnail(list: Locator, sourceName: string): Promise<Locator> {
  const tile = list.getByRole('button', { name: `Check input · ${sourceName}`, exact: true });
  await expect(tile).toHaveAttribute('data-input-thumbnail', 'checkable');
  await expect(tile).toHaveText('Preview unavailable');
  await expect(tile).toBeVisible();
  return tile;
}

test('C-023 · inspect input picture from source controls without changing a binding', async ({
  page,
}) => {
  test.setTimeout(75_000);
  const preview = new FakeLivePreview();
  preview.meterLevels = [-21, -18, -27, -30, -32, -34, -36, -38];
  let denyPreview = false;
  const playout = await startFakePlayout({
    livePreview: async (request, response) => {
      if (denyPreview) {
        response.writeHead(403, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ error: 'access.denied' }));
        return;
      }
      await preview.handle(request, response);
    },
  });
  const programme = await startFakePgmFeed({ port: 0 });
  const oscPort = await freeUdpPort();
  const engine = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 10 });
  const bridge = await createBridge({
    port: 0,
    playout: { auth: 'playout', address: playout.baseUrl, issuer: playout.issuer },
    connection: {
      servers: { A: { host: '127.0.0.1', amcpPort: engine.amcpPort, oscPort } },
      strategy: 'mirror-sync',
      autoFailoverEnabled: false,
    },
    pgmReturn: { portFor: () => programme.port },
    fixedLayers: defaultFixedLayerBank(),
  });
  try {
    const rect = { x: 240, y: 180, width: 960, height: 540 };
    const template: TemplateInfo = {
      templateId,
      templateType: 'lower-third',
      name: 'Live input check fixture',
      fields: [],
      liveSources: {
        resolution: { width: 1920, height: 1080 },
        defaultPosition: { anchor: 'center', offset: { x: 0, y: 0 } },
        sources: [{ elementId: 'el-1', sourceId: 'plate-1', rect, dynamic: false }],
        looks: [{ id: 'one', name: 'One', entered: { mode: 'cut' }, rects: { 'plate-1': rect } }],
        defaultLookId: 'one',
      },
    };
    bridge.runtime.templateImport(template, '<!doctype html><html><body>Fixture</body></html>', 1);
    await page.addInitScript(
      ({ url, storage }) => {
        const app = window as unknown as {
          __CG_BRIDGE_URL__: string;
          __CG_SPLASH_DISABLED__: boolean;
        };
        app.__CG_BRIDGE_URL__ = url;
        app.__CG_SPLASH_DISABLED__ = true;
        localStorage.setItem(storage, JSON.stringify({ on: true }));
      },
      { url: bridge.url, storage: PGM_PREFERENCE },
    );
    await page.goto('/');
    await page.locator('#cg-signin-user').fill(FAKE_OPERATOR.username);
    await page.locator('#cg-signin-pass').fill(FAKE_PLAYOUT_PASSWORD);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.getByRole('button', { name: 'Show monitors' }).click();
    const pv = page.getByRole('region', { name: 'PREVIEW (PVW)' });
    const pgm = page.locator('[data-pgm-picture]');
    await expect(pgm).toBeVisible();
    const pgmUrl = await pgm.getAttribute('src');
    await expect
      .poll(() => bridge.runtime.sourceCatalog().sources.map((source) => source.id))
      .toContain('in-li-studio1');
    await expect(pv.getByRole('combobox', { name: 'Check input' })).toHaveCount(0);
    const loaded = await page.evaluate(
      ({ id, template }) =>
        window.cg.fixedLayers.load({
          channel: 1,
          layer: 59,
          itemId: id,
          templateId: template,
          fields: {},
        }),
      { id: itemId, template: templateId },
    );
    expect(loaded).toMatchObject({ accepted: true });
    const row = page.locator('[data-layer="59"]').first();
    await row.locator('[data-row-body]').click();
    await row.getByRole('button', { name: 'ON PVW', exact: true }).click();
    await expect(pv.locator('[data-rehearsal-frame]')).toHaveCount(1);
    await page.locator('[data-open-template-defaults]').click();
    const defaults = page.getByRole('dialog', { name: 'Source defaults' });
    const inputServer = `Input server · ${new URL(playout.baseUrl).host}`;
    await expect(defaults.locator('[data-inputs-server]')).toHaveText(inputServer);
    const field = defaults.locator('[data-defaults-select="plate-1"]');
    const save = defaults.getByRole('button', { name: 'Save defaults' });
    await field.click();
    const options = page.getByRole('dialog', { name: 'Choose a source' });
    await expect(options.locator('[data-inputs-server]')).toHaveText(inputServer);
    const studio1 = options.locator('[data-picker-input="in-li-studio1"]');
    const studioTile = await visibleCheckThumbnail(options, 'Studio 1');
    await expect(options.locator(thumbnail)).toHaveCount(
      await options.locator('[data-picker-input]').count(),
    );
    const studioLabel = studio1.getByText('Studio 1', { exact: true });
    const tileBox = (await studioTile.boundingBox())!;
    const nameBox = (await studioLabel.boundingBox())!;
    expect(Math.abs(tileBox.height - (tileBox.width * 9) / 16)).toBeLessThan(1);
    expect(nameBox.y).toBeGreaterThanOrEqual(tileBox.y + tileBox.height);
    const unavailableRow = options.getByRole('row').filter({
      has: page.locator('[data-picker-input="in-li-input4"]'),
    });
    // Unavailable on A is still eligible for an independently resolved read on B.
    // Read eligibility does not select a source or commit a template binding.
    const unavailableTile = unavailableRow.locator('[data-input-thumbnail="checkable"]');
    await expect(unavailableTile).toBeVisible();
    await expect(unavailableTile).toHaveRole('button');
    await expect(unavailableRow.locator('[data-picker-input]')).toContainText('Unavailable');
    await expect(field).toHaveAttribute('data-picker-value', '');
    await options.getByRole('button', { name: 'Switch to list view', exact: true }).click();
    const studioRow = options.getByRole('row').filter({
      has: page.locator('[data-picker-input="in-li-studio1"]'),
    });
    const initialBackground = await studioRow.evaluate(
      (element) => getComputedStyle(element).backgroundColor,
    );
    await studioTile.hover();
    const activeBackground = await studioRow.evaluate(
      (element) => getComputedStyle(element).backgroundColor,
    );
    expect(activeBackground).not.toBe(initialBackground);
    await studioTile.focus();
    await options.getByRole('button', { name: 'Switch to grid view', exact: true }).hover();
    await expect(studioRow).toHaveCSS('background-color', activeBackground);
    await options.getByRole('button', { name: 'Switch to grid view', exact: true }).click();
    const anotherInput = options.locator('[data-picker-input="in-li-newscam"]');
    await anotherInput.hover();
    const initialOutline = await studioRow.evaluate((row) => getComputedStyle(row).borderColor);
    const idlePicture = (await studioTile.boundingBox())!;
    const idleCard = (await studioRow.boundingBox())!;
    const passiveMeter = studioRow.locator('[data-source-audio-meter]');
    await expect(passiveMeter.locator('[data-input-meter-channel]')).toHaveCount(2);
    const passiveMeterWidth = (await passiveMeter.boundingBox())!.width;
    await studioTile.click();
    await expect(field).toHaveAttribute('data-picker-value', '');
    await expect(studio1).toHaveAttribute('aria-selected', 'true');
    await anotherInput.hover();
    await expect(studioRow).not.toHaveCSS('border-color', initialOutline);
    const card = studioRow.getByRole('region', { name: previewName });
    await expect(options).toBeVisible();
    await expect(options.getByRole('button', { name: 'Select', exact: true })).toBeEnabled();
    await expect(defaults.locator('[data-input-check]')).toHaveCount(0);
    await expect(card.locator(state)).toHaveAttribute('data-input-check-state', 'ready');
    await expect(card.locator(state)).toHaveText('Picture received · Server A');
    await expect(card.locator(picture)).toBeVisible();
    const checkedPicture = (await card.locator('[data-input-thumbnail="active"]').boundingBox())!;
    const checkedCard = (await studioRow.boundingBox())!;
    for (const side of ['x', 'y', 'width', 'height'] as const) {
      expect(checkedPicture[side]).toBeCloseTo(idlePicture[side], 0);
      expect(checkedCard[side]).toBeCloseTo(idleCard[side], 0);
    }
    expect(passiveMeterWidth).toBeLessThan(16);
    const pixels = await card.locator(picture).evaluate((canvas: HTMLCanvasElement) => {
      return canvas.getContext('2d')?.getImageData(0, 0, 1, 1).data[3];
    });
    expect(pixels).toBe(255);
    const meterBars = card.locator('[data-input-meter] .cg-input-meter__level');
    await expect(meterBars).toHaveCount(8);
    const activeMeter = (await card.locator('[data-input-meter]').boundingBox())!;
    expect(activeMeter.x).toBeCloseTo(checkedPicture.x + checkedPicture.width, 0);
    expect(activeMeter.height).toBeCloseTo(checkedPicture.height, 0);
    await expect(meterBars.nth(3)).toHaveCSS('clip-path', 'inset(50% 0px 0px)');
    const meter = meterBars.first();
    await expect
      .poll(() => meter.evaluate((bar) => (bar as HTMLElement).style.clipPath))
      .toMatch(/^inset\(35(?:\.00)?% /);
    const sound = card.getByRole('button', { name: 'Input preview sound' });
    await expect(sound).toHaveAttribute('aria-pressed', 'false');
    expect(preview.audioOpens).toBe(0);
    await sound.click();
    await expect(sound).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => preview.audioOpens).toBe(1);

    preview.staleMeter = true;
    await expect(meter).toHaveCSS('clip-path', 'inset(100% 0px 0px)');
    await expect(card.locator(picture)).toBeVisible();
    preview.stalledVideo = true;
    await expect(card.locator(state)).toHaveAttribute('data-input-check-state', 'stalled');
    await expect(card.locator(picture)).toBeHidden();
    await expect(card.getByText('No current picture', { exact: true })).toBeVisible();
    await expect(sound).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(() => preview.audioCloses).toBe(1);
    await expect(pgm).toHaveAttribute('src', pgmUrl ?? '');
    expect(await page.evaluate((key) => localStorage.getItem(key), PGM_PREFERENCE)).toBe(
      '{"on":true}',
    );
    await card.getByRole('button', { name: 'Close input check' }).click();
    await expect(studioTile).toBeVisible();
    const restoredPicture = (await studioTile.boundingBox())!;
    expect(restoredPicture.width).toBeCloseTo(idlePicture.width, 0);
    expect(restoredPicture.height).toBeCloseTo(idlePicture.height, 0);
    preview.staleMeter = false;
    preview.stalledVideo = false;
    expect(preview.starts).toHaveLength(1);

    denyPreview = true;
    await studioTile.click();
    await expect(card.locator(state)).toHaveAttribute('data-input-check-state', 'forbidden');
    await expect(card.locator(state)).toHaveText('Access denied · Server A');
    await expect(card.locator('[data-input-check-detail]')).toHaveText(
      'Playout refused access to this input preview.',
    );
    await expect(card.locator(picture)).toBeHidden();
    await expect(sound).toBeDisabled();
    await expect(field).toHaveAttribute('data-picker-value', '');
    await expect(pgm).toHaveAttribute('src', pgmUrl ?? '');
    expect(preview.starts).toHaveLength(1);
    await card.getByRole('button', { name: 'Close input check' }).click();
    denyPreview = false;

    await studio1.click();
    await expect(studio1).toHaveAttribute('aria-selected', 'true');
    await expect(field).toHaveAttribute('data-picker-value', '');
    await expect(studioRow.locator(picture)).toBeVisible();
    await options.getByRole('button', { name: 'Select', exact: true }).click();
    await expect(field).toHaveAttribute('data-picker-value', 'in-li-studio1');
    await expect(save).toBeEnabled();
    await field.click();
    const checkNews = await visibleCheckThumbnail(options, 'دوربین خبر');
    expect(preview.starts).toHaveLength(2);
    await checkNews.focus();
    await page.keyboard.press('Enter');
    await expect(options).toBeVisible();
    await expect(options.getByRole('button', { name: 'Select', exact: true })).toBeEnabled();
    await expect(defaults).toBeVisible();
    const dialogCheck = options.getByRole('region', { name: previewName });
    await expect(
      dialogCheck.getByRole('img', { name: 'Live input picture for دوربین خبر' }),
    ).toBeVisible();
    await expect(dialogCheck.locator(state)).toHaveAttribute('data-input-check-state', 'ready');
    await expect(dialogCheck.getByRole('button', { name: 'Input preview sound' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await expect(field).toHaveAttribute('data-picker-value', 'in-li-studio1');
    await expect(save).toBeEnabled();
    await expect(pv.locator('[data-rehearsal-frame]')).toHaveCount(1);
    expect(bridge.runtime.sourceAssignments().assignments).toEqual([]);
    await options.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(options).toHaveCount(0);
    await expect.poll(() => preview.leases.size).toBe(0);
    await defaults.getByRole('button', { name: 'Cancel' }).click();
    await expect.poll(() => preview.leases.size).toBe(0);

    const look = page.locator('[aria-label="Plate inputs"]');
    const lookField = look.locator('[data-look-binding="one:plate-1"]');
    const previousLookValue = await lookField.getAttribute('data-picker-value');
    await lookField.click();
    const lookTile = await visibleCheckThumbnail(options, 'Studio 1');
    expect(preview.starts).toHaveLength(3);
    await lookTile.click();
    const lookCheck = options.getByRole('region', { name: previewName });
    await expect(lookCheck.locator(picture)).toBeVisible();
    await expect(lookField).toHaveAttribute('data-picker-value', previousLookValue ?? '');
    await options.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect.poll(() => preview.leases.size).toBe(0);

    const swap = page.getByRole('dialog', { name: 'Live source for this row' });
    const sourceAction = page
      .getByRole('menu', { name: 'Live layer 59 actions', exact: true })
      .getByRole('menuitem', { name: 'SOURCE', exact: true });
    const bridgeLink = page.getByRole('status', { name: 'Bridge link' });
    await expect(bridgeLink).toHaveText(/BRIDGE LIVE$/);
    // Finish scrolling the row into view before opening its keyboard menu.
    // The menu closes on scroll. Bound each attempt so one close cannot consume the retry window.
    await row.scrollIntoViewIfNeeded();
    await row.focus();
    await expect(async () => {
      if (await swap.isVisible()) return;
      await row.press('ContextMenu', { timeout: 2_000 });
      await sourceAction.press('Enter', { timeout: 2_000 });
      await expect(swap).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 10_000 });
    await expect(bridgeLink).toHaveText(/BRIDGE LIVE$/);
    const swapField = swap.getByRole('combobox', { name: 'Live source for Plate 1' });
    await swapField.click();
    const swapTile = await visibleCheckThumbnail(options, 'Studio 1');
    expect(preview.starts).toHaveLength(4);
    await swapTile.click();
    await expect(options.getByRole('region', { name: previewName }).locator(picture)).toBeVisible();
    await expect(swapField).toHaveAttribute('data-picker-value', '');
    await options.getByRole('button', { name: 'Cancel', exact: true }).click();
    await swap.locator('[data-modal-role="cancel"]').click();
    await expect.poll(() => preview.leases.size).toBe(0);

    await page.getByRole('button', { name: 'Open Station setup' }).click();
    const setup = page.getByRole('dialog', { name: 'Station setup' });
    await setup.getByRole('tab', { name: /^Live sources/ }).click();
    await expect(setup.locator('[data-inputs-server]')).toHaveText(inputServer);
    const setupTile = await visibleCheckThumbnail(setup, 'Studio 1');
    const setupBox = (await setupTile.boundingBox())!;
    expect(tileBox.width).toBeGreaterThan(setupBox.width);
    expect(Math.abs(setupBox.height - (setupBox.width * 9) / 16)).toBeLessThan(1);
    await expect(setup.locator(thumbnail)).toHaveCount(
      await setup.locator('[data-source-input]').count(),
    );
    const setupHeights = await setup
      .locator(thumbnail)
      .evaluateAll((tiles) => tiles.map((tile) => tile.getBoundingClientRect().height));
    expect(setupHeights.length).toBeGreaterThan(1);
    expect(Math.max(...setupHeights) - Math.min(...setupHeights)).toBeLessThan(1);
    const setupRow = setup.locator('[data-source-input]', { hasText: 'Studio 1' });
    const setupMeter = setupRow.locator('[data-source-audio-meter]');
    await expect(setupMeter).toHaveAccessibleName('Studio 1 · Audio level unavailable');
    expect(preview.starts).toHaveLength(5);
    await setupTile.click();
    await expect(
      setupRow.getByRole('region', { name: previewName }).locator(picture),
    ).toBeVisible();
    await setupMeter.scrollIntoViewIfNeeded();
    await expect(setupMeter).toBeInViewport();
    await expect(setupMeter).toHaveAccessibleName('Studio 1 · Audio peak -18 dBFS');
    expect(preview.starts).toHaveLength(6);
    await page.keyboard.press('Escape');
    await expect(setup).toBeHidden();
    await expect.poll(() => preview.leases.size).toBe(0);
    expect(preview.starts.map(({ body }) => body)).toMatchObject([
      { inputId: 'li-studio1' },
      { inputId: 'li-studio1' },
      { inputId: 'li-newscam' },
      { inputId: 'li-studio1' },
      { inputId: 'li-studio1' },
      { inputId: 'li-studio1' },
    ]);
    await expect(pgm).toHaveAttribute('src', pgmUrl ?? '');
  } finally {
    await bridge.close();
    await engine.stop();
    await programme.stop();
    await playout.stop();
  }
});
