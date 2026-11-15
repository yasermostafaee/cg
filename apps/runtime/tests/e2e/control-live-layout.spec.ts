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

test('R-120 authors, focuses, returns and prepares a second layout while the first is on air', async ({
  page,
}) => {
  test.setTimeout(80_000);
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
      const snapshots = colors.map((color) => {
        context.fillStyle = color;
        context.fillRect(0, 0, 320, 180);
        return canvas.toDataURL('image/jpeg').split(',')[1]!;
      });
      window.cg.sourcePreviews.pvw = ({ sourceIds }) =>
        Promise.resolve({
          frames: sourceIds.map((sourceId) => ({
            sourceId,
            jpegBase64: snapshots[Number(sourceId.split('-').at(-1)) - 1]!,
            width: 320,
            height: 180,
            signal: 'present' as const,
            capturedAt: new Date().toISOString(),
          })),
        });
    });
    await layers.getByRole('button', { name: 'New live layout' }).click();
    const editor = page.getByRole('dialog', { name: 'New live layout' });
    await editor.getByRole('textbox', { name: 'Layout name' }).fill('Studio panel');
    await editor.getByRole('button', { name: 'Add frame' }).click();
    await editor.getByRole('button', { name: 'Add frame' }).click();
    await editor.getByRole('button', { name: 'Delete frame' }).click();
    await expect(editor.getByRole('button', { name: 'Edit frame 4', exact: true })).toHaveCount(0);
    await setInput(page, editor, 0, 'مجری برنامه');
    await setInput(page, editor, 1, 'سارا احمدی');
    await setInput(page, editor, 2, 'علی نظری');
    await editor.getByRole('textbox', { name: 'Preset name' }).fill('Three-up');
    await editor.getByRole('button', { name: 'Grid · fuller top' }).click();
    await editor.getByRole('button', { name: 'Add preset' }).click();
    await editor.getByRole('textbox', { name: 'Preset name' }).fill('Interview');
    await editor.getByRole('checkbox', { name: 'Frame 3 in preset' }).uncheck();
    await editor.getByRole('button', { name: 'Add preset' }).click();
    await editor.getByRole('button', { name: 'Delete preset' }).click();
    await editor.getByRole('button', { name: 'Three-up', exact: true }).click();
    await expect(editor.getByRole('checkbox', { name: 'Frame 3 in preset' })).toBeChecked();
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
    await editor
      .getByRole('group', { name: 'Switch focused frame' })
      .getByLabel('Effect')
      .selectOption('push');
    await editor.getByRole('button', { name: 'Save layout' }).click();
    await expect(editor).toBeHidden();

    const listed = runtime.templateList(1).find(({ name }) => name === 'Studio panel');
    expect(listed?.controlLiveLayout?.presets.map(({ name }) => name)).toEqual([
      'Three-up',
      'Interview',
    ]);
    expect(listed?.controlLiveLayout?.presets[0]?.arrangement).toBe('grid-top');
    expect(listed?.controlLiveLayout?.presets[1]?.frameIds).toHaveLength(2);
    expect(listed?.controlLiveLayout?.background.kind).toBe('image');
    if (listed?.controlLiveLayout === undefined || listed.controlLiveLayoutSource === undefined) {
      throw new Error('The authored layout package was not retained');
    }
    const authored = listed.controlLiveLayout;
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
    await pvw.getByRole('button', { name: 'PLAY', exact: true }).click();
    const previewFrame = page.frameLocator('iframe[data-rehearsal-frame="panel"]');
    await expect(
      previewFrame.locator('[data-cg-pvw-picture-part][data-source-id="feed-1"]').first(),
    ).toBeVisible();
    const previewStart = engine.receivedCommands().length;
    await localFocus.getByRole('button', { name: 'Focus frame 1 in Preview' }).click();
    await expect(localFocus.getByRole('button', { name: 'Return to Three-up' })).toBeVisible();
    await expect(
      previewFrame.locator(`[data-cg-element-id="layout-look-${focus(0)}"]`),
    ).toBeVisible();
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
