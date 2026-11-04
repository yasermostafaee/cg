import { expect, test } from './fixtures/designer.js';

test('ticker text keeps its spacing when the strap is nested in the exported composition', async ({
  app,
}) => {
  await app.goto();
  await app.page
    .getByTestId('starter-card')
    .filter({ hasText: 'نوار اخبار — News Ticker' })
    .click();
  await app.expectStudio();

  const row = app.canvasFrame.locator('[data-cg-ticker-static]').first();
  await expect(row).toBeVisible();
  const boxes = await row.locator(':scope > span').evaluateAll((nodes) =>
    nodes.map((node) => {
      const rect = node.getBoundingClientRect();
      return { left: rect.left, right: rect.right, width: rect.width };
    }),
  );

  expect(boxes.length).toBeGreaterThan(3);
  expect(boxes.every((box) => box.width > 1)).toBe(true);
  const ordered = [...boxes].sort((a, b) => a.left - b.left);
  expect(
    ordered.every((box, index) => index === 0 || box.left >= (ordered[index - 1]?.right ?? 0) - 1),
  ).toBe(true);
});
