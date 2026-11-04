import { expect, test } from './fixtures/designer.js';

// D-179: these are additive examples; the existing two weather styles stay available.
const examples = [
  {
    label: 'آب‌وهوای شهرها — کارت‌های تصویری',
    composition: 'کارت آب‌وهوای شهر',
    prefix: 'weather',
  },
] as const;

for (const example of examples) {
  test(`${example.label}: weather choices and image rules use normal authoring controls`, async ({
    app,
  }) => {
    await expect(
      app.page.getByTestId('starter-card').filter({ hasText: 'پیش‌بینی چندروزهٔ هوا' }),
    ).toBeVisible();
    await expect(
      app.page.getByTestId('starter-card').filter({ hasText: 'آب‌وهوای مراکز استان‌ها' }),
    ).toBeVisible();
    await app.page.getByTestId('starter-card').filter({ hasText: example.label }).click();
    await app.expectStudio();
    await app.openComposition(example.composition);
    await app.selectElementById(`${example.prefix}-condition`);
    await expect(app.inspector.getByLabel('Data key')).toHaveValue('weatherType');
    await expect(app.inspector.getByRole('combobox', { name: 'Field type' })).toHaveValue('select');
    const icon = app.canvasFrame.locator(`[data-cg-element-id="${example.prefix}-icon"]`);
    const before = await icon.getAttribute('data-cg-asset-id');
    await app.inspector
      .getByRole('combobox', { name: 'Value', exact: true })
      .selectOption('بارانی');
    await expect(
      app.canvasFrame.locator(`[data-cg-element-id="${example.prefix}-condition"]`),
    ).toHaveText('بارانی');
    await expect.poll(() => icon.getAttribute('data-cg-asset-id')).not.toBe(before);
    await app.selectElementById(`${example.prefix}-icon`);
    await app.inspector.getByTestId('value-rules-open').click();
    await expect(
      app.page
        .getByTestId('value-rules')
        .getByRole('combobox', { name: 'value', exact: true })
        .first()
        .locator('option'),
    ).toHaveText(['آفتابی', 'ابری', 'بارانی', 'برفی', 'نیمه‌ابری']);
  });
}

test('city weather cards render four equal portrait cards and continuously animated icons', async ({
  app,
}, testInfo) => {
  await app.page.setViewportSize({ width: 1600, height: 1000 });
  await app.page.getByTestId('starter-card').filter({ hasText: examples[0].label }).click();
  await app.expectStudio();
  await app.openPreviewModal();
  await app.play();
  await expect(app.previewDialog.getByLabel('Preview frame')).toContainText('100 / 160');
  const cards = app.previewElement('weather-row-bg').filter({ visible: true });
  await expect(cards).toHaveCount(4);
  const boxes = await cards.evaluateAll((nodes) =>
    nodes.map((node) => {
      const box = node.getBoundingClientRect();
      return { x: box.x, y: box.y, width: box.width, height: box.height };
    }),
  );
  for (const box of boxes) {
    expect(box.width).toBeGreaterThan(0);
    expect(box.width).toBeCloseTo(boxes[0]!.width, 1);
    expect(box.height).toBeCloseTo(boxes[0]!.height, 1);
    expect(box.height / box.width).toBeCloseTo(600 / 384, 2);
  }
  const sorted = [...boxes].sort((a, b) => a.x - b.x);
  for (let index = 1; index < sorted.length; index += 1) {
    expect(sorted[index]!.x).toBeGreaterThan(sorted[index - 1]!.x + sorted[index - 1]!.width);
    expect(sorted[index]!.y).toBeCloseTo(sorted[0]!.y, 1);
  }
  const stage = await app.previewFrame
    .locator('.cg-stage')
    .first()
    .evaluate((node) => {
      const box = node.getBoundingClientRect();
      return { x: box.x, y: box.y, right: box.right, bottom: box.bottom };
    });
  for (const box of boxes) {
    expect(box.x).toBeGreaterThanOrEqual(stage.x);
    expect(box.y).toBeGreaterThanOrEqual(stage.y);
    expect(box.x + box.width).toBeLessThanOrEqual(stage.right + 1);
    expect(box.y + box.height).toBeLessThanOrEqual(stage.bottom + 1);
  }
  const icon = app.previewElement('weather-icon').filter({ visible: true }).first();
  await expect(icon).toHaveJSProperty('complete', true);
  expect(await icon.evaluate((node) => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  const first = await icon.screenshot({ animations: 'allow' });
  await app.page.waitForTimeout(700);
  const later = await icon.screenshot({ animations: 'allow' });
  expect(first.equals(later)).toBe(false);
  await app.previewDialog.locator('iframe').screenshot({
    path: testInfo.outputPath('city-cards-held.png'),
  });
});
