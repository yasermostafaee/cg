import { expect, test } from './fixtures/designer.js';

test('a paged Repeater exposes and retains File only from Sequence Page data', async ({ app }) => {
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
  let dialog = app.page.getByRole('dialog', { name: 'Page data · Sequence' });
  const fileOnly = dialog.getByRole('checkbox', { name: 'File only in CG Control' });
  await expect(fileOnly).not.toBeChecked();
  await fileOnly.check();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();

  await expect(app.inspector).toContainText('CG Control · File only');
  await open.click();
  dialog = app.page.getByRole('dialog', { name: 'Page data · Sequence' });
  await expect(dialog.getByRole('checkbox', { name: 'File only in CG Control' })).toBeChecked();
});
