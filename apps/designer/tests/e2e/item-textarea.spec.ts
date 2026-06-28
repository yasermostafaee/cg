import { test, expect } from './fixtures/designer.js';

/**
 * D-118 — the SEQUENCE item-text field is a multi-line textarea (sequence ONLY; the ticker keeps its
 * single-line input). Enter inserts a `\n` (it does NOT commit/close), edits commit through the
 * existing item-update store path (round-trip + undo), the element's direction drives `dir` (RTL),
 * and the operator PREVIEW field form uses the SAME textarea as the properties panel.
 */

const TAG = (el: HTMLElement): string => el.tagName;

test('a sequence item-text field is a textarea: Enter inserts a newline (RTL), and it round-trips', async ({
  app,
}) => {
  await app.newProject('SeqItemTextarea');
  await app.addSequence();
  await app.inspector.getByRole('combobox', { name: 'direction' }).selectOption('rtl');

  const ta = app.tickerItemInput('Sequence', 1);
  expect(await ta.evaluate(TAG)).toBe('TEXTAREA'); // not a single-line input
  await expect(ta).toHaveAttribute('dir', 'rtl'); // edits in reading order

  await ta.click();
  await ta.fill('');
  await ta.pressSequentially('خط نخست');
  await ta.press('Enter'); // inserts a newline …
  await ta.pressSequentially('خط دوم');
  await expect(ta).toBeFocused(); // … and does NOT commit/close the field
  await expect(ta).toHaveValue('خط نخست\nخط دوم');

  // Round-trip through the store: deselect, reselect the sequence, the embedded `\n` persists.
  const seqId = (await app.timelineRowIds())[0]!;
  await app.deselect();
  await app.page.locator(`.cg-tl-row[data-element-id="${seqId}"]`).click();
  await expect(app.tickerItemInput('Sequence', 1)).toHaveValue('خط نخست\nخط دوم');
});

test('a sequence item edit is one undo entry', async ({ app }) => {
  await app.newProject('SeqUndo');
  await app.addSequence();

  const ta = app.tickerItemInput('Sequence', 1);
  await ta.fill('سطر یک\nسطر دو'); // one atomic edit ⇒ one item-update commit ⇒ one undo entry
  await expect(ta).toHaveValue('سطر یک\nسطر دو');

  await app.deselect(); // blur so Ctrl+Z hits the app undo, not the field's native undo
  await app.page.keyboard.press('Control+z');
  const seqId = (await app.timelineRowIds())[0]!;
  await app.page.locator(`.cg-tl-row[data-element-id="${seqId}"]`).click();
  await expect(app.tickerItemInput('Sequence', 1)).not.toHaveValue('سطر یک\nسطر دو');
});

test('the operator preview field form uses the SAME textarea as the inspector', async ({ app }) => {
  await app.newProject('SeqPreview');
  await app.addSequence();
  await app.setDataKey('rundown'); // bind the sequence items to a data field → preview items editor
  await app.openPreviewModal();

  const previewItem = app.tickerItemInput('rundown', 1, app.previewDialog);
  await expect(previewItem).toBeVisible();
  expect(await previewItem.evaluate(TAG)).toBe('TEXTAREA'); // matches the properties panel
});
