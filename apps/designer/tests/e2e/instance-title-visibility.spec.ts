import { readFile } from 'node:fs/promises';
import { unpack } from '@cg/vcg-format';
import { expect, test } from './fixtures/designer.js';

test('hides a shared frame title in only the selected preset instance', async ({ app }) => {
  await app.newProject('Instance title visibility');
  await app.newComposition('Titled frame');
  await app.openComposition('Titled frame');
  await app.addLiveSource();
  await app.setLiveSourceId('guest');
  await app.setInspectorNumber('X position', 120);
  await app.setInspectorNumber('Y position', 120);
  await app.setInspectorNumber('Width', 480);
  await app.setInspectorNumber('Height', 270);
  const [plateId] = await app.timelineRowIds();

  await app.addTextElement({ x: 300, y: 200 });
  await app.setElementName('Guest title');
  await app.setDataKey('guest-title');
  await app.setInspectorNumber('X position', 160);
  await app.setInspectorNumber('Y position', 180);
  const titleId = (await app.timelineRowIds()).find((id) => id !== plateId);
  if (titleId === undefined) throw new Error('Missing title layer');

  await app.openComposition('comp1');
  await app.addMultiFrameGroup();
  await app.addLook();
  await app.addLook();
  await app.openComposition('preset-1');
  await app.nestCompositionInstance('Titled frame');
  const [soloInstance] = await app.timelineRowIds();
  if (soloInstance === undefined) throw new Error('Missing solo instance');
  await app.selectElementById(soloInstance);

  const visibility = app.inspector.getByRole('group', { name: 'Show text in this instance' });
  const showTitle = visibility.getByRole('checkbox', { name: 'Guest title' });
  const titleSelector = `[data-cg-element-id="${titleId}"]`;
  const plateSelector = '[data-cg-live-source="guest"]';
  const title = app.canvasFrame.locator(titleSelector);
  const plate = app.canvasFrame.locator(plateSelector);
  await expect(showTitle).toBeChecked();
  await expect(title).toBeVisible();
  await showTitle.uncheck();
  await expect(title).toBeHidden();
  await expect(plate).toBeVisible();

  await app.undo();
  await app.selectElementById(soloInstance);
  await expect(showTitle).toBeChecked();
  await expect(title).toBeVisible();
  await showTitle.uncheck();
  await expect(title).toBeHidden();

  await app.openComposition('preset-2');
  await app.nestCompositionInstance('Titled frame');
  const [duoInstance] = await app.timelineRowIds();
  if (duoInstance === undefined) throw new Error('Missing duo instance');
  await app.selectElementById(duoInstance);
  await expect(showTitle).toBeChecked();
  await expect(title).toBeVisible();
  await app.addLiveSource({ x: 300, y: 250 });
  await app.setLiveSourceId('host');
  await app.setInspectorNumber('X position', 800);
  await app.setInspectorNumber('Y position', 120);
  await app.setInspectorNumber('Width', 480);
  await app.setInspectorNumber('Height', 270);

  await app.openComposition('Titled frame');
  await expect(title).toBeVisible();
  await app.openComposition('preset-1');
  await expect(title).toBeHidden();
  await expect(plate).toBeVisible();

  await app.openComposition('comp1');
  const exportButton = app.page.getByRole('button', { name: 'Export .vcg', exact: true });
  await expect(exportButton).not.toHaveAttribute('data-export-blocked', 'errors');
  const [download] = await Promise.all([app.page.waitForEvent('download'), exportButton.click()]);
  const { scene } = await unpack(await readFile(await download.path()));
  const nestedInstance = (name: string) =>
    scene.compositions
      ?.find((composition) => composition.name === name)
      ?.layers.flatMap((layer) => layer.children)
      .find((element) => element.type === 'composition');
  const solo = nestedInstance('preset-1');
  const duo = nestedInstance('preset-2');
  expect(solo?.hiddenTextIds).toEqual([titleId]);
  expect(duo?.hiddenTextIds).toBeUndefined();
  expect(solo?.compositionId).toBe(duo?.compositionId);

  const { html } = await app.exportHtml();
  const output = await app.page.context().newPage();
  try {
    await output.setContent(html);
    await expect(output.locator('html')).toHaveAttribute('data-cg-ready', '1');
    await output.evaluate(() => {
      (window as unknown as { play: (payload: string) => void }).play(
        JSON.stringify({ __cg: { look: 'look-1' } }),
      );
    });
    const visibleTitle = output.locator(`${titleSelector}:visible`);
    const visiblePlate = output.locator(`${plateSelector}:visible`);
    await expect(visiblePlate).toHaveCount(1);
    await expect(visibleTitle).toHaveCount(0);

    const switchPreset = (look: string) =>
      output.evaluate((id) => {
        (window as unknown as { update: (payload: string) => void }).update(
          JSON.stringify({ __cg: { look: id } }),
        );
      }, look);
    await switchPreset('look-2');
    await expect(visibleTitle).toHaveCount(1);
    await expect(visiblePlate).toHaveCount(1);
    await switchPreset('look-1');
    await expect(visibleTitle).toHaveCount(0);
    await expect(visiblePlate).toHaveCount(1);
  } finally {
    await output.close();
  }
});
