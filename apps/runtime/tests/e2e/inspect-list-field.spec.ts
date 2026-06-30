import { buildListFieldVcg, expect, test } from './fixtures/runtime.js';

/**
 * B-040 — a ticker `list` Data key (`_tickerTexts`) must render in the operator
 * Inspector as a STRUCTURED items editor, never "[object Object]", and edits must
 * round-trip as structure through `stack.update` (a stringified array would resurface
 * as "[object Object]" on re-read).
 */

test('a ticker list field renders an items editor (not "[object Object]") and edits round-trip as structure', async ({
  app,
}) => {
  const templateId = 'tpl-e2e-list';
  await app.importVcg('list.vcg', await buildListFieldVcg(templateId));
  await app.loadTemplate(templateId);
  await app.selectStackRow(templateId);

  // The list field renders one editable input per item, showing the real text…
  const item1 = app.inspector.getByRole('textbox', { name: '_tickerTexts item 1' });
  const item2 = app.inspector.getByRole('textbox', { name: '_tickerTexts item 2' });
  await expect(item1).toHaveValue('سلام دنیا');
  await expect(item2).toHaveValue('اخبار فوری');
  // …and the corrupted string never appears anywhere in the Inspector.
  await expect(app.inspector.getByText('[object Object]', { exact: false })).toHaveCount(0);

  // Edit item 1 and commit (blur) → it must round-trip as STRUCTURE: re-reading the
  // field shows the edited text (a stringified array would show "[object Object]").
  await item1.fill('خبر تازه');
  await item1.blur();
  await expect(app.inspector.getByRole('textbox', { name: '_tickerTexts item 1' })).toHaveValue(
    'خبر تازه',
  );
  await expect(app.inspector.getByRole('textbox', { name: '_tickerTexts item 2' })).toHaveValue(
    'اخبار فوری',
  );
  await expect(app.inspector.getByText('[object Object]', { exact: false })).toHaveCount(0);
});
