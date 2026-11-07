import { expect, test } from './fixtures/designer.js';

for (const width of [1920, 960]) {
  test(`ticker text keeps its spacing in a nested ${width}px composition`, async ({ app }) => {
    await app.goto();
    await app.page.getByTestId('starter-card').filter({ hasText: 'زیرنویس حرکت افقی' }).click();
    await app.expectStudio();
    if (width !== 1920) {
      await app.selectElementById('tk-strap');
      const input = app.inspector.getByRole('spinbutton', { name: 'Width', exact: true });
      await input.fill(String(width));
      await input.press('Enter');
    }

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
      ordered.every(
        (box, index) => index === 0 || box.left >= (ordered[index - 1]?.right ?? 0) - 1,
      ),
    ).toBe(true);

    await app.openPreviewModal();
    await app.play();
    const items = app.previewFrame.locator('[data-cg-ticker-item]');
    await expect(items.first()).toBeAttached();
    await expect.poll(async () => items.count()).toBeGreaterThan(2);
    const moving = await items.evaluateAll((nodes) =>
      nodes
        .filter((node) => getComputedStyle(node).visibility !== 'hidden')
        .map((node) => {
          const rect = node.getBoundingClientRect();
          return { left: rect.left, right: rect.right, width: rect.width };
        }),
    );
    const sorted = moving.sort((a, b) => a.left - b.left);
    expect(sorted.length).toBeGreaterThan(1);
    expect(
      sorted.every((box, i) => i === 0 || box.left >= (sorted[i - 1]?.right ?? 0) - 1),
      JSON.stringify(sorted),
    ).toBe(true);
    await app.stop();
  });
}
