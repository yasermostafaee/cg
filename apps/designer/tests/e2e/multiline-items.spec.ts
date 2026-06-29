import { test, expect } from './fixtures/designer.js';

/**
 * D-117 — multi-line SEQUENCE item text ON AIR (sequence ONLY; the ticker stays a single-line crawl).
 * Author a two-line item (the D-118 textarea preserves the `\n`) and assert the PREVIEW renders it as
 * multiple stacked lines and still transitions. RTL case.
 */

/** The number of rendered line boxes of the element's text (one client rect per line). */
const LINE_COUNT = (el: HTMLElement): number => {
  const range = el.ownerDocument.createRange();
  range.selectNodeContents(el);
  return range.getClientRects().length;
};

test('a sequence item with an explicit break renders multi-line on air and still advances (RTL)', async ({
  app,
}) => {
  await app.newProject('MultilineSequence');
  await app.addSequence();
  await app.inspector.getByRole('combobox', { name: 'direction' }).selectOption('rtl'); // a true RTL sequence
  await app.tickerItemInput('Sequence', 1).fill('خط نخست\nخط دوم طولانی برای آزمون شکستن');
  await app.setSequenceDwell(0.8);
  await app.openPreviewModal();
  await app.play();

  const item = app.previewFrame
    .locator('[data-cg-sequence-item]')
    .filter({ hasText: 'خط نخست' })
    .first();
  await expect(item).toBeVisible();
  await expect(item).toHaveCSS('white-space', 'pre-wrap');
  await expect(item).toHaveCSS('direction', 'rtl');
  expect(await item.evaluate(LINE_COUNT)).toBeGreaterThanOrEqual(2); // rendered as ≥ 2 lines

  // The multi-line item still transitions away to item 2 (the block animates as a unit).
  await expect(app.previewFrame.getByText('Then: second item')).toBeVisible({ timeout: 5000 });
  await app.stop();
});
