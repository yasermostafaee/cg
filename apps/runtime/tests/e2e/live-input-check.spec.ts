import { createSocket } from 'node:dgram';
import { createMock } from '@cg/amcp-mock';
import { createBridge } from '@cg/caspar-bridge';
import { defaultFixedLayerBank, type TemplateInfo } from '@cg/shared-ipc';
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

test('C-023 · check from PVW and Source defaults, hear only on request, and clear stale picture', async ({
  page,
}) => {
  test.setTimeout(75_000);
  const preview = new FakeLivePreview();
  const playout = await startFakePlayout({ livePreview: preview.handle });
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
    const check = pv.getByRole('combobox', { name: 'Check input' });
    await check.click();
    const chooser = page.getByRole('dialog', { name: 'Choose an input to check' });
    await expect(chooser.locator('[data-picker-input="in-pl-apasai"]')).toHaveCount(0);
    await chooser.getByRole('option', { name: 'Studio 1', exact: true }).click();

    const card = pv.getByRole('region', { name: 'PVW input check' });
    await expect(card).toContainText('PVW INPUT · CH 1 · Studio 1');
    await expect(card.locator(state)).toHaveAttribute('data-input-check-state', 'ready');
    await expect(card.locator(picture)).toBeVisible();
    const pixels = await card.locator(picture).evaluate((canvas: HTMLCanvasElement) => {
      return canvas.getContext('2d')?.getImageData(0, 0, 1, 1).data[3];
    });
    expect(pixels).toBe(255);
    const meter = card.locator('[data-input-meter] .cg-vu__fill').first();
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
    await expect
      .poll(() => meter.evaluate((bar) => (bar as HTMLElement).style.clipPath))
      .toMatch(/^inset\(100(?:\.00)?% /);
    await expect(card.locator(picture)).toBeVisible();
    preview.stalledVideo = true;
    await expect(card.locator(state)).toHaveAttribute('data-input-check-state', 'stalled');
    await expect(card.locator(picture)).toBeHidden();
    await expect(sound).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(() => preview.audioCloses).toBe(1);
    await expect(pgm).toHaveAttribute('src', pgmUrl ?? '');
    expect(await page.evaluate((key) => localStorage.getItem(key), PGM_PREFERENCE)).toBe(
      '{"on":true}',
    );
    await card.getByRole('button', { name: 'Close input check' }).click();

    preview.staleMeter = false;
    preview.stalledVideo = false;
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
    const field = defaults.locator('[data-defaults-select="plate-1"]');
    const save = defaults.getByRole('button', { name: 'Save defaults' });
    await field.click();
    const options = page.getByRole('dialog', { name: 'Choose a source' });
    await options.locator('[data-picker-input="in-li-studio1"]').click();
    await expect(field).toHaveAttribute('data-picker-value', 'in-li-studio1');
    await expect(save).toBeEnabled();
    await field.click();
    const checkNews = options.getByRole('button', { name: 'Check input · دوربین خبر' });
    await checkNews.focus();
    await page.keyboard.press('Enter');
    await expect(options).toHaveCount(0);
    await expect(field).toBeFocused();
    await expect(defaults).toBeVisible();
    const dialogCheck = defaults.getByRole('region', { name: 'PVW input check' });
    await expect(dialogCheck).toContainText('دوربین خبر');
    await expect(dialogCheck.locator(state)).toHaveAttribute('data-input-check-state', 'ready');
    await expect(dialogCheck.getByRole('button', { name: 'Input preview sound' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await expect(field).toHaveAttribute('data-picker-value', 'in-li-studio1');
    await expect(save).toBeEnabled();
    await expect(pv.locator('[data-rehearsal-frame]')).toHaveCount(1);
    expect(bridge.runtime.sourceAssignments().assignments).toEqual([]);
    await defaults.getByRole('button', { name: 'Cancel' }).click();
    await expect.poll(() => preview.leases.size).toBe(0);
    await expect(pgm).toHaveAttribute('src', pgmUrl ?? '');
  } finally {
    await bridge.close();
    await engine.stop();
    await programme.stop();
    await playout.stop();
  }
});
