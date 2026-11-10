import { test, expect } from './fixtures/runtime.js';

test('R-114: rename shipped and custom delimiters without changing their separator', async ({
  app,
}) => {
  const page = app.page;
  await app.openStationSetupAt('Text file delimiters');
  const setup = page.getByRole('dialog', { name: 'Station setup' });
  await setup.getByRole('button', { name: 'Add delimiter', exact: true }).click();
  const add = page.getByRole('dialog', { name: 'Add delimiter' });
  await add.getByLabel('New delimiter name').fill('double colon');
  await add.getByLabel('New delimiter character').fill('::');
  await add.getByRole('button', { name: 'Add delimiter', exact: true }).click();
  await expect(setup.getByRole('button', { name: 'Rename delimiter double colon' })).toBeVisible();

  const before = await page.evaluate(() => window.cg.delimiters.list());
  const rename = page.getByRole('dialog', { name: 'Rename delimiter' });
  for (const [label, next] of [
    ['Persian comma', 'ویرگول فارسی'],
    ['double colon', 'دو دونقطه'],
  ] as const) {
    await test.step(`Rename ${label}`, async () => {
      await setup.getByRole('button', { name: `Rename delimiter ${label}` }).click();
      const name = rename.getByRole('textbox', { name: 'Name', exact: true });
      await expect(name).toHaveValue(label);
      await expect(name).toBeFocused();
      await name.fill(next);
      await rename.getByRole('button', { name: 'Save name' }).click();
      await expect(rename).toBeHidden();
      await expect(setup.getByRole('button', { name: `Rename delimiter ${next}` })).toBeVisible();
    });
  }
  const after = await page.evaluate(() => window.cg.delimiters.list());
  expect(after).toEqual(
    before.map((d) => {
      if (d.label === 'Persian comma') return { ...d, label: 'ویرگول فارسی' };
      if (d.label === 'double colon') return { ...d, label: 'دو دونقطه' };
      return d;
    }),
  );

  await setup.getByRole('button', { name: 'Rename delimiter ویرگول فارسی' }).click();
  await rename.getByRole('textbox', { name: 'Name', exact: true }).fill('   ');
  await rename.getByRole('button', { name: 'Save name' }).click();
  await expect(rename).toContainText('Give the delimiter a name');
  await rename.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(setup.getByRole('button', { name: 'Rename delimiter ویرگول فارسی' })).toBeVisible();
  expect(await page.evaluate(() => window.cg.delimiters.list())).toEqual(after);
});
