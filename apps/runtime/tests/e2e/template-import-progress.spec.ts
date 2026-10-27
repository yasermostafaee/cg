import { buildValidVcg, expect, test } from './fixtures/runtime.js';

/**
 * R-103 — after the operating-system chooser returns a file, a slow package import owns the
 * picker surface until verification finishes. The file name remains visible and no second
 * close/load/import action can race the pending import.
 */
test('a selected slow package replaces the template list with a named loading state', async ({
  app,
}) => {
  const before = await app.templateCount();
  await app.layerRow(84).getByRole('button', { name: 'LOAD' }).click();
  const dialog = app.templatePicker;
  await expect(dialog).toBeVisible();

  await app.page.evaluate(() => {
    const original = File.prototype.arrayBuffer;
    const target = window as unknown as { __releaseSlowImport?: () => void };
    File.prototype.arrayBuffer = function arrayBuffer(): Promise<ArrayBuffer> {
      if (this.name !== 'slow-news.vcg') return original.call(this);
      return new Promise<ArrayBuffer>((resolve, reject) => {
        target.__releaseSlowImport = () => void original.call(this).then(resolve, reject);
      });
    };
  });

  const chooser = app.page.waitForEvent('filechooser');
  await dialog.getByRole('button', { name: 'Import a .vcg' }).click();
  await (
    await chooser
  ).setFiles({
    name: 'slow-news.vcg',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from(await buildValidVcg('tpl-slow-import-e2e')),
  });

  const progress = dialog.locator('[data-template-import-progress]');
  await expect(progress).toBeVisible();
  await expect(progress).toContainText('Importing template…');
  await expect(progress).toContainText('slow-news.vcg');
  await expect(dialog).toHaveAttribute('aria-busy', 'true');
  await expect(dialog.getByRole('button', { name: 'Close' })).toBeDisabled();
  await expect(dialog.locator('[data-template-list]')).toHaveCount(0);

  await app.page.evaluate(() => {
    const target = window as unknown as { __releaseSlowImport?: () => void };
    target.__releaseSlowImport?.();
  });
  await expect(progress).toHaveCount(0);
  await expect(dialog).not.toHaveAttribute('aria-busy', 'true');
  await expect.poll(() => app.templateCount()).toBe(before + 1);
});
