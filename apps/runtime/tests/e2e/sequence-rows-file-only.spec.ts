import { buildPagedRepeaterVcg, expect, test } from './fixtures/runtime.js';

test.describe('D-180 — paged Repeater input authority', () => {
  test('File only shows connection status and read-only data without workbook authoring', async ({
    app,
  }) => {
    const templateId = 'tpl-e2e-paged-file-only';
    await app.importVcg(
      'paged-file-only.vcg',
      await buildPagedRepeaterVcg(templateId, { fileOnly: true }),
    );
    await app.selectStackRow(templateId);

    const rows = app.inspector.getByRole('region', { name: 'Weather pages all rows' });
    await expect(rows).toContainText('File managed');
    await expect(rows).toContainText('Not connected');
    await expect(rows).toContainText('Connect this workbook in Designer.');
    await expect(rows.getByRole('button', { name: /Save and connect|Detach/ })).toHaveCount(0);
    await expect(rows.getByRole('textbox', { name: /Cities item/ })).toHaveCount(0);
    await expect(rows.getByRole('combobox', { name: /Cities item/ })).toHaveCount(0);
    await expect(
      rows.getByRole('button', { name: /Add Cities item|Remove Cities item/ }),
    ).toHaveCount(0);

    await rows.getByRole('button', { name: 'View current data' }).click();
    const currentData = app.page.getByRole('dialog', {
      name: 'Current file-only data · Cities',
    });
    await expect(currentData).toContainText('3 rows');
    await expect(currentData).toContainText('3 columns');
    await expect(currentData).toContainText('All values match the template');
    await expect(currentData.getByRole('columnheader')).toHaveText([
      'Row',
      'City',
      'Temperature',
      'Weather',
    ]);
    await expect(currentData).toContainText('Rain (0)');
    await expect(currentData).toContainText('Sun (1)');
    await expect(currentData.locator('input, select, textarea')).toHaveCount(0);
    await currentData.getByRole('button', { name: 'Done' }).click();
    await expect(currentData).toHaveCount(0);
  });

  test('numeric cells use the same active field surface as text cells', async ({ app }) => {
    const templateId = 'tpl-e2e-paged-manual';
    await app.importVcg('paged-manual.vcg', await buildPagedRepeaterVcg(templateId));
    await app.selectStackRow(templateId);

    const city = app.inspector.getByRole('textbox', { name: 'Cities item 1 City' });
    const temperature = app.inspector.getByRole('textbox', {
      name: 'Cities item 1 Temperature',
    });
    await expect(temperature).toBeEnabled();
    const appearance = await Promise.all(
      [city, temperature].map((field) =>
        field.evaluate((element) => {
          const style = getComputedStyle(element);
          return {
            backgroundColor: style.backgroundColor,
            borderColor: style.borderColor,
            opacity: style.opacity,
          };
        }),
      ),
    );
    expect(appearance[1]).toEqual(appearance[0]);
  });

  test('a connected Sequence workbook is the only source without child File-only flags', async ({
    app,
  }) => {
    const templateId = 'tpl-e2e-sequence-owned-file';
    await app.importVcg(
      'sequence-owned-file.vcg',
      await buildPagedRepeaterVcg(templateId, { pageDataFile: 'weather/cities.xlsx' }),
    );
    await app.selectStackRow(templateId);

    const rows = app.inspector.getByRole('region', { name: 'Weather pages all rows' });
    await expect(rows).toContainText('File managed');
    await expect(rows).toContainText('cities.xlsx');
    await expect(rows.getByRole('textbox', { name: /Cities item/ })).toHaveCount(0);
    await expect(rows.getByRole('combobox', { name: /Cities item/ })).toHaveCount(0);
    await expect(rows.getByRole('button', { name: /Save and connect|Detach/ })).toHaveCount(0);
    await expect(rows.getByRole('button', { name: 'View current data' })).toBeVisible();
  });
});
