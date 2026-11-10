import type { Page } from '@playwright/test';
import { writeZip } from '../../../../packages/vcg-format/src/zip.js';
import { buildFileSourceVcg, expect, test } from './fixtures/runtime.js';

const FILE_NAME = 'newsroom.docx';
const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

async function wordDocument(paragraphs: string[]): Promise<Uint8Array> {
  const body = paragraphs.map((text) => `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`).join('');
  const xml = `<w:document xmlns:w="${WORD_NS}"><w:body>${body}</w:body></w:document>`;
  return writeZip(new Map([['word/document.xml', new TextEncoder().encode(xml)]]));
}

async function writeWordFile(page: Page, data: Uint8Array): Promise<void> {
  await page.evaluate(
    async ({ filename, bytes }) => {
      const root = await navigator.storage.getDirectory();
      const file = await root.getFileHandle(filename, { create: true });
      const writer = await file.createWritable();
      await writer.write(Uint8Array.from(bytes));
      await writer.close();
    },
    { filename: FILE_NAME, bytes: Array.from(data) },
  );
}

test('R-116: read and reload Word paragraphs from the ticker source picker', async ({ app }) => {
  const page = app.page;
  const templateId = 'tpl-e2e-word-ticker';
  await app.importVcg(
    'word-ticker.vcg',
    await buildFileSourceVcg(templateId, { clearFile: true }),
    84,
  );
  await app.inspector.getByRole('button', { name: 'Close INSPECTOR' }).click();
  const original = ['خبر اول', 'خبر دوم'];
  await writeWordFile(page, await wordDocument(original));
  await page.evaluate((filename) => {
    Object.defineProperty(window, 'showOpenFilePicker', {
      configurable: true,
      value: async (options: { types: { accept: Record<string, string[]> }[] }) => {
        const extensions = options.types.flatMap(({ accept }) => Object.values(accept).flat());
        document.body.dataset['wordPickerExtensions'] = JSON.stringify(extensions);
        const root = await navigator.storage.getDirectory();
        return [await root.getFileHandle(filename)];
      },
    });
  }, FILE_NAME);
  await app.selectLayerRow(84);

  const apply = app.inspector.getByRole('button', { name: 'Apply staged edits' });
  const reload = app.inspector.getByRole('button', { name: 'Reload headlines from file' });
  const applied = () =>
    page.evaluate(async (id) => {
      const rows = await window.cg.stack.snapshot();
      return rows.find((row) => row.templateId === id)?.fields['headlines'];
    }, templateId);

  await app.inspector.getByRole('button', { name: 'Load headlines from file' }).click();
  const extensions = await page.locator('body').getAttribute('data-word-picker-extensions');
  expect(extensions).toContain('".txt"');
  expect(extensions).toContain('".doc"');
  expect(extensions).toContain('".docx"');
  expect(extensions).not.toContain('".json"');
  await expect(reload).toBeVisible();
  await apply.click();
  await expect.poll(applied).toMatchObject([{ text: original.join('\n') }]);

  const changed = ['سطر تازه', 'خبر سوم'];
  await writeWordFile(page, await wordDocument(changed));
  await reload.click();
  await apply.click();
  await expect.poll(applied).toMatchObject([{ text: changed.join('\n') }]);

  await writeWordFile(page, new TextEncoder().encode('not a Word document'));
  await reload.click();
  await expect(app.inspector.getByRole('alert')).toContainText('Cannot read');
  expect(await applied()).toMatchObject([{ text: changed.join('\n') }]);
});
