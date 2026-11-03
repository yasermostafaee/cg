import { buildPagedRepeaterVcg, expect, test } from './fixtures/runtime.js';

test.describe('D-180 — paged Repeater input authority', () => {
  test('File only removes manual rows but keeps the generated workbook path', async ({ app }) => {
    const templateId = 'tpl-e2e-paged-file-only';
    await app.importVcg(
      'paged-file-only.vcg',
      await buildPagedRepeaterVcg(templateId, { fileOnly: true }),
    );
    await app.selectStackRow(templateId);

    const rows = app.inspector.getByRole('region', { name: 'Weather pages all rows' });
    await expect(rows).toContainText('File only');
    await expect(rows.getByRole('button', { name: 'Save and connect Excel…' })).toBeVisible();
    await expect(rows.getByRole('textbox', { name: /Cities item/ })).toHaveCount(0);
    await expect(rows.getByRole('combobox', { name: /Cities item/ })).toHaveCount(0);
    await expect(
      rows.getByRole('button', { name: /Add Cities item|Remove Cities item/ }),
    ).toHaveCount(0);
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
});
