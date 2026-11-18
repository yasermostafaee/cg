import { expect, test } from './fixtures/designer.js';

test('custom safe guides use a saved landscape reference across projects and reloads', async ({
  app,
}, testInfo) => {
  const page = app.page;
  await app.newProject('Guide profile first project');
  const configure = page.getByRole('button', { name: 'Configure safe guides', exact: true });
  const settings = page.getByRole('dialog', { name: 'Safe guides', exact: true });
  const guides = page.locator('[data-safe-area-guides]');
  await configure.click();
  await settings.getByRole('radio', { name: '4:3', exact: true }).click();
  await settings.getByRole('button', { name: 'Add horizontal guide', exact: true }).click();
  await settings.getByRole('textbox', { name: 'Guide 1 name', exact: true }).fill('زیرنویس');
  const position = settings.getByRole('spinbutton', {
    name: 'Guide 1 position percent',
    exact: true,
  });
  await position.fill('75');
  await settings.getByRole('button', { name: 'Add vertical guide', exact: true }).click();
  await settings
    .getByRole('spinbutton', { name: 'Guide 2 position percent', exact: true })
    .fill('25');
  const reference = guides.locator('[data-guide-reference="4:3"]');
  await expect(reference).toHaveAttribute('x', '240');
  await expect(reference).toHaveAttribute('width', '1440');
  await expect(guides.locator('[data-custom-guide][data-guide-axis="y"]')).toHaveAttribute(
    'y1',
    '810',
  );
  await expect(guides.locator('[data-custom-guide][data-guide-axis="x"]')).toHaveAttribute(
    'x1',
    '600',
  );
  await position.fill('101');
  await expect(position).toHaveAttribute('aria-invalid', 'true');
  await expect(guides.locator('[data-custom-guide][data-guide-axis="y"]')).toHaveAttribute(
    'y1',
    '810',
  );
  await position.blur();
  await expect(position).toHaveValue('75');
  await settings.getByRole('checkbox', { name: 'Show guide 2', exact: true }).uncheck();
  await expect(guides.locator('[data-custom-guide]')).toHaveCount(1);
  await settings.getByRole('checkbox', { name: 'Broadcast safe areas', exact: true }).uncheck();
  await expect(guides.locator('[data-safe-area]')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('designer-custom-guides.png') });
  await settings.getByRole('button', { name: 'Close safe guide settings', exact: true }).click();
  await expect(
    page.frameLocator('iframe[title="cgpreview"]').locator('[data-custom-guide]'),
  ).toHaveCount(0);
  const saved = await page.evaluate(() => localStorage.getItem('cg.designer.safe-guides.v1'));
  expect(JSON.parse(saved ?? '{}')).toMatchObject({
    version: 1,
    aspect: '4:3',
    standardVisible: false,
    lines: [
      { name: 'زیرنویس', position: 75 },
      { position: 25, visible: false },
    ],
  });
  await app.goto();
  await app.newProject('Guide profile second project');
  await expect(page.getByRole('button', { name: 'Safe areas', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await configure.click();
  await expect(settings.getByRole('radio', { name: '4:3', exact: true })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(settings.getByRole('textbox', { name: 'Guide 1 name', exact: true })).toHaveValue(
    'زیرنویس',
  );
  await expect(
    settings.getByRole('spinbutton', { name: 'Guide 1 position percent', exact: true }),
  ).toHaveValue('75');
  await expect(
    settings.getByRole('checkbox', { name: 'Broadcast safe areas', exact: true }),
  ).not.toBeChecked();
  await settings.getByRole('button', { name: 'Remove guide 1', exact: true }).click();
  await expect(settings.getByRole('textbox', { name: 'Guide 1 name', exact: true })).toHaveValue(
    'Guide 2',
  );
  await settings.getByRole('radio', { name: '16:9', exact: true }).click();
  await expect(guides.locator('[data-guide-reference="16:9"]')).toHaveAttribute('x', '0');
  await settings.getByRole('button', { name: 'Close safe guide settings', exact: true }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: /^Undo/ })).toBeDisabled();
});

test('broadcast safe guides toggle without changing the document and stay on the picture through zoom and pan', async ({
  app,
}, testInfo) => {
  await app.newProject('Broadcast safe guides');
  const page = app.page;
  const toggle = page.getByRole('button', { name: 'Safe areas', exact: true });
  const guides = page.locator('[data-safe-area-guides]');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(guides).toHaveCount(0);
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(guides).toBeVisible();
  await expect(guides).toHaveCSS('pointer-events', 'none');
  const action = guides.locator('[data-safe-area="action"]');
  const graphics = guides.locator('[data-safe-area="graphics"]');
  await expect(action).toHaveAttribute('width', '1786');
  await expect(graphics).toHaveAttribute('width', '1728');
  await expect(action).toHaveAttribute('stroke', '#ffffff');
  await expect(graphics).toHaveAttribute('stroke', '#ffffff');
  await expect(action).toHaveAttribute('stroke-dasharray', '6 4');
  await expect(graphics).not.toHaveAttribute('stroke-dasharray');
  const frame = page.frameLocator('iframe[title="cgpreview"]');
  await expect(frame.locator('[data-safe-area-guides]')).toHaveCount(0);
  const compare = async (): Promise<void> => {
    const [picture, outline] = await Promise.all([
      frame.locator('.cg-stage').boundingBox(),
      guides.boundingBox(),
    ]);
    expect(picture).not.toBeNull();
    expect(outline).not.toBeNull();
    for (const key of ['x', 'y', 'width', 'height'] as const)
      expect(outline?.[key]).toBeCloseTo(picture?.[key] ?? -1000, 0);
  };
  await compare();
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await compare();
  const viewport = page.getByTestId('canvas-viewport');
  await viewport.evaluate((node) => {
    node.scrollLeft += 47;
    node.scrollTop += 31;
  });
  await compare();
  await page.setViewportSize({ width: 1100, height: 760 });
  await compare();
  await page.getByRole('button', { name: 'Fit', exact: true }).click();
  await compare();
  await page.screenshot({ path: testInfo.outputPath('designer-safe-areas.png') });
  await toggle.click();
  await expect(guides).toHaveCount(0);
  // A view aid must never mark a new project as edited.
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: /^Undo/ })).toBeDisabled();
});

test('guide colors inherit white for old profiles and retain common and individual edits across projects', async ({
  app,
}, testInfo) => {
  const page = app.page;
  // An existing v1 preference has no colour fields. Opening it must retain its guides.
  await page.evaluate(() => {
    localStorage.setItem(
      'cg.designer.safe-guides.v1',
      JSON.stringify({
        version: 1,
        aspect: '4:3',
        standardVisible: true,
        lines: [{ id: 'old-guide', name: 'عنوان', axis: 'y', position: 75, visible: true }],
      }),
    );
  });
  await app.goto();
  await app.newProject('Guide colors first project');
  const settings = page.getByRole('dialog', { name: 'Safe guides', exact: true });
  const configure = page.getByRole('button', { name: 'Configure safe guides', exact: true });
  const guides = page.locator('[data-safe-area-guides]');
  await page.getByRole('button', { name: 'Safe areas', exact: true }).click();
  const reference = guides.locator('[data-guide-reference="4:3"]');
  const custom = guides.locator('[data-custom-guide="old-guide"]');
  const action = guides.locator('[data-safe-area="action"]');
  const graphics = guides.locator('[data-safe-area="graphics"]');
  for (const outline of [reference, custom, action, graphics])
    await expect(outline).toHaveAttribute('stroke', '#ffffff');
  await expect(custom).toHaveAttribute('y1', '810');
  await expect(guides.getByText('عنوان', { exact: true })).toHaveAttribute('fill', '#ffffff');
  await configure.click();
  const commonColor = settings.getByRole('textbox', { name: 'Guide color hex', exact: true });
  const lineColor = settings.getByRole('textbox', { name: 'Guide 1 color hex', exact: true });
  const inherit = settings.getByRole('button', {
    name: 'Use guide color for guide 1',
    exact: true,
  });
  await expect(commonColor).toHaveValue('#ffffff');
  await expect(inherit).toBeDisabled();
  await commonColor.fill('#1256AB');
  await commonColor.press('Enter');
  for (const outline of [reference, custom, action, graphics])
    await expect(outline).toHaveAttribute('stroke', '#1256ab');
  await lineColor.fill('#ed5511');
  await lineColor.press('Enter');
  await expect(custom).toHaveAttribute('stroke', '#ed5511');
  await expect(guides.getByText('عنوان', { exact: true })).toHaveAttribute('fill', '#ed5511');
  await commonColor.fill('#42aa77');
  await commonColor.press('Enter');
  await expect(custom).toHaveAttribute('stroke', '#ed5511');
  await expect(action).toHaveAttribute('stroke', '#42aa77');
  await inherit.click();
  await expect(custom).toHaveAttribute('stroke', '#42aa77');
  await expect(inherit).toBeDisabled();
  await lineColor.fill('#ffzz00');
  await lineColor.blur();
  await expect(lineColor).toHaveValue('#42aa77');
  await expect(custom).toHaveAttribute('stroke', '#42aa77');
  await lineColor.fill('#ed5511');
  await lineColor.press('Enter');
  await page.screenshot({ path: testInfo.outputPath('designer-guide-colors.png') });
  await settings.getByRole('button', { name: 'Close safe guide settings', exact: true }).click();
  await expect(
    page.frameLocator('iframe[title="cgpreview"]').locator('[data-safe-area-guides]'),
  ).toHaveCount(0);
  await app.goto();
  await app.newProject('Guide colors second project');
  await expect(page.getByRole('button', { name: 'Safe areas', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await configure.click();
  await expect(commonColor).toHaveValue('#42aa77');
  await expect(lineColor).toHaveValue('#ed5511');
  await expect(settings.getByRole('textbox', { name: 'Guide 1 name', exact: true })).toHaveValue(
    'عنوان',
  );
  await settings.getByRole('button', { name: 'Close safe guide settings', exact: true }).click();
  await page.getByRole('button', { name: 'Safe areas', exact: true }).click();
  await expect(reference).toHaveAttribute('stroke', '#42aa77');
  await expect(action).toHaveAttribute('stroke', '#42aa77');
  await expect(custom).toHaveAttribute('stroke', '#ed5511');
  await expect(custom).toHaveAttribute('y1', '810');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: /^Undo/ })).toBeDisabled();
});
