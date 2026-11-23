import { readFile } from 'node:fs/promises';
import { buildTemplateLiveSources, readProjectDocument, unpack } from '@cg/vcg-format';
import { expect, test } from './fixtures/designer.js';

test('creates missing Focus destinations and exports all four independent shortcuts in a VCG', async ({
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

  for (const [index, routes] of [['host', 'guest-1', 'guest-2', 'guest-3'], ['host']].entries()) {
    await app.addLook();
    await app.openComposition('preset-' + String(index + 1));
    for (const [plateIndex, route] of routes.entries()) {
      await app.addLiveSource({
        x: 130 + plateIndex * 45,
        y: 145,
      });
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
  const host = app.inspector.getByRole('combobox', { name: 'Focus 1 · host', exact: true });
  await host.selectOption('look-2');
  const firstGuest = app.inspector.getByRole('combobox', {
    name: 'Focus 2 · guest-1',
    exact: true,
  });
  await expect(firstGuest.locator('option')).toHaveText(['Off', 'Create solo preset…']);
  await firstGuest.selectOption({ label: 'Create solo preset…' });
  await expect(firstGuest.locator('option:checked')).toHaveText('Focus guest-1');
  await focusSettings.focus();
  await app.undo();
  await expect(firstGuest).toHaveValue('');
  await expect(app.page.locator('.cg-comp-row', { hasText: 'Focus guest-1' })).toHaveCount(0);
  await expect(host).toHaveValue('look-2');

  const targets: Record<string, string> = { host: 'look-2' };
  for (let n = 1; n <= 3; n++) {
    const route = 'guest-' + String(n);
    const field = app.inspector.getByRole('combobox', {
      name: `Focus ${String(n + 1)} · ${route}`,
      exact: true,
    });
    await field.selectOption({ label: 'Create solo preset…' });
    await expect(field.locator('option:checked')).toHaveText('Focus ' + route);
    await expect(app.page.locator('.cg-comp-row', { hasText: 'Focus ' + route })).toHaveCount(1);
    targets[route] = await field.inputValue();
  }
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
    targets,
    effects: { switch: { mode: 'push', direction: 'up', durationMs: 640 } },
  });
  for (const [plate, target] of Object.entries(targets)) {
    const destination = carrier.looks?.find(({ id }) => id === target);
    expect(Object.keys(destination?.rects ?? {})).toEqual([plate]);
    if (plate !== 'host') {
      expect(destination?.rects[plate]).toEqual({
        x: 0,
        y: 0,
        width: scene.resolution.width,
        height: scene.resolution.height,
      });
    }
  }
  expect(carrier.looks?.[0]?.presetFocus).toEqual(savedLook?.presetFocus);
  expect(carrier.looks?.[0]?.entered).toEqual({ mode: 'cut' });
});
