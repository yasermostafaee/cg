import { buildFileSourceVcg, expect, test } from './fixtures/runtime.js';

/**
 * R-102 — the operator inspects potentially large live-file content in a wide modal, not in the
 * narrow Inspector. The modal owns list interpretation and remains preview-only.
 */
test('an attached file opens raw content and parsed fields in a modal without staging it', async ({
  app,
}) => {
  const templateId = 'tpl-e2e-file-source-preview';
  await app.importVcg('file-source.vcg', await buildFileSourceVcg(templateId), 84);
  await app.selectLayerRow(84);

  await app.page.evaluate(() => {
    const target = window as unknown as {
      __filePreviewReads: number;
      cg: {
        textSources: {
          read: (request: {
            path: string;
          }) => Promise<{ name: string; sourcePath?: string; content: string }>;
        };
      };
    };
    target.__filePreviewReads = 0;
    target.cg.textSources.read = (request) => {
      target.__filePreviewReads += 1;
      return Promise.resolve({
        name: request.path,
        sourcePath: String.raw`\\newsroom\CG Text\headlines.txt`,
        content: 'first|second,third',
      });
    };
  });

  const view = app.inspector.getByRole('button', {
    name: 'View headlines file content and fields',
  });
  await expect(view).toBeVisible();
  await expect(app.inspector.getByLabel('File content', { exact: true })).toHaveCount(0);
  await expect(app.inspector.getByLabel('Parsed fields', { exact: true })).toHaveCount(0);
  await expect(app.inspector.getByLabel('Split headlines into items', { exact: true })).toHaveCount(
    0,
  );
  await expect(app.inspector.getByLabel('headlines split delimiter', { exact: true })).toHaveCount(
    0,
  );

  const dirty = app.inspector
    .locator('[data-field-heading="headlines"]')
    .locator('..')
    .locator('.cg-dirty-dot');
  await expect(dirty).toHaveCount(0);
  await app.installUpdateSpy();
  await view.click();

  const dialog = app.page.getByRole('dialog', {
    name: 'File content and fields · headlines',
  });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(String.raw`\\newsroom\CG Text\headlines.txt`);
  await expect(dialog.getByLabel('File content', { exact: true })).toContainText(
    'first|second,third',
  );
  await expect(dialog.getByLabel('Parsed fields', { exact: true })).toContainText('first');
  await expect(dialog.getByLabel('Parsed fields', { exact: true })).toContainText('second,third');
  const contentBox = await dialog.getByLabel('File content', { exact: true }).boundingBox();
  const fieldsBox = await dialog.getByLabel('Parsed fields', { exact: true }).boundingBox();
  expect(contentBox?.height ?? 0).toBeGreaterThanOrEqual(384);
  expect(fieldsBox?.height ?? 0).toBeGreaterThanOrEqual(384);
  await expect(dialog.getByLabel('Split headlines into items', { exact: true })).toBeChecked();

  const delimiter = dialog.getByLabel('headlines split delimiter', { exact: true });
  await expect(delimiter).toHaveValue('|');
  await delimiter.selectOption(',');
  await expect(dialog.getByLabel('Parsed fields', { exact: true })).toContainText('first|second');
  await expect(dialog.getByLabel('Parsed fields', { exact: true })).toContainText('third');
  expect(
    await app.page.evaluate(
      () => (window as unknown as { __filePreviewReads: number }).__filePreviewReads,
    ),
  ).toBe(1);
  await expect(dirty).toHaveCount(0);
  expect(await app.updateCount()).toBe(0);
});
