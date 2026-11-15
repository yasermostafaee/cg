import * as dgram from 'node:dgram';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createBridge, type BridgeHandle } from '@cg/caspar-bridge';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import type { SourceCatalog } from '@cg/shared-ipc';
import { controlLiveLayoutFocusLookId } from '@cg/shared-schema';
import { expect, test, type Locator, type Page } from '@playwright/test';

const inputNames = ['Studio camera', 'Guest line 1', 'Guest line 2'];
const catalog: SourceCatalog = {
  sources: inputNames.map((name, index) => ({
    id: `feed-${index + 1}`,
    name,
    format: '1080p2500',
    producer: { kind: 'decklink', device: index + 1 },
  })),
  layerRange: { start: 60, end: 79 },
};

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

async function setInput(page: Page, editor: Locator, index: number, title: string): Promise<void> {
  await editor.getByRole('button', { name: `Edit frame ${index + 1}`, exact: true }).click();
  await editor.getByRole('combobox', { name: 'Frame input' }).click();
  await page.locator('[data-picker-input]').filter({ hasText: inputNames[index]! }).first().click();
  await editor.getByRole('textbox', { name: 'Title', exact: true }).fill(title);
}

function fieldAppearance(field: Locator): Promise<string[]> {
  return field.evaluate((node) => {
    const style = getComputedStyle(node);
    return [style.backgroundColor, style.borderRadius, style.fontSize, style.height];
  });
}

test('R-120 authors, focuses, returns and prepares a second layout while the first is on air', async ({
  page,
}) => {
  test.setTimeout(80_000);
  page.setDefaultTimeout(12_000);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-control-layout-'));
  let mock: MockHandle | undefined;
  let bridge: BridgeHandle | undefined;
  try {
    const oscPort = await freeUdpPort();
    mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 15, channels: 1 });
    const engine = mock;
    bridge = await createBridge({
      port: 0,
      connection: {
        servers: { A: { host: '127.0.0.1', amcpPort: engine.amcpPort, oscPort } },
        strategy: 'mirror-sync',
        autoFailoverEnabled: false,
      },
      fixedLayers: { channel: 1, start: 80, count: 4, low: { start: 50, count: 10 } },
      sourceCatalog: catalog,
      stackPath: path.join(directory, 'stack.json'),
      templatesDir: path.join(directory, 'templates'),
    });
    const runtime = bridge.runtime;
    runtime.templateImport(
      {
        templateId: 'designer-graphics',
        name: 'Designer graphics',
        templateType: 'custom',
        fields: [],
      },
      '<!doctype html><body>Designer graphics</body>',
      1,
    );

    await page.setViewportSize({ width: 1440, height: 1000 });
    // Operator-selected broadcast effects are rehearsed even when UI motion is reduced.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript(`window.__CG_BRIDGE_URL__ = ${JSON.stringify(bridge.url)};`);
    await page.goto('/');
    const layers = page.getByRole('region', { name: 'Layers' });
    await expect(layers.getByRole('button', { name: 'New live layout' })).toBeVisible();
    // Live camera snapshots are reads, and the rest of the app and wire use the actual Bridge.
    await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 180;
      const context = canvas.getContext('2d')!;
      const colors = ['#abbfe9', '#da8649', '#54a776'];
      const snapshots = colors.map((color, index) => {
        canvas.height = index === 2 ? 240 : 180;
        context.fillStyle = color;
        context.fillRect(0, 0, canvas.width, canvas.height);
        return {
          jpegBase64: canvas.toDataURL('image/jpeg').split(',')[1]!,
          width: canvas.width,
          height: canvas.height,
        };
      });
      window.cg.sourcePreviews.pvw = ({ sourceIds }) =>
        Promise.resolve({
          frames: sourceIds.map((sourceId) => ({
            sourceId,
            ...snapshots[Number(sourceId.split('-').at(-1)) - 1]!,
            signal: 'present' as const,
            capturedAt: new Date().toISOString(),
          })),
        });
    });
    await layers.getByRole('button', { name: 'New live layout' }).click();
    const editor = page.getByRole('dialog', { name: 'New live layout' });
    const stage = editor.locator('[data-layout-preview]');
    expect((await editor.boundingBox())?.width ?? 0).toBeGreaterThan(1080);
    expect((await stage.boundingBox())?.width ?? 0).toBeGreaterThan(640);
    await page.setViewportSize({ width: 600, height: 540 });
    await stage.scrollIntoViewIfNeeded();
    const narrow = await stage.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      const scroll = node.closest('[data-modal-body]')?.getBoundingClientRect();
      return {
        ratio: rect.width / rect.height,
        visible:
          scroll !== undefined &&
          rect.top >= scroll.top - 1 &&
          rect.bottom <= scroll.bottom + 1 &&
          rect.left >= scroll.left &&
          rect.right <= scroll.right,
      };
    });
    expect(narrow.visible).toBe(true);
    expect(narrow.ratio).toBeCloseTo(16 / 9, 1);
    await expect(editor.getByRole('button', { name: 'Save layout' })).toBeInViewport();
    await page.setViewportSize({ width: 1440, height: 1000 });
    const layoutName = editor.getByRole('textbox', { name: 'Layout name' });
    await layoutName.fill('Studio panel');
    await editor.getByRole('button', { name: 'Add frame' }).click();
    await editor.getByRole('button', { name: 'Add frame' }).click();
    await editor.getByRole('button', { name: 'Delete frame' }).click();
    await expect(editor.getByRole('button', { name: 'Edit frame 4', exact: true })).toHaveCount(0);
    await setInput(page, editor, 0, 'مجری برنامه 4۵٦');
    await setInput(page, editor, 1, 'سارا احمدی');
    await setInput(page, editor, 2, 'علی نظری 1۲٣');
    const frame1 = editor.getByRole('button', { name: 'Edit frame 1', exact: true });
    const frame2 = editor.getByRole('button', { name: 'Edit frame 2', exact: true });
    await frame1.click();
    await editor.getByRole('textbox', { name: 'Title', exact: true }).focus();
    await expect(frame1).toHaveAttribute('aria-pressed', 'true');
    await expect(frame2).toHaveAttribute('aria-pressed', 'false');
    await expect(frame1.locator('.cg-live-layout-selection-mark')).toBeVisible();
    await expect(frame2.locator('.cg-live-layout-selection-mark')).toBeHidden();
    expect(await fieldAppearance(frame1)).not.toEqual(await fieldAppearance(frame2));
    await expect(stage.locator('[data-frame-number="1"][data-editing]')).toBeVisible();
    await expect(editor.getByRole('checkbox', { name: 'Frame 2 in preset' })).toBeChecked();
    await editor.getByText('Title style', { exact: true }).click();
    await editor.getByLabel('Box width (%)', { exact: true }).fill('70');
    await editor.getByLabel('Box height (%)', { exact: true }).fill('13');
    await editor.getByLabel('Title padding (px)', { exact: true }).fill('18');
    await editor.getByLabel('Text vertical offset (px)', { exact: true }).fill('-5');
    await editor.getByLabel('Horizontal alignment', { exact: true }).selectOption('center');
    await editor.getByLabel('Vertical alignment', { exact: true }).selectOption('bottom');
    await editor.getByLabel('Title color', { exact: true }).fill('#dce9f1');
    await editor.getByRole('checkbox', { name: 'Text wrap', exact: true }).check();
    const previewTitle = (frameNumber: number) =>
      stage.locator(`[data-frame-number="${String(frameNumber)}"] .cg-live-layout-shot-title`);
    const digits = editor.getByRole('combobox', { name: 'Digits', exact: true });
    await expect(digits).toBeHidden();
    await editor.getByText('Advanced', { exact: true }).click();
    await digits.selectOption('latin');
    await expect(previewTitle(1)).toContainText('456');
    await digits.selectOption('persian');
    await expect(previewTitle(1)).toContainText('۴۵۶');
    await expect(previewTitle(3)).toContainText('۱۲۳');
    for (const frameNumber of [1, 2]) {
      const title = previewTitle(frameNumber);
      await expect(title).toHaveCSS('color', 'rgb(220, 233, 241)');
      await expect(title).toHaveCSS('text-align', 'center');
      await expect(title).toHaveCSS('justify-content', 'end');
      await expect(title).toHaveCSS('white-space', 'normal');
      const geometry = await title.evaluate((element) => {
        const { width, height } = element.getBoundingClientRect();
        const frame = element.parentElement!.getBoundingClientRect();
        return { width: width / frame.width, height: height / frame.height };
      });
      expect(geometry.width).toBeCloseTo(0.7, 2);
      expect(geometry.height).toBeCloseTo(0.13, 2);
      const offset = await title
        .locator(':scope > span')
        .evaluate((element) => Number.parseFloat(getComputedStyle(element).top));
      expect(offset).toBeLessThan(0);
    }
    await editor.getByLabel('Add title font file').setInputFiles({
      name: 'Panel Font.woff2',
      mimeType: 'font/woff2',
      buffer: fs.readFileSync(
        new URL('../../public/fonts/vazirmatn/vazirmatn-arabic-700-normal.woff2', import.meta.url),
      ),
    });
    const font = editor.getByRole('combobox', { name: 'Title font', exact: true });
    await expect(font).toHaveValue(/^asset-/);
    const uploadedFamily = await font.inputValue();
    await expect
      .poll(() =>
        page.evaluate(
          (family) =>
            [...document.fonts].some(
              (registered) => registered.family === family && registered.status === 'loaded',
            ),
          uploadedFamily,
        ),
      )
      .toBe(true);
    await editor
      .getByRole('group', { name: 'Title style scope' })
      .getByRole('button', { name: 'Frame 1', exact: true })
      .click();
    await expect(editor.getByLabel('Title padding (px)', { exact: true })).toHaveValue('18');
    await editor.getByLabel('Title X (%)', { exact: true }).fill('30');
    await editor.getByLabel('Title Y (%)', { exact: true }).fill('65');
    await editor.getByLabel('Title size (%)', { exact: true }).fill('6');
    await editor.getByLabel('Title font', { exact: true }).selectOption('Exo 2');
    await editor.getByLabel('Title background', { exact: true }).fill('#392822');
    await editor.getByLabel('Title background opacity (%)', { exact: true }).fill('60');
    await expect(digits).toBeHidden();
    await editor.getByText('Advanced', { exact: true }).click();
    await expect(digits).toHaveValue('persian');
    await digits.selectOption('arabic-indic');
    await expect(previewTitle(1)).toContainText('٤٥٦');
    await expect(previewTitle(3)).toContainText('۱۲۳');
    await expect(previewTitle(1)).toHaveCSS('background-color', 'rgba(57, 40, 34, 0.6)');
    await expect(previewTitle(2)).not.toHaveCSS('background-color', 'rgba(57, 40, 34, 0.6)');
    expect(await fieldAppearance(editor.getByLabel('Title size (%)', { exact: true }))).toEqual(
      await fieldAppearance(layoutName),
    );
    await editor.getByRole('textbox', { name: 'Preset name' }).fill('Three-up');
    await editor.getByRole('button', { name: 'Grid · fuller top' }).click();
    const horizontalGap = editor.getByLabel('Horizontal gap', { exact: true });
    const verticalGap = editor.getByLabel('Vertical gap', { exact: true });
    expect(await fieldAppearance(horizontalGap)).toEqual(await fieldAppearance(layoutName));
    await horizontalGap.fill('48');
    await horizontalGap.press('Tab');
    await verticalGap.fill('36');
    await verticalGap.press('Tab');
    await editor.getByRole('button', { name: 'Add preset' }).click();
    await editor.getByRole('textbox', { name: 'Preset name' }).fill('Interview');
    await editor.getByRole('checkbox', { name: 'Frame 3 in preset' }).uncheck();
    const positionPicker = editor.getByRole('group', { name: 'Position in preset', exact: true });
    await frame2.click();
    await positionPicker.getByRole('button', { name: 'Position 1', exact: true }).click();
    await horizontalGap.fill('12');
    await horizontalGap.press('Tab');
    await editor.getByRole('button', { name: 'Add preset' }).click();
    await editor.getByRole('button', { name: 'Delete preset' }).click();
    const threeUp = editor.getByRole('button', { name: 'Three-up', exact: true });
    const interview = editor.getByRole('button', { name: 'Interview', exact: true });
    await threeUp.click();
    await editor.getByRole('textbox', { name: 'Preset name' }).focus();
    await expect(threeUp).toHaveAttribute('aria-pressed', 'true');
    await expect(interview).toHaveAttribute('aria-pressed', 'false');
    await expect(threeUp.locator('.cg-live-layout-selection-mark')).toBeVisible();
    await expect(interview.locator('.cg-live-layout-selection-mark')).toBeHidden();
    expect(await fieldAppearance(threeUp)).not.toEqual(await fieldAppearance(interview));
    await expect(editor.getByRole('checkbox', { name: 'Frame 3 in preset' })).toBeChecked();
    await expect(horizontalGap).toHaveValue('48');
    await expect(verticalGap).toHaveValue('36');
    await frame2.click();
    await positionPicker.getByRole('button', { name: 'Position 3', exact: true }).click();
    await expect(stage.locator('[data-frame-number="2"]')).toHaveAttribute(
      'data-preset-position',
      '3',
    );
    await expect(stage.locator('[data-frame-number="3"]')).toHaveAttribute(
      'data-preset-position',
      '2',
    );
    await positionPicker.getByRole('button', { name: 'Position 2', exact: true }).click();
    await frame1.click();
    const png = await page.evaluate(
      () => document.createElement('canvas').toDataURL('image/png').split(',')[1]!,
    );
    await editor.getByLabel('Background media file').setInputFiles({
      name: 'panel.png',
      mimeType: 'image/png',
      buffer: Buffer.from(png, 'base64'),
    });
    await expect(editor.getByText('panel.png', { exact: true })).toBeVisible();
    await editor.getByText('Layout effects', { exact: true }).click();
    const soloEffect = editor
      .getByRole('group', { name: 'Switch focused frame' })
      .getByLabel('Effect');
    await expect(soloEffect.getByRole('option', { name: 'Cut', exact: true })).toHaveCount(1);
    await expect(soloEffect.getByRole('option', { name: 'Fade', exact: true })).toHaveCount(1);
    await soloEffect.selectOption('push');
    expect(
      await fieldAppearance(editor.getByLabel('Switch duration (ms)', { exact: true })),
    ).toEqual(await fieldAppearance(layoutName));
    await editor.getByLabel('Switch duration (ms)', { exact: true }).fill('1000');
    const editorStage = editor.locator('[data-layout-preview]');
    await editor.getByRole('button', { name: 'Focus frame 1', exact: true }).click();
    const focusedTitle = editorStage.locator(
      '[data-layout-preview-shot][data-frame-number="1"] .cg-live-layout-shot-title',
    );
    await expect(focusedTitle).toBeVisible();
    await editor.getByRole('checkbox', { name: 'Show title in Focus' }).uncheck();
    await expect(focusedTitle).toHaveCount(0);
    await editor.getByRole('button', { name: 'Focus frame 2', exact: true }).click();
    const arrival = editorStage.locator('[data-layout-preview-shot][aria-hidden="false"]');
    await expect
      .poll(() =>
        arrival.evaluate((node) =>
          node
            .getAnimations()
            .some(
              ({ effect }) =>
                effect instanceof KeyframeEffect &&
                effect.getKeyframes().some(({ transform }) => String(transform).includes('100%')),
            ),
        ),
      )
      .toBe(true);
    await editor.getByRole('button', { name: 'Return to Three-up' }).click();
    await expect(focusedTitle).toBeVisible();

    await editor.getByRole('button', { name: 'Edit frame 3', exact: true }).click();
    await expect(editor.getByRole('group', { name: 'Input fit', exact: true })).toBeHidden();
    await editor.getByText('Advanced frame controls', { exact: true }).click();
    const thirdShot = editorStage.locator('[data-layout-preview-shot][data-frame-number="3"]');
    const pictureWindows = thirdShot.locator('.cg-live-layout-shot-picture');
    const windowRatios = (window: Locator) =>
      window.evaluate((node) => {
        const clip = node.getBoundingClientRect();
        const frame = node.parentElement!.getBoundingClientRect();
        return [clip.width / frame.width, clip.height / frame.height].map((value) =>
          Math.round(value * 100),
        );
      });
    await expect.poll(() => windowRatios(pictureWindows)).toEqual([75, 100]);
    await editor.getByRole('button', { name: 'Crop edges', exact: true }).click();
    await expect.poll(() => windowRatios(pictureWindows)).toEqual([100, 100]);
    await editor.getByRole('button', { name: 'Keep aspect', exact: true }).click();
    const move = editor.getByRole('checkbox', { name: 'Allow move', exact: true });
    await move.uncheck();
    await move.check();
    await editor.getByRole('button', { name: 'Add mask window', exact: true }).click();
    await expect.poll(() => windowRatios(pictureWindows)).toEqual([50, 50]);
    await editor.getByRole('button', { name: 'Show outside', exact: true }).click();
    await expect(pictureWindows).toHaveCount(4);
    await editor.getByRole('button', { name: 'Show inside', exact: true }).click();
    await editor.getByRole('checkbox', { name: 'Allow mask editing in CG Control' }).check();
    await editor.getByRole('button', { name: 'Focus frame 3', exact: true }).click();
    await expect(thirdShot).toHaveAttribute('aria-hidden', 'false');
    await expect.poll(() => windowRatios(pictureWindows)).toEqual([50, 50]);
    await editor.getByRole('button', { name: 'Return to Three-up' }).click();
    await editor.getByRole('textbox', { name: 'Focus label', exact: true }).fill('خبرخوان');
    await expect(thirdShot.getByRole('button', { name: /Focus frame 3.*خبرخوان/ })).toBeVisible();
    const additionalText = editor.getByText('Additional text', { exact: true }).locator('..');
    await additionalText.getByText('Additional text', { exact: true }).click();
    await additionalText.getByRole('button', { name: 'Add text', exact: true }).click();
    await additionalText.getByRole('textbox', { name: 'Text 2', exact: true }).fill('سطر دوم 7۸٩');
    await additionalText.getByText('Text style', { exact: true }).click();
    await additionalText.getByLabel('Title Y (%)', { exact: true }).fill('43');
    await expect(thirdShot).toContainText('سطر دوم ۷۸۹');
    await expect(thirdShot).toContainText('علی نظری ۱۲۳');
    await editor.getByRole('button', { name: 'Save layout' }).click();
    await expect(editor).toBeHidden();

    const listed = runtime.templateList(1).find(({ name }) => name === 'Studio panel');
    expect(listed?.controlLiveLayout?.presets.map(({ name }) => name)).toEqual([
      'Three-up',
      'Interview',
    ]);
    expect(listed?.controlLiveLayout?.presets[0]?.arrangement).toBe('grid-top');
    expect(listed?.controlLiveLayout?.presets[0]).toMatchObject({
      horizontalGap: 48,
      verticalGap: 36,
    });
    expect(listed?.controlLiveLayout?.presets[1]?.frameIds).toHaveLength(2);
    expect(listed?.controlLiveLayout?.presets[1]?.horizontalGap).toBe(12);
    expect(listed?.controlLiveLayout?.background.kind).toBe('image');
    if (listed?.controlLiveLayout === undefined || listed.controlLiveLayoutSource === undefined) {
      throw new Error('The authored layout package was not retained');
    }
    const authored = listed.controlLiveLayout;
    expect(authored.presets[1]?.frameIds).toEqual([authored.frames[1]?.id, authored.frames[0]?.id]);
    expect(authored.frames[2]?.focusAlias).toBe('خبرخوان');
    expect(authored.frames[2]?.additionalTexts).toMatchObject([
      { text: 'سطر دوم 7۸٩', style: { yPercent: 43 } },
    ]);
    expect(authored.titleStyle).toMatchObject({
      widthPercent: 70,
      heightPercent: 13,
      padding: 18,
      textOffsetY: -5,
      align: 'center',
      verticalAlign: 'bottom',
      color: '#dce9f1',
      wrap: true,
      fontFamily: uploadedFamily,
      digits: 'persian',
    });
    expect(authored.fonts?.map(({ name }) => name)).toEqual(['Panel Font.woff2']);
    expect(authored.frames[1]?.titleStyle).toBeUndefined();
    expect(authored.frames[2]).toMatchObject({
      fitMode: 'cover',
      operatorMove: true,
      operatorPlacement: 'proportional',
      liveMask: { mode: 'inside', rects: [{ x: 0.25, y: 0.25, width: 0.5, height: 0.5 }] },
      allowOperatorMaskEdit: true,
    });
    expect(authored.presets[0]?.hiddenFocusTitles).toContain(authored.frames[0]?.id);
    expect(authored.frames[0]?.titleStyle).toMatchObject({
      xPercent: 30,
      yPercent: 65,
      sizePercent: 6,
      fontFamily: 'Exo 2',
      digits: 'arabic-indic',
    });
    expect(authored.frames[0]?.titleStyle?.backgroundColor?.toLowerCase()).toContain('#392822');
    const origin = authored.defaultPresetId;
    const focus = (index: number) =>
      controlLiveLayoutFocusLookId(origin, authored.frames[index]!.id);
    expect(runtime.templateSourceGet(listed.controlLiveLayoutSource).ok).toBe(true);
    await page.evaluate(
      async ({ templateId }) => {
        await window.cg.fixedLayers.load({
          channel: 1,
          layer: 59,
          templateId,
          itemId: 'panel',
          fields: {},
        });
      },
      { templateId: listed.templateId },
    );
    const row = layers.locator('[data-layer="59"]');
    await row.getByRole('button', { name: /^ON PVW/ }).click();
    await page.getByRole('button', { name: 'Show monitors' }).click();
    const pvw = page.getByRole('region', { name: 'PREVIEW (PVW)' });
    const localFocus = page.getByRole('group', { name: 'Preview Focus', exact: true });
    await expect(localFocus).toBeVisible();
    await expect(
      localFocus.getByRole('button', { name: /Focus frame 3 in Preview.*خبرخوان/ }),
    ).toBeVisible();
    await pvw.getByRole('button', { name: 'PLAY', exact: true }).click();
    const previewFrame = page.frameLocator('iframe[data-rehearsal-frame="panel"]');
    await expect(
      previewFrame.locator('[data-cg-pvw-picture-part][data-source-id="feed-1"]').first(),
    ).toBeVisible();
    const maskedPvwPicture = previewFrame.locator(
      '[data-cg-pvw-picture-part][data-source-id="feed-3"]',
    );
    await expect.poll(() => windowRatios(maskedPvwPicture)).toEqual([50, 50]);
    const title = previewFrame
      .locator(`[data-cg-element-id="${authored.frames[0]!.id}-title"]`)
      .filter({ visible: true })
      .first();
    await expect(title).toHaveCSS('font-family', /Exo 2/);
    await expect(title).toContainText('٤٥٦');
    await expect(
      previewFrame.getByText('سطر دوم ۷۸۹', { exact: true }).filter({ visible: true }),
    ).toBeVisible();
    const previewStart = engine.receivedCommands().length;
    await localFocus.getByRole('button', { name: 'Focus frame 1 in Preview' }).click();
    await expect(localFocus.getByRole('button', { name: 'Return to Three-up' })).toBeVisible();
    await expect(
      previewFrame.locator(`[data-cg-element-id="layout-look-${focus(0)}"]`),
    ).toBeVisible();
    const hiddenTitle = previewFrame
      .locator(`[data-cg-element-id="layout-look-${focus(0)}"]`)
      .locator(`[data-cg-element-id="${authored.frames[0]!.id}-title"]`);
    await expect(hiddenTitle).toHaveAttribute('data-cg-instance-hidden-text', '');
    await expect(hiddenTitle).toBeHidden();
    await localFocus.getByRole('button', { name: 'Focus frame 2 in Preview' }).click();
    await expect(previewFrame.locator('[data-cg-pvw-focus-switch="push"]').first()).toBeVisible();
    await expect(
      localFocus.getByRole('button', { name: 'Focus frame 2 in Preview' }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(previewFrame.locator('[data-cg-pvw-focus-switch="push"]')).toHaveCount(0);
    await localFocus.getByRole('button', { name: 'Return to Three-up' }).click();
    await expect(localFocus.getByRole('button', { name: 'Return to Three-up' })).toHaveCount(0);
    // Bridge can still be restoring default volumes to the fixed rows after connection.
    expect(
      engine
        .receivedCommands()
        .slice(previewStart)
        .filter(
          ({ line }) =>
            /^(?:CG|PLAY|CLEAR|MIXER 1-(?:5[0-9]|6[0-9]|7[0-9])) /.test(line) &&
            !/^MIXER 1-5[0-9] VOLUME 1$/.test(line),
        ),
    ).toEqual([]);

    await row.getByRole('button', { name: /^PLAY/ }).click();
    await expect(row.getByText('ON AIR', { exact: true })).toBeVisible({ timeout: 12_000 });
    const programme = row.getByRole('group', { name: 'Programme Focus', exact: true });
    await expect(
      programme.getByRole('button', { name: /Focus frame 3 in Programme.*خبرخوان/ }),
    ).toBeVisible();
    const active = () => runtime.activeLookId('panel');
    const seats = () =>
      runtime
        .liveLayers()
        .get('panel')
        ?.map(({ slot, fill, clip, producer }) => ({ slot, fill, clip, producer }))
        .sort((left, right) => left.slot.layer - right.slot.layer);
    await expect.poll(() => seats()?.length).toBe(3);
    const initial = seats();
    const wireStart = engine.receivedCommands().length;
    await programme.getByRole('button', { name: 'Focus frame 1 in Programme' }).click();
    await expect.poll(active).toBe(focus(0));
    await expect(localFocus.getByRole('button', { name: 'Return to Three-up' })).toHaveCount(0);
    await programme.getByRole('button', { name: 'Focus frame 2 in Programme' }).click();
    await expect.poll(active).toBe(focus(1));
    await programme.getByRole('button', { name: 'Return to Three-up' }).click();
    await expect.poll(active).toBe(origin);
    expect(seats()).toEqual(initial);
    const focusCommands = engine
      .receivedCommands()
      .slice(wireStart)
      .map(({ line }) => line);
    expect(focusCommands.some((line) => / FILL .* \d+ linear DEFER$/.test(line))).toBe(true);
    expect(
      focusCommands.filter((line) => /^(?:PLAY|CLEAR) 1-(?:6[0-9]|7[0-9])\b/.test(line)),
    ).toEqual([]);

    await page.getByRole('button', { name: 'Open templates', exact: true }).click();
    const library = page.getByRole('dialog', { name: 'Templates · CH 1' });
    await expect(library.getByText('Designer graphics', { exact: true })).toBeVisible();
    await library.getByText('Studio panel', { exact: true }).first().click();
    await library.getByRole('button', { name: 'Edit layout' }).click();
    const lockedEdit = page.getByRole('dialog', { name: 'Edit live layout' });
    await lockedEdit.getByRole('textbox', { name: 'Layout name' }).fill('Unsaved change');
    await lockedEdit.getByRole('button', { name: 'Save layout' }).click();
    await expect(lockedEdit.getByText(/Duplicate .+ while it is on air/i)).toBeVisible();
    await lockedEdit.getByRole('button', { name: 'Cancel', exact: true }).click();
    await library.getByRole('button', { name: 'Duplicate layout' }).click();
    const copy = page.getByRole('dialog', { name: 'Duplicate live layout' });
    await expect(copy.getByRole('textbox', { name: 'Layout name' })).toHaveValue(
      'Studio panel copy',
    );
    await expect(copy.getByText('panel.png', { exact: true })).toBeVisible();
    await copy.getByText('Title style', { exact: true }).click();
    await expect(copy.getByLabel('Box width (%)', { exact: true })).toHaveValue('70');
    await expect(copy.getByLabel('Text vertical offset (px)', { exact: true })).toHaveValue('-5');
    await expect(copy.getByRole('combobox', { name: 'Title font', exact: true })).toHaveValue(
      uploadedFamily,
    );
    await copy.getByText('Advanced', { exact: true }).click();
    await expect(copy.getByRole('combobox', { name: 'Digits', exact: true })).toHaveValue(
      'persian',
    );
    await copy.getByRole('button', { name: 'Edit frame 3', exact: true }).click();
    await expect(copy.getByRole('textbox', { name: 'Focus label', exact: true })).toHaveValue(
      'خبرخوان',
    );
    await copy.getByText('Additional text', { exact: true }).click();
    await expect(copy.getByRole('textbox', { name: 'Text 2', exact: true })).toHaveValue(
      'سطر دوم 7۸٩',
    );
    await copy.getByRole('textbox', { name: 'Layout name' }).fill('Next programme');
    const beforeSave = engine.receivedCommands().length;
    await copy.getByRole('button', { name: 'Save layout' }).click();
    await expect(copy).toBeHidden();
    await expect
      .poll(() => runtime.templateList(1).find(({ name }) => name === 'Next programme')?.templateId)
      .toBeDefined();
    expect(
      runtime.templateList(1).find(({ name }) => name === 'Next programme')?.templateId,
    ).not.toBe(listed.templateId);
    expect(runtime.templateGet(listed.templateId, 1)?.controlLiveLayoutSource).toBe(
      listed.controlLiveLayoutSource,
    );
    expect(active()).toBe(origin);
    expect(
      engine
        .receivedCommands()
        .slice(beforeSave)
        .filter(({ line }) => /^(?:CG|PLAY|CLEAR|MIXER) /.test(line)),
    ).toEqual([]);
  } finally {
    await bridge?.close();
    await mock?.stop();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
