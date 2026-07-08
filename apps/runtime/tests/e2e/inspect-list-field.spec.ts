import { buildListFieldVcg, expect, test } from './fixtures/runtime.js';

/**
 * B-040 + R-003 — a ticker `list` Data key (`_tickerTexts`) renders in the operator
 * Inspector as a STRUCTURED items editor, never "[object Object]". Edits STAGE
 * locally (R-003) and round-trip as structure only when APPLIED via the Update
 * button (a stringified array would resurface as "[object Object]" on re-read).
 */

test('a ticker list field renders an items editor (not "[object Object]") and edits round-trip as structure when applied', async ({
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

  // Edit item 1 (stages the draft) then APPLY → it must round-trip as STRUCTURE:
  // the field shows the edited text (a stringified array would show "[object Object]").
  await item1.fill('خبر تازه');
  await app.applyEdits();
  await expect(app.inspector.getByRole('textbox', { name: '_tickerTexts item 1' })).toHaveValue(
    'خبر تازه',
  );
  await expect(app.inspector.getByRole('textbox', { name: '_tickerTexts item 2' })).toHaveValue(
    'اخبار فوری',
  );
  await expect(app.inspector.getByText('[object Object]', { exact: false })).toHaveCount(0);
});

test('a two-line item keeps its newline: Enter inserts a line break and the \\n survives the applied payload', async ({
  app,
}) => {
  const templateId = 'tpl-e2e-list-ml';
  const twoLines = 'خبر خط یک\nخط دوم';
  await app.importVcg('list-ml.vcg', await buildListFieldVcg(templateId));
  await app.loadTemplate(templateId);
  await app.selectStackRow(templateId);

  // Type line 1, press Enter (must insert a newline — NOT commit/submit), type line 2.
  const item1 = app.inspector.getByRole('textbox', { name: '_tickerTexts item 1' });
  await item1.fill('خبر خط یک');
  await item1.press('Enter');
  await item1.pressSequentially('خط دوم');
  await expect(item1).toHaveValue(twoLines);

  // Apply via Update → the edited item round-trips as structure with the \n intact.
  await app.applyEdits();
  await expect(app.inspector.getByRole('textbox', { name: '_tickerTexts item 1' })).toHaveValue(
    twoLines,
  );
  await expect(app.inspector.getByRole('textbox', { name: '_tickerTexts item 2' })).toHaveValue(
    'اخبار فوری',
  );

  // The applied stack payload (what `stack.update` shipped) carries the newline —
  // a flattening editor would have joined the lines. Look the item up by templateId:
  // the MockRuntime boots with a seeded demo stack, so index 0 is NOT this template.
  const readPayload = (): Promise<string> =>
    app.page.evaluate(async (tid) => {
      const cg = (
        window as unknown as {
          cg: {
            stack: {
              snapshot(): Promise<{ templateId: string; fields: Record<string, unknown> }[]>;
            };
          };
        }
      ).cg;
      const snap = await cg.stack.snapshot();
      const item = snap.find((i) => i.templateId === tid);
      return JSON.stringify(item?.fields['_tickerTexts'] ?? null);
    }, templateId);
  await expect.poll(readPayload).toContain('خط دوم');
  const items = JSON.parse(await readPayload()) as { id: string; text: string }[];
  expect(items).toHaveLength(2);
  expect(items[0]?.text).toBe(twoLines);
  expect(items[1]?.text).toBe('اخبار فوری');
});
