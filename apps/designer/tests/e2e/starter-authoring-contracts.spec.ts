import { expect, test } from './fixtures/designer.js';

test('guest-title shared plate extends behind the replaceable logo', async ({ app }) => {
  await app.page.getByTestId('starter-card').filter({ hasText: 'زیرنویس معرفی' }).click();
  await app.expectStudio();
  await app.openPreviewModal();
  await app.play();
  const plate = app.previewElement('tt-name-plate');
  const logo = app.previewElement('tt-star');
  await expect(logo).toBeVisible();
  await expect(plate).toHaveCSS('opacity', '1');
  await expect
    .poll(async () => {
      const [plateBox, logoBox] = await Promise.all([plate.boundingBox(), logo.boundingBox()]);
      if (plateBox === null || logoBox === null) return false;
      return (
        plateBox.x <= logoBox.x &&
        plateBox.y <= logoBox.y &&
        plateBox.x + plateBox.width > logoBox.x + logoBox.width &&
        plateBox.y + plateBox.height >= logoBox.y + logoBox.height
      );
    })
    .toBe(true);
});

test('weather choice list and image mapping are inspectable and editable through normal Designer controls', async ({
  app,
}) => {
  await app.goto();
  await app.page.getByTestId('starter-card').filter({ hasText: 'پیش‌بینی چندروزهٔ هوا' }).click();
  await app.expectStudio();
  await app.openComposition('کارت پیش‌بینی روز');
  await app.selectElementById('forecast-condition');
  await expect(app.inspector.getByLabel('Data key')).toHaveValue('weatherType');
  await expect(app.inspector.getByRole('combobox', { name: 'Field type' })).toHaveValue('select');
  await app.inspector.getByRole('button', { name: 'Edit…', exact: true }).click();
  const choices = app.page.getByRole('dialog', { name: 'Edit text choices' });
  await expect(choices.getByLabel('Choice 1 value')).toHaveValue('آفتابی');
  await expect(choices.getByLabel('Choice 3 value')).toHaveValue('بارانی');
  await expect(choices.getByLabel('Choice 5 value')).toHaveValue('نیمه‌ابری');
  await choices.getByRole('button', { name: 'Save choices' }).click();
  const icon = app.canvasFrame.locator('[data-cg-element-id="forecast-icon"]');
  const before = await icon.getAttribute('data-cg-asset-id');
  await app.inspector.getByRole('combobox', { name: 'Value', exact: true }).selectOption('بارانی');
  await expect(app.canvasFrame.locator('[data-cg-element-id="forecast-condition"]')).toHaveText(
    'بارانی',
  );
  await expect.poll(() => icon.getAttribute('data-cg-asset-id')).not.toBe(before);
  await app.selectElementById('forecast-icon');
  await app.inspector.getByTestId('value-rules-open').click();
  const rules = app.page.getByTestId('value-rules');
  await expect(
    rules.getByRole('combobox', { name: 'value', exact: true }).first().locator('option'),
  ).toHaveText(['آفتابی', 'ابری', 'بارانی', 'برفی', 'نیمه‌ابری']);
});

test('league row rank is an automatic design setting, not an operator data field', async ({
  app,
}) => {
  await app.goto();
  await app.page.getByTestId('starter-card').filter({ hasText: 'جدول لیگ برتر ایران' }).click();
  await app.expectStudio();
  await app.openComposition('ردیف جدول لیگ برتر');
  await app.selectElementById('az-rank');
  await expect(app.inspector.getByText('Automatic row number', { exact: true })).toBeVisible();
  await expect(app.inspector.getByLabel('Data key')).toHaveCount(0);
});

test('forecast keeps equal-size high and low values with separate readable labels and no temperature tiles', async ({
  app,
}) => {
  await app.goto();
  const card = app.page.getByTestId('starter-card').filter({ hasText: 'پیش‌بینی چندروزهٔ هوا' });
  await card.hover();
  const video = card.getByTestId('starter-motion-preview');
  await expect.poll(() => video.evaluate((node) => !(node as HTMLVideoElement).paused)).toBe(true);
  await expect
    .poll(() => video.evaluate((node) => (node as HTMLVideoElement).duration))
    .toBeGreaterThan(5);
  await card.click();
  await app.expectStudio();
  await app.openPreviewModal();
  await app.play();
  const high = app.previewElement('forecast-high').first();
  const low = app.previewElement('forecast-low').first();
  await expect(high).toBeVisible();
  await expect(low).toBeVisible();
  const highSize = await high.evaluate((node) =>
    Number.parseFloat(getComputedStyle(node).fontSize),
  );
  const lowSize = await low.evaluate((node) => Number.parseFloat(getComputedStyle(node).fontSize));
  expect(highSize).toBe(lowSize);
  await expect(high).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(low).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(app.previewElement('forecast-high-degree')).toHaveText(['°', '°', '°', '°', '°']);
  await expect(app.previewElement('forecast-low-degree')).toHaveText(['°', '°', '°', '°', '°']);
  await expect(app.previewElement('forecast-high-label')).toHaveText(
    Array.from({ length: 5 }, () => 'بیشینه'),
  );
  await expect(app.previewElement('forecast-low-label')).toHaveText(
    Array.from({ length: 5 }, () => 'کمینه'),
  );
  for (const [number, label] of [
    [high, app.previewElement('forecast-high-label').first()],
    [low, app.previewElement('forecast-low-label').first()],
  ] as const) {
    await expect(number).toHaveCSS('text-align', 'end');
    await expect(label).toHaveCSS('text-align', 'center');
    const [numberBox, labelBox] = await Promise.all([number.boundingBox(), label.boundingBox()]);
    expect(numberBox).not.toBeNull();
    expect(labelBox).not.toBeNull();
    // The compact number/degree pair sits over a stable centered label column.
    // Its numeric box reserves room on the left for negative values.
    expect(labelBox!.x).toBeGreaterThan(numberBox!.x);
    expect(labelBox!.width).toBeCloseTo(numberBox!.width, 1);
  }
});
