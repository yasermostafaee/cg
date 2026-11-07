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
    await currentData.locator('button[data-modal-role="cancel"]', { hasText: 'Close' }).click();
    await expect(currentData).toHaveCount(0);
  });

  test('numeric cells use the same active field surface as text cells', async ({ app }) => {
    const templateId = 'tpl-e2e-paged-manual';
    await app.importVcg('paged-manual.vcg', await buildPagedRepeaterVcg(templateId));
    await app.selectStackRow(templateId);

    const rows = app.inspector.getByRole('region', { name: 'Weather pages all rows' });
    await rows.getByRole('button', { name: 'Edit rows…' }).click();
    const editor = app.page.getByRole('dialog', { name: 'Edit Cities rows' });
    const city = editor.getByRole('textbox', { name: 'Cities item 1 City' });
    const temperature = editor.getByRole('textbox', {
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
    await editor.locator('button[data-modal-role="cancel"]', { hasText: 'Close' }).click();
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

  test('an unchanged authored Sequence file is clean on the first Inspector open', async ({
    app,
  }) => {
    const templateId = 'tpl-e2e-sequence-owned-clean-file';
    await app.importVcg(
      'sequence-owned-clean-file.vcg',
      await buildPagedRepeaterVcg(templateId, {
        pageDataFile: 'weather/cities.csv',
        allowOperatorRows: true,
      }),
    );
    await app.page.evaluate(() => {
      const target = window as unknown as {
        __sequenceFileReads: number;
        cg: {
          textSources: {
            read: (request: { path: string }) => Promise<{ name: string; content: string }>;
          };
        };
      };
      target.__sequenceFileReads = 0;
      target.cg.textSources.read = (request) => {
        target.__sequenceFileReads += 1;
        return Promise.resolve({
          name: request.path,
          content: 'City,Temperature,Weather\nTehran,25,0\nTabriz,-12,1\nShiraz,22,1',
        });
      };
    });

    await app.selectStackRow(templateId);
    const rows = app.inspector.getByRole('region', { name: 'Weather pages all rows' });
    await expect(rows).toContainText('File connected');
    await expect(rows).toContainText('Connected');
    await expect(rows.getByRole('button', { name: 'Edit rows…' })).toBeVisible();
    await expect
      .poll(() =>
        app.page.evaluate(
          () => (window as unknown as { __sequenceFileReads: number }).__sequenceFileReads,
        ),
      )
      .toBe(1);
    await expect(app.inspector.getByLabel('unapplied edits')).toHaveCount(0);
    await expect(
      app.inspector.getByRole('button', { name: 'Discard staged edits' }),
    ).toBeDisabled();
  });

  test('Reload grows the page count when the connected workbook gains rows', async ({ app }) => {
    const templateId = 'tpl-e2e-sequence-growing-file';
    await app.importVcg(
      'sequence-growing-file.vcg',
      await buildPagedRepeaterVcg(templateId, {
        pageDataFile: 'weather/cities.csv',
        allowOperatorRows: true,
      }),
    );
    await app.page.evaluate(() => {
      const target = window as unknown as {
        __sequenceRowsCsv: string;
        cg: {
          textSources: {
            read: (request: { path: string }) => Promise<{ name: string; content: string }>;
          };
        };
      };
      target.__sequenceRowsCsv = 'City,Temperature,Weather\nTehran,25,0\nTabriz,-12,1\nShiraz,22,1';
      target.cg.textSources.read = (request) =>
        Promise.resolve({ name: request.path, content: target.__sequenceRowsCsv });
    });
    await app.selectStackRow(templateId);

    const rows = app.inspector.getByRole('region', { name: 'Weather pages all rows' });
    await expect(rows).toContainText('3 rows · 2 pages · 2 per page');
    await app.page.evaluate(() => {
      (window as unknown as { __sequenceRowsCsv: string }).__sequenceRowsCsv =
        'City,Temperature,Weather\nTehran,25,0\nTabriz,-12,1\nShiraz,22,1\nYazd,30,0\nAhvaz,35,1';
    });
    await rows.getByRole('button', { name: 'Reload' }).click();
    await expect(rows).toContainText('5 rows · 3 pages · 2 per page');
    await expect(rows).not.toContainText('Add pages in Designer');

    await rows.getByRole('button', { name: 'Edit rows…' }).click();
    const editor = app.page.getByRole('dialog', { name: 'Edit Cities rows' });
    await expect(editor.getByRole('separator', { name: /Page/u })).toHaveCount(3);
    await editor.locator('button[data-modal-role="cancel"]', { hasText: 'Close' }).click();
  });

  test('Reload preserves author-locked Sequence columns and updates editable siblings', async ({
    app,
  }) => {
    const templateId = 'tpl-e2e-sequence-locked-columns';
    await app.importVcg(
      'sequence-locked-columns.vcg',
      await buildPagedRepeaterVcg(templateId, {
        pageDataFile: 'weather/cities.csv',
        allowOperatorRows: true,
        lockedCity: true,
      }),
    );
    await app.page.evaluate(() => {
      const target = window as unknown as {
        __sequenceRowsCsv: string;
        cg: {
          textSources: {
            read: (request: { path: string }) => Promise<{ name: string; content: string }>;
          };
        };
      };
      target.__sequenceRowsCsv = 'City,Temperature,Weather\nTehran,25,0\nTabriz,-12,1\nShiraz,22,1';
      target.cg.textSources.read = (request) =>
        Promise.resolve({ name: request.path, content: target.__sequenceRowsCsv });
    });
    await app.selectStackRow(templateId);

    const rows = app.inspector.getByRole('region', { name: 'Weather pages all rows' });
    await expect(rows).toContainText('File connected');
    await app.page.evaluate(() => {
      (window as unknown as { __sequenceRowsCsv: string }).__sequenceRowsCsv =
        'City,Temperature,Weather\nChanged,31,0\nChanged,-8,1\nChanged,27,1';
    });
    await rows.getByRole('button', { name: 'Reload' }).click();
    await rows.getByRole('button', { name: 'Edit rows…' }).click();
    const editor = app.page.getByRole('dialog', { name: 'Edit Cities rows' });
    const city = editor.getByRole('textbox', { name: 'Cities item 1 City' });
    const temperature = editor.getByRole('textbox', {
      name: 'Cities item 1 Temperature',
    });
    await expect(city).toBeDisabled();
    await expect(city).toHaveValue('Tehran');
    await expect(temperature).toBeEnabled();
    await expect(temperature).toHaveValue('31');
    await editor.locator('button[data-modal-role="cancel"]', { hasText: 'Close' }).click();
  });

  test('an open Inspector adopts Sequence file ownership after updating the same template', async ({
    app,
  }) => {
    const templateId = 'tpl-e2e-sequence-owner-reimport';
    await app.importVcg('sequence-owner.vcg', await buildPagedRepeaterVcg(templateId));
    await app.selectStackRow(templateId);

    const rows = app.inspector.getByRole('region', { name: 'Weather pages all rows' });
    await expect(rows.getByRole('button', { name: 'Edit rows…' })).toBeVisible();
    await expect(rows).toContainText('Save and connect Excel');

    await app.openTemplatePicker();
    const chooser = app.page.waitForEvent('filechooser');
    await app.templatePicker.getByRole('button', { name: 'Import a .vcg' }).first().click();
    await (
      await chooser
    ).setFiles({
      name: 'sequence-owner.vcg',
      mimeType: 'application/octet-stream',
      buffer: Buffer.from(
        await buildPagedRepeaterVcg(templateId, {
          pageDataFile: 'weather/cities.xlsx',
        }),
      ),
    });
    await app.page
      .locator('[data-modal-message]')
      .getByRole('button', { name: /^Update/ })
      .click();
    await app.closeTemplatePicker();

    await expect(rows).toContainText('File managed');
    await expect(rows).toContainText('cities.xlsx');
    await expect(rows.getByRole('textbox', { name: /Cities item/ })).toHaveCount(0);
    await expect(rows.getByRole('combobox', { name: /Cities item/ })).toHaveCount(0);
    await expect(rows.getByRole('button', { name: /Save and connect|Detach/ })).toHaveCount(0);
    await expect(rows.getByRole('button', { name: 'View current data' })).toBeVisible();
  });
});
