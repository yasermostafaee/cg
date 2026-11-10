import { expect, test } from './fixtures/designer.js';

test('D-208 — project defaults initialize new projects and persist separately from one-off choices', async ({
  app,
}) => {
  const page = app.page;
  const openNewProject = (): Promise<void> =>
    page.getByRole('button', { name: 'New project', exact: true }).click();
  await openNewProject();
  const creation = page.getByRole('dialog', { name: 'New project', exact: true });
  await creation.getByRole('button', { name: 'Project defaults…' }).click();

  const defaults = page.getByRole('dialog', { name: 'Project defaults', exact: true });
  await defaults.getByRole('textbox', { name: 'Project name' }).fill('خبر');
  await defaults.getByRole('combobox', { name: 'Resolution preset' }).selectOption('custom');
  await defaults.getByRole('spinbutton', { name: 'Width', exact: true }).fill('1024');
  await defaults.getByRole('spinbutton', { name: 'Height', exact: true }).fill('576');
  await defaults.getByRole('combobox', { name: 'Frame rate' }).selectOption('25');
  await defaults.getByRole('spinbutton', { name: 'Duration in seconds' }).fill('4');
  await expect(defaults.getByRole('spinbutton', { name: 'Total frames' })).toHaveValue('100');
  await defaults.getByRole('button', { name: 'Save defaults' }).click();
  await expect(creation.getByRole('textbox', { name: 'Project name' })).toHaveValue('خبر');
  await expect(creation.getByRole('spinbutton', { name: 'Width', exact: true })).toHaveValue(
    '1024',
  );
  await expect(creation.getByRole('spinbutton', { name: 'Height', exact: true })).toHaveValue(
    '576',
  );
  await expect(creation.getByRole('combobox', { name: 'Frame rate' })).toHaveValue('25');

  await creation.getByRole('textbox', { name: 'Project name' }).fill('Just this once');
  await creation.getByRole('combobox', { name: 'Frame rate' }).selectOption('30');
  await creation.getByRole('button', { name: 'Create' }).click();
  await app.expectStudio();
  await expect(page.getByTitle('Resolution')).toHaveText('1024×576');
  await expect(page.getByTitle('Frame rate')).toHaveText('30 fps');

  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Project defaults…' }).click();
  await defaults.getByRole('combobox', { name: 'Frame rate' }).selectOption('60');
  await defaults.getByRole('button', { name: 'Cancel', exact: true }).click();
  await app.goto();
  await openNewProject();
  await expect(creation.getByRole('textbox', { name: 'Project name' })).toHaveValue('خبر');
  await expect(creation.getByRole('combobox', { name: 'Resolution preset' })).toHaveValue('custom');
  await expect(creation.getByRole('combobox', { name: 'Frame rate' })).toHaveValue('25');
  await expect(creation.getByRole('spinbutton', { name: 'Total frames' })).toHaveValue('100');
  await expect(creation.getByRole('spinbutton', { name: 'Duration in seconds' })).toHaveValue('4');
});
