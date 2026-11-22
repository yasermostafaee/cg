import { readFile } from 'node:fs/promises';
import { buildTemplateLiveSources, readProjectDocument, unpack } from '@cg/vcg-format';
import { expect, test } from './fixtures/designer.js';

test('authors Focus destinations and exports their independent effects in a VCG', async ({
  app,
}) => {
  // Force the browser's package-download save path to read the actual project bytes.
  await app.page.addInitScript(() => {
    Object.defineProperty(navigator, 'storage', { configurable: true, value: undefined });
  });
  await app.goto();
  await app.newProject('Focus effects');
  await app.showCompositions();
  const home = (await app.page.locator('.cg-comp-row').first().innerText()).trim();
  await app.addMultiFrameGroup();

  for (const [index, routes] of [['studio', 'guest'], ['studio'], ['guest']].entries()) {
    await app.addLook();
    await app.openComposition('preset-' + String(index + 1));
    for (const [plateIndex, route] of routes.entries()) {
      await app.addLiveSource({ x: 170 + plateIndex * 100, y: 150 });
      await app.setLiveSourceId(route);
      await app.deselect();
    }
    await app.openComposition(home);
  }

  const picker = app.page.getByLabel('Active preset');
  const focusSettings = app.inspector.getByRole('button', { name: 'Toggle Focus effects' });
  const switchEffect = app.inspector.getByRole('combobox', { name: 'Switch focused plate' });
  const duration = app.inspector.getByRole('spinbutton', { name: 'Switch duration (ms)' });
  await picker.selectOption('look-1');
  await focusSettings.click();
  await app.inspector
    .getByRole('combobox', { name: 'Focus 1', exact: true })
    .selectOption('look-2');
  await app.inspector
    .getByRole('combobox', { name: 'Focus 2', exact: true })
    .selectOption('look-3');
  await switchEffect.selectOption('push');
  await app.inspector.getByRole('combobox', { name: 'Switch direction' }).selectOption('up');
  await duration.fill('640');
  await duration.press('Enter');

  await picker.selectOption('look-2');
  await expect(focusSettings).toHaveCount(0);
  await picker.selectOption('look-1');
  await focusSettings.click();
  await expect(switchEffect).toHaveValue('push');
  await expect(duration).toHaveValue('640');

  const savedProject = app.page.waitForEvent('download');
  await app.page.getByRole('button', { name: 'SAVE', exact: true }).click();
  const savedPath = await (await savedProject).path();
  if (savedPath === null) throw new Error('Project download has no file path');
  const { scene: project } = await readProjectDocument(await readFile(savedPath));
  const savedLook = project.compositions
    ?.flatMap(({ lookGroups }) => lookGroups ?? [])
    .flatMap(({ looks }) => looks)
    .find(({ id }) => id === 'look-1');

  const downloadReady = app.page.waitForEvent('download');
  await app.compositionActionBar.getByRole('button', { name: 'Export .vcg' }).click();
  const download = await downloadReady;
  const exportedPath = await download.path();
  if (exportedPath === null) throw new Error('VCG export download has no file path');
  const { scene } = await unpack(await readFile(exportedPath));
  const carrier = buildTemplateLiveSources(scene);
  expect(carrier.looks?.[0]?.presetFocus).toMatchObject({
    targets: { studio: 'look-2', guest: 'look-3' },
    effects: { switch: { mode: 'push', direction: 'up', durationMs: 640 } },
  });
  expect(carrier.looks?.[0]?.presetFocus).toEqual(savedLook?.presetFocus);
  expect(carrier.looks?.[0]?.entered).toEqual({ mode: 'cut' });
});
