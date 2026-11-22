import * as dgram from 'node:dgram';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createBridge, type BridgeHandle } from '@cg/caspar-bridge';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import { fixedBankSlots } from '@cg/shared-ipc';
import { expect, test, type Locator } from '@playwright/test';

function freeUdpPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket('udp4');
    socket.once('error', reject);
    socket.bind(0, '127.0.0.1', () => {
      const port = socket.address().port;
      socket.close(() => resolve(port));
    });
  });
}

async function showOnlyGuideFrame(settings: Locator, id: string): Promise<void> {
  const choices = settings.getByRole('radio');
  for (let index = 0; index < (await choices.count()); index++) {
    await choices.nth(index).click();
    if ((await choices.nth(index).getAttribute('data-guide-frame-id')) !== id)
      await settings.getByRole('checkbox', { name: 'Show frame', exact: true }).uncheck();
  }
  await settings.locator(`[data-guide-frame-id="${id}"]`).click();
  await settings.getByRole('checkbox', { name: 'Show frame', exact: true }).check();
  for (const label of ['100% Full frame', '93% Action', '90% Graphics'])
    await settings.getByRole('checkbox', { name: `Show ${label}`, exact: true }).check();
  await settings.getByRole('checkbox', { name: 'Show 80% Additional', exact: true }).uncheck();
}

async function expectAligned(stage: Locator): Promise<void> {
  await expect(async () => {
    const [picture, guides] = await Promise.all([
      stage.boundingBox(),
      stage.locator('[data-safe-area-guides]').boundingBox(),
    ]);
    expect(picture).not.toBeNull();
    expect(guides).not.toBeNull();
    for (const key of ['x', 'y', 'width', 'height'] as const)
      expect(guides?.[key], JSON.stringify({ key, picture, guides })).toBeCloseTo(
        picture?.[key] ?? -1000,
        0,
      );
  }).toPass({ timeout: 7_000 });
}

test('New live layout safe guides fit its active picture and share only view preferences with PVW', async ({
  page,
}, testInfo) => {
  test.setTimeout(60_000);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-layout-safe-guides-'));
  const bank = { channel: 1, start: 80, count: 4, low: { start: 50, count: 10 } };
  let bridge: BridgeHandle | undefined;
  let mock: MockHandle | undefined;
  try {
    const oscPort = await freeUdpPort();
    mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', channels: 1 });
    const engine = mock;
    bridge = await createBridge({
      port: 0,
      connection: {
        servers: { A: { host: '127.0.0.1', amcpPort: engine.amcpPort, oscPort } },
        strategy: 'mirror-sync',
        autoFailoverEnabled: false,
      },
      fixedLayers: bank,
      stackPath: path.join(directory, 'stack.json'),
      templatesDir: path.join(directory, 'templates'),
    });
    const runtime = bridge.runtime;
    await runtime.whenServerHealthy(15_000);
    const last = fixedBankSlots(bank).at(-1);
    if (last === undefined) throw new Error('Missing declared test row');
    await expect
      .poll(() =>
        engine
          .receivedCommands()
          .some(({ line }) => line === `MIXER ${last.channel}-${last.layer} VOLUME 1`),
      )
      .toBe(true);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.addInitScript((url) => {
      const state = window as unknown as {
        __CG_BRIDGE_URL__: string;
        __CG_SPLASH_DISABLED__: boolean;
      };
      state.__CG_BRIDGE_URL__ = url;
      state.__CG_SPLASH_DISABLED__ = true;
    }, bridge.url);
    await page.goto('/');
    const layers = page.getByRole('region', { name: 'Layers' });
    await layers.getByRole('button', { name: 'New live layout', exact: true }).click();
    const editor = page.getByRole('dialog', { name: 'New live layout', exact: true });
    const layoutName = editor.getByRole('textbox', { name: 'Layout name', exact: true });
    const layoutField = await layoutName.evaluate((element) => {
      const style = getComputedStyle(element);
      return { background: style.backgroundColor, height: style.minHeight };
    });
    const stage = editor.locator('[data-layout-preview]');
    const toggle = editor.getByRole('button', { name: 'Safe areas', exact: true });
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await expect(toggle).toHaveText('');
    await expect(toggle.locator('svg')).toHaveCount(1);
    await expect(stage.locator('[data-safe-area-guides]')).toHaveCount(0);
    const baseline = engine.receivedCommands().length;
    await toggle.click();
    await expectAligned(stage);
    await expect(stage.locator('[data-safe-area="action"]')).toHaveAttribute('width', '1786');
    await expect(stage.locator('[data-safe-area="action"]')).toHaveCSS(
      'stroke',
      'rgb(255, 255, 255)',
    );
    await expect(stage.locator('[data-safe-area="graphics"]')).toHaveCSS(
      'stroke',
      'rgb(255, 255, 255)',
    );
    await expect(stage.locator('[data-safe-area="action"]')).toHaveAttribute(
      'stroke-dasharray',
      '6 4',
    );
    await expect(stage.locator('[data-safe-area="graphics"]')).not.toHaveAttribute(
      'stroke-dasharray',
    );
    await expect(stage.locator('[data-safe-area-guides]')).toHaveCSS('pointer-events', 'none');
    await editor.getByRole('button', { name: 'Safe area settings', exact: true }).click();
    const settings = page.getByRole('dialog', { name: 'Safe area settings', exact: true });
    await expect(settings.getByLabel('Guide color', { exact: true })).toHaveValue('#ffffff');
    await settings.getByLabel('Guide color', { exact: true }).fill('#22aaee');
    await showOnlyGuideFrame(settings, '4:3');
    await settings.getByLabel('Frame color', { exact: true }).fill('#22aaee');
    await settings.getByRole('button', { name: 'Add horizontal guide', exact: true }).click();
    const position = settings.getByRole('textbox', {
      name: 'Guide 1 position percent',
      exact: true,
    });
    await expect(position).toHaveCSS('background-color', layoutField.background);
    await expect(position).toHaveCSS('min-height', layoutField.height);
    const swatch = settings.getByLabel('Guide 1 color', { exact: true });
    await expect(swatch).toHaveCSS('background-color', layoutField.background);
    await expect(swatch).toHaveCSS('width', layoutField.height);
    await settings.getByRole('textbox', { name: 'Guide 1 name', exact: true }).fill('تیتر · 25%');
    await settings
      .getByRole('textbox', { name: 'Guide 1 position percent', exact: true })
      .fill('25');
    await settings
      .getByRole('textbox', { name: 'Guide 1 position percent', exact: true })
      .press('Tab');
    await settings.getByRole('button', { name: 'Add vertical guide', exact: true }).click();
    await settings
      .getByRole('textbox', { name: 'Guide 2 position percent', exact: true })
      .fill('75');
    await settings
      .getByRole('textbox', { name: 'Guide 2 position percent', exact: true })
      .press('Tab');
    await settings.getByLabel('Guide 2 color', { exact: true }).fill('#ff6600');
    await settings.getByRole('button', { name: 'Close safe area settings', exact: true }).click();
    const guides = stage.locator('[data-safe-area-guides]');
    await expect(guides.locator('[data-guide-reference="4:3"]')).toHaveAttribute('x', '240');
    await expect(guides.locator('[data-guide-axis="y"]')).toHaveAttribute('y1', '270');
    await expect(guides.locator('[data-guide-axis="x"]')).toHaveAttribute('x1', '1320');
    await expect(guides.locator('[data-guide-reference="4:3"]')).toHaveCSS(
      'stroke',
      'rgb(34, 170, 238)',
    );
    await expect(guides.locator('[data-guide-axis="y"]')).toHaveCSS('stroke', 'rgb(34, 170, 238)');
    await expect(guides.locator('[data-guide-axis="x"]')).toHaveCSS('stroke', 'rgb(255, 102, 0)');

    await editor
      .getByRole('textbox', { name: 'Layout name', exact: true })
      .fill('Guide-free layout');
    await editor.getByRole('button', { name: 'Add plate', exact: true }).click();
    await editor.getByRole('button', { name: 'Add plate', exact: true }).click();
    await editor.getByRole('button', { name: 'Add preset', exact: true }).click();
    await expect(stage.locator('[data-layout-preview-shot]')).toHaveCount(2);
    await expect(stage.locator('[data-safe-area-guides]')).toHaveCount(1);
    await expectAligned(stage);
    // Guides remain display chrome, so the plate controls underneath still work.
    await editor.getByRole('button', { name: 'Focus plate 1', exact: true }).click();
    await expect(
      editor.getByRole('button', { name: 'Return to Preset 1', exact: true }),
    ).toBeVisible();
    await expectAligned(stage);
    await editor.getByRole('button', { name: 'Return to Preset 1', exact: true }).click();
    await page.setViewportSize({ width: 1000, height: 900 });
    await expectAligned(stage);
    await expect
      .poll(() =>
        stage.evaluate(
          (node) =>
            node.getAnimations({ subtree: true }).filter(({ playState }) => playState === 'running')
              .length,
        ),
      )
      .toBe(0);
    await page.screenshot({ path: testInfo.outputPath('new-layout-safe-guides.png') });
    await toggle.click();
    await expect(guides).toHaveCount(0);
    await toggle.click();
    await expectAligned(stage);
    await editor.getByRole('button', { name: 'Save layout', exact: true }).click();
    await expect(editor).toBeHidden();
    const saved = runtime.templateList(1).find(({ name }) => name === 'Guide-free layout');
    if (saved?.controlLiveLayout === undefined) throw new Error('Missing saved layout');
    expect(JSON.stringify(saved.controlLiveLayout)).not.toMatch(/safe.guides|تیتر|standardVisible/);
    const served = runtime.templatePage(saved.templateId, 1);
    expect(JSON.stringify(served)).not.toMatch(/data-safe-area|data-custom-guide|تیتر/);
    const showMonitors = page.getByRole('button', { name: 'Show monitors', exact: true });
    if (await showMonitors.isVisible()) await showMonitors.click();
    await expect(
      page.getByRole('region', { name: 'PROGRAM (PGM)' }).locator('[data-safe-area-guides]'),
    ).toHaveCount(0);

    const pvw = page.getByRole('region', { name: 'PREVIEW (PVW)' });
    const pvwToggle = pvw.getByRole('button', { name: 'Safe areas in Preview', exact: true });
    await expect(pvwToggle).toHaveAttribute('aria-pressed', 'true');
    await expect(pvw.locator('[data-guide-reference="4:3"]')).toBeVisible();
    await expect(pvw.locator('[data-guide-axis="y"]')).toHaveAttribute('data-guide-position', '25');
    await expect(pvw.locator('[data-guide-axis="y"]')).toHaveCSS('stroke', 'rgb(34, 170, 238)');
    await expect(pvw.locator('[data-guide-axis="x"]')).toHaveCSS('stroke', 'rgb(255, 102, 0)');
    await pvw.getByRole('button', { name: 'Safe area settings', exact: true }).click();
    await settings.getByLabel('Guide color', { exact: true }).fill('#99dd44');
    await expect(pvw.locator('[data-guide-axis="y"]')).toHaveCSS('stroke', 'rgb(153, 221, 68)');
    await expect(pvw.locator('[data-guide-axis="x"]')).toHaveCSS('stroke', 'rgb(255, 102, 0)');
    await settings
      .getByRole('button', { name: 'Use guide color for guide 2', exact: true })
      .click();
    await expect(pvw.locator('[data-guide-axis="x"]')).toHaveCSS('stroke', 'rgb(153, 221, 68)');
    await expect(
      settings.getByRole('button', { name: 'Use guide color for guide 2', exact: true }),
    ).toBeDisabled();
    await settings.getByLabel('Guide 2 color', { exact: true }).fill('#cc55aa');
    await settings
      .getByRole('textbox', { name: 'Guide 1 name', exact: true })
      .fill('Shared view guide');
    await showOnlyGuideFrame(settings, '16:9');
    await settings.getByLabel('Frame color', { exact: true }).fill('#99dd44');
    await settings.getByRole('button', { name: 'Close safe area settings', exact: true }).click();
    await pvwToggle.click();
    await expect(pvw.locator('[data-safe-area-guides]')).toHaveCount(0);
    await layers.getByRole('button', { name: 'New live layout', exact: true }).click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await expect(stage.locator('[data-safe-area-guides]')).toHaveCount(0);
    await toggle.click();
    await expect(stage.locator('[data-guide-reference="16:9"]')).toBeVisible();
    await expect(stage.getByText('Shared view guide', { exact: true })).toBeVisible();
    await expect(stage.locator('[data-safe-area="action"]')).toHaveCSS(
      'stroke',
      'rgb(153, 221, 68)',
    );
    await expect(stage.locator('[data-safe-area="graphics"]')).toHaveCSS(
      'stroke',
      'rgb(153, 221, 68)',
    );
    await expect(stage.locator('[data-guide-axis="x"]')).toHaveCSS('stroke', 'rgb(204, 85, 170)');
    await editor.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.reload();
    await expect(layers).toBeVisible();
    await layers.getByRole('button', { name: 'New live layout', exact: true }).click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(stage.locator('[data-guide-axis="y"]')).toHaveCSS('stroke', 'rgb(153, 221, 68)');
    await expect(stage.locator('[data-guide-axis="x"]')).toHaveCSS('stroke', 'rgb(204, 85, 170)');
    await editor.getByRole('button', { name: 'Safe area settings', exact: true }).click();
    await expect(settings.getByLabel('Guide color', { exact: true })).toHaveValue('#99dd44');
    await expect(settings.getByLabel('Guide 2 color', { exact: true })).toHaveValue('#cc55aa');
    await page.screenshot({ path: testInfo.outputPath('new-layout-guide-colors.png') });

    await showOnlyGuideFrame(settings, 'custom');
    const ratioWidth = settings.getByRole('textbox', { name: 'Custom aspect width', exact: true });
    const ratioHeight = settings.getByRole('textbox', {
      name: 'Custom aspect height',
      exact: true,
    });
    await expect(ratioWidth).toHaveValue('3');
    await expect(ratioHeight).toHaveValue('4');
    const portrait = stage.locator('[data-guide-reference="custom"]');
    await expect(portrait).toHaveAttribute('x', '555');
    await expect(portrait).toHaveAttribute('width', '810');
    await expect(portrait).toHaveAttribute('height', '1080');
    await expect(stage.locator('[data-safe-area="graphics"]')).toHaveAttribute('width', '729');
    await expect(stage.locator('[data-guide-axis="x"]')).toHaveAttribute('x1', '1162.5');
    await ratioWidth.fill('0');
    await expect(ratioWidth).toHaveAttribute('aria-invalid', 'true');
    await expect(portrait).toHaveAttribute('width', '810');
    await ratioWidth.press('Tab');
    await expect(ratioWidth).toHaveValue('3');
    await ratioWidth.fill('9');
    await ratioWidth.press('Tab');
    await ratioHeight.fill('16');
    await ratioHeight.press('Enter');
    await expect(portrait).toHaveAttribute('x', '656.25');
    await expect(portrait).toHaveAttribute('width', '607.5');
    await settings.getByRole('radio', { name: '4:3', exact: true }).click();
    await settings.locator('[role="radio"][data-guide-frame-id="custom"]').click();
    await expect(ratioWidth).toHaveValue('9');
    await expect(ratioHeight).toHaveValue('16');
    await page.screenshot({ path: testInfo.outputPath('new-layout-custom-portrait-guides.png') });
    await settings.getByRole('button', { name: 'Close safe area settings', exact: true }).click();
    await expectAligned(stage);
    await editor.getByRole('button', { name: 'Cancel', exact: true }).click();
    if (await showMonitors.isVisible()) await showMonitors.click();
    await expect(pvwToggle).toHaveAttribute('aria-pressed', 'true');
    await expect(pvw.locator('[data-guide-reference="custom"]')).toHaveAttribute('width', '607.5');
    await expect(pvw.locator('[data-guide-axis="x"]')).toHaveAttribute('x1', '1111.875');
    const portraitProfile = await page.evaluate(() =>
      localStorage.getItem('cg.runtime.safe-guides.v1'),
    );
    expect(JSON.parse(portraitProfile ?? '{}')).toMatchObject({
      version: 1,
      aspect: 'custom',
      customAspect: { width: 9, height: 16 },
    });
    await page.reload();
    await expect(layers).toBeVisible();
    await layers.getByRole('button', { name: 'New live layout', exact: true }).click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(portrait).toHaveAttribute('width', '607.5');
    await editor.getByRole('button', { name: 'Safe area settings', exact: true }).click();
    await expect(settings.locator('[role="radio"][data-guide-frame-id="custom"]')).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect(ratioWidth).toHaveValue('9');
    await expect(ratioHeight).toHaveValue('16');
    await settings.getByLabel('Frame color', { exact: true }).fill('#3366ff');
    await settings.getByLabel('90% Graphics color', { exact: true }).fill('#ff9900');
    await settings.getByRole('checkbox', { name: 'Show 80% Additional', exact: true }).check();
    await settings.getByRole('button', { name: 'Add custom safe area', exact: true }).click();
    const aspectButtons = settings.getByRole('radio');
    await expect(aspectButtons).toHaveCount(5);
    const widths = await aspectButtons.evaluateAll((buttons) =>
      buttons.map((button) => button.getBoundingClientRect().width),
    );
    expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(1);
    const addedId = await settings
      .locator('[role="radio"][aria-checked="true"]')
      .getAttribute('data-guide-frame-id');
    expect(addedId).not.toBeNull();
    await settings.getByLabel('Frame color', { exact: true }).fill('#55cc77');
    await settings.getByLabel('100% Full frame color', { exact: true }).fill('#dd5599');
    await expect(stage.locator('[data-guide-reference="custom"]')).toHaveCount(2);
    await expect(
      stage.locator('[data-guide-frame-id="custom"][data-guide-percent="90"]'),
    ).toHaveCSS('stroke', 'rgb(255, 153, 0)');
    await expect(
      stage.locator(`[data-guide-frame-id="${addedId}"][data-guide-percent="90"]`),
    ).toHaveCSS('stroke', 'rgb(85, 204, 119)');
    await page.screenshot({ path: testInfo.outputPath('new-layout-two-custom-safe-areas.png') });
    await settings.getByRole('button', { name: 'Close safe area settings', exact: true }).click();
    await editor.getByRole('button', { name: 'Cancel', exact: true }).click();
    if (await showMonitors.isVisible()) await showMonitors.click();
    await expect(pvwToggle).toHaveAttribute('aria-pressed', 'true');
    await expect(pvw.locator('[data-guide-reference="custom"]')).toHaveCount(2);
    await page.reload();
    await expect(layers).toBeVisible();
    await layers.getByRole('button', { name: 'New live layout', exact: true }).click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(stage.locator('[data-guide-reference="custom"]')).toHaveCount(2);
    await expect(
      stage.locator('[data-guide-frame-id="custom"][data-guide-percent="90"]'),
    ).toHaveCSS('stroke', 'rgb(255, 153, 0)');
    await expect(
      stage.locator(`[data-guide-frame-id="${addedId}"][data-guide-percent="100"]`),
    ).toHaveCSS('stroke', 'rgb(221, 85, 153)');
    await editor.getByRole('button', { name: 'Safe area settings', exact: true }).click();
    await expect(settings.locator('[role="radio"][aria-checked="true"]')).toHaveAttribute(
      'data-guide-frame-id',
      addedId ?? 'missing',
    );
    await settings.getByRole('button', { name: 'Remove custom safe area', exact: true }).click();
    await expect(stage.locator('[data-guide-reference="custom"]')).toHaveCount(1);
    await settings.getByRole('button', { name: 'Close safe area settings', exact: true }).click();
    await editor.getByRole('button', { name: 'Cancel', exact: true }).click();
    expect(runtime.templatePage(saved.templateId, 1)).toEqual(served);
    expect(
      engine
        .receivedCommands()
        .slice(baseline)
        .filter(({ line }) => /^(CG|PLAY|LOADBG|CLEAR|MIXER) /.test(line)),
    ).toEqual([]);
  } finally {
    await bridge?.close();
    await mock?.stop();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
