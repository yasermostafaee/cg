import type { Element, Scene } from '@cg/shared-schema';
import { getStarter } from '@cg/starter-templates';
import { packProject } from '@cg/vcg-format';
import { expect, test } from './fixtures/designer.js';

function connectedWeatherProject(): Scene {
  const starter = getStarter('iran-weather-pages');
  if (starter === null) throw new Error('weather pages starter missing');
  const scene = structuredClone(starter.scene);
  scene.id = 'sequence-file-roundtrip';
  scene.name = 'Sequence file roundtrip';
  const sequence = [scene, ...(scene.compositions ?? [])]
    .flatMap((document) => document.layers)
    .flatMap((layer) => layer.children)
    .find((element) => element.id === 'weather-pages-sequence') as Element | undefined;
  if (sequence?.type !== 'sequence') throw new Error('weather pages sequence missing');
  sequence.pageDataFile = 'weather/صفحات-شهرها-rows.sample.xlsx';
  return scene;
}

test('a paged Repeater has one Sequence-owned file source', async ({ app }) => {
  await app.newProject('PagedFileOnly');

  await app.newComposition('WeatherCard');
  await app.openComposition('WeatherCard');
  await app.addTextElement({ x: 100, y: 80 });
  await app.setDataKey('city');
  await app.addTextElement({ x: 100, y: 160 });
  await app.setDataKey('temperature');
  await app.expandDynamicData();
  await app.inspector.getByRole('combobox', { name: 'Field type' }).selectOption('number');

  await app.newComposition('WeatherPage');
  await app.openComposition('WeatherPage');
  await app.addRepeater({ x: 120, y: 100 });
  await app.inspector
    .getByRole('combobox', { name: 'composition', exact: true })
    .selectOption({ label: 'WeatherCard' });
  await app.inspector.getByLabel('max items', { exact: true }).fill('3');
  await app.inspector.getByLabel('max items', { exact: true }).press('Enter');
  await app.setDataKey('cities');

  await app.openComposition('comp1');
  await app.addSequence({ x: 160, y: 180 });
  for (const item of [1, 2, 3]) {
    await app.inspector
      .getByRole('combobox', { name: `Sequence item ${String(item)} type`, exact: true })
      .selectOption('composition');
    await app.inspector
      .getByRole('combobox', {
        name: `Sequence item ${String(item)} composition`,
        exact: true,
      })
      .selectOption({ label: 'WeatherPage' });
  }

  const open = app.inspector.getByRole('button', { name: 'Page data…', exact: true });
  await open.click();
  const dialog = app.page.getByRole('dialog', { name: 'Page data · Sequence' });
  await expect(dialog.getByRole('checkbox', { name: 'File only in CG Control' })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Save and connect Excel file…' })).toBeVisible();
  await expect(dialog).toContainText('Not connected');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(app.inspector).not.toContainText('CG Control · file managed');
});

test('a saved Sequence connection survives project import and owns Preview rows', async ({
  app,
  page,
}) => {
  const bytes = await packProject({
    scene: connectedWeatherProject(),
    index: [],
    files: new Map(),
    savedAt: '2026-11-06T00:00:00.000Z',
  });
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import project', exact: true }).click();
  await (
    await chooser
  ).setFiles({
    name: 'Sequence file roundtrip.cgproj',
    mimeType: 'application/zip',
    buffer: Buffer.from(bytes),
  });

  await app.expectStudio();
  await app.selectElementById('weather-pages-sequence');
  await expect(app.inspector).toContainText('Connected');
  await expect(app.inspector).toContainText('CG Control · file managed');
  await expect(app.inspector).toContainText('weather/صفحات-شهرها-rows.sample.xlsx');
  await expect(app.inspector).not.toContainText('Not connected');

  await app.inspector.getByRole('button', { name: 'Page data…', exact: true }).click();
  const data = page.getByRole('dialog', { name: 'Page data · صفحات شهرها' });
  await expect(data).toContainText('Connected');
  await expect(data).toContainText('Share path');
  await expect(data).toContainText('weather/صفحات-شهرها-rows.sample.xlsx');
  await expect(data).not.toContainText('not connected in this session');
  await data.getByRole('button', { name: 'Cancel', exact: true }).click();

  await app.openPreviewModal();
  await expect(app.previewDialog.getByRole('button', { name: /Edit rows/ })).toHaveCount(0);
  await expect(app.previewDialog.getByLabel('شهرها connected file').first()).toBeVisible();
  await expect(app.previewDialog).toContainText('weather/صفحات-شهرها-rows.sample.xlsx');
});
