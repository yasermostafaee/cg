import { expect, test } from './fixtures/designer.js';

test('many safe frames remain accessible and restoring defaults requires confirmation', async ({
  app,
}, testInfo) => {
  await app.newProject('Many safe frames');
  const { page } = app;
  await page.setViewportSize({ width: 1280, height: 640 });
  const configure = page.getByRole('button', { name: 'Configure safe areas', exact: true });
  const settings = page.getByRole('dialog', { name: 'Safe area settings', exact: true });
  await configure.click();
  const add = settings.getByRole('button', { name: 'Add custom frame', exact: true });
  for (let index = 1; index < 22; index++) await add.click();
  const group = settings.getByRole('radiogroup');
  await expect(group.getByRole('radio')).toHaveCount(25);
  await expect(group.getByRole('radio', { checked: true })).toHaveAccessibleDescription(
    'Custom 22',
  );
  expect(await group.evaluate((el) => el.scrollHeight > el.clientHeight && el.scrollTop > 0)).toBe(
    true,
  );
  const reset = settings.getByRole('button', { name: 'Restore defaults', exact: true });
  await expect(reset).toBeInViewport();
  await settings.getByLabel('80% color hex', { exact: true }).scrollIntoViewIfNeeded();
  await expect(settings.getByLabel('80% color hex', { exact: true })).toBeInViewport();
  await reset.click();
  const confirm = page.getByRole('dialog', { name: 'Restore default safe areas', exact: true });
  await confirm.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(reset).toBeFocused();
  await expect(group.getByRole('radio')).toHaveCount(25);
  await expect(group.getByRole('radio', { checked: true })).toHaveAccessibleDescription(
    'Custom 22',
  );
  await page.screenshot({ path: testInfo.outputPath('safe-areas-22-custom.png') });
  await reset.click();
  await confirm.getByRole('button', { name: 'Restore defaults', exact: true }).click();
  await expect(group.getByRole('radio')).toHaveCount(4);
  await expect(group.getByRole('radio', { name: 'Auto' })).toBeChecked();
  await settings.getByRole('button', { name: 'Close safe area settings' }).click();
  await app.goto();
  await app.newProject('Defaults persisted');
  await configure.click();
  await expect(group.getByRole('radio')).toHaveCount(4);
  await expect(group.getByRole('radio', { name: 'Auto' })).toBeChecked();
});

test('safe guide reference and visibility settings persist, and ruler guides are separate', async ({
  app,
}) => {
  const page = app.page;
  await app.newProject('Guide profile first project');
  const configure = page.getByRole('button', { name: 'Configure safe areas', exact: true });
  const settings = page.getByRole('dialog', { name: 'Safe area settings', exact: true });
  const guides = page.locator('[data-safe-area-guides]');
  await configure.click();
  await expect(
    settings.getByRole('button', { name: /Add (horizontal|vertical) guide/ }),
  ).toHaveCount(0);
  await settings.getByRole('radio', { name: '4:3', exact: true }).click();
  await settings.getByRole('checkbox', { name: 'Show this frame', exact: true }).check();
  const reference = guides.locator('[data-guide-reference="4:3"]');
  await expect(reference).toHaveAttribute('x', '240');
  await expect(reference).toHaveAttribute('width', '1440');
  await settings.getByRole('checkbox', { name: 'Show this frame', exact: true }).uncheck();
  await expect(guides.locator('[data-guide-aspect="4:3"]')).toHaveCount(0);
  await expect(guides.locator('[data-guide-aspect="auto"]')).toHaveCount(2);
  await settings.getByRole('button', { name: 'Close safe area settings', exact: true }).click();
  await app.goto();
  await app.newProject('Guide profile second project');
  await configure.click();
  await expect(settings.getByRole('radio', { name: '4:3', exact: true })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(
    settings.getByRole('checkbox', { name: 'Show this frame', exact: true }),
  ).not.toBeChecked();
  await settings.getByRole('radio', { name: '16:9', exact: true }).click();
  await settings.getByRole('checkbox', { name: 'Show this frame', exact: true }).check();
  await expect(guides.locator('[data-guide-reference="16:9"]')).toHaveAttribute('x', '0');
  await settings.getByRole('button', { name: 'Close safe area settings', exact: true }).click();
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
  await expect(toggle).toHaveAttribute('aria-keyshortcuts', 'Shift+S');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(guides).toHaveCount(0);
  await page.keyboard.press('Shift+S');
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
  await page.keyboard.press('Shift+S');
  await expect(guides).toHaveCount(0);
  // A view aid must never mark a new project as edited.
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: /^Undo/ })).toBeDisabled();
});

test('safe area color defaults to white and persists independently of the project', async ({
  app,
}, testInfo) => {
  const page = app.page;
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
  const settings = page.getByRole('dialog', { name: 'Safe area settings', exact: true });
  const configure = page.getByRole('button', { name: 'Configure safe areas', exact: true });
  const guides = page.locator('[data-safe-area-guides]');
  await page.getByRole('button', { name: 'Safe areas', exact: true }).click();
  const reference = guides.locator('[data-guide-reference="4:3"]');
  const action = guides.locator('[data-safe-area="action"]');
  const graphics = guides.locator('[data-safe-area="graphics"]');
  for (const outline of [reference, action, graphics])
    await expect(outline).toHaveAttribute('stroke', '#ffffff');
  await expect(guides.locator('[data-custom-guide]')).toHaveCount(0);
  await configure.click();
  const commonColor = settings.getByRole('textbox', { name: 'Frame color hex', exact: true });
  await expect(commonColor).toHaveValue('#ffffff');
  await commonColor.fill('#1256AB');
  await commonColor.press('Enter');
  for (const outline of [reference, action, graphics])
    await expect(outline).toHaveAttribute('stroke', '#1256ab');
  await commonColor.fill('#ffzz00');
  await commonColor.blur();
  await expect(commonColor).toHaveValue('#1256ab');
  await page.screenshot({ path: testInfo.outputPath('designer-guide-colors.png') });
  await settings.getByRole('button', { name: 'Close safe area settings', exact: true }).click();
  await expect(
    page.frameLocator('iframe[title="cgpreview"]').locator('[data-safe-area-guides]'),
  ).toHaveCount(0);
  await app.goto();
  await app.newProject('Guide colors second project');
  await configure.click();
  await expect(commonColor).toHaveValue('#1256ab');
  await settings.getByRole('button', { name: 'Close safe area settings', exact: true }).click();
  await page.getByRole('button', { name: 'Safe areas', exact: true }).click();
  await expect(reference).toHaveAttribute('stroke', '#1256ab');
  await expect(action).toHaveAttribute('stroke', '#1256ab');
});

test('multiple custom frames keep their own ratios, line colors and visibility', async ({
  app,
}, testInfo) => {
  await app.newProject('Independent safe frames');
  const { page } = app;
  const configure = page.getByRole('button', { name: 'Configure safe areas', exact: true });
  const settings = page.getByRole('dialog', { name: 'Safe area settings', exact: true });
  const show = settings.getByRole('checkbox', { name: 'Show this frame', exact: true });
  const guide = page.locator('[data-safe-area-guides]');
  const setValue = async (name: string, value: string): Promise<void> => {
    const field = settings.getByLabel(name, { exact: true });
    await field.fill(value);
    await field.press('Enter');
  };
  await configure.click();
  await settings.getByRole('radio', { name: '3:4', exact: true }).click();
  await show.check();
  await setValue('Frame color hex', '#46c2e3');
  await setValue('90% color hex', '#edab42');
  await settings.getByRole('button', { name: 'Add custom frame', exact: true }).click();
  await setValue('Custom guide ratio width', '9');
  await setValue('Custom guide ratio height', '16');
  await setValue('80% color hex', '#d6a2ff');
  await settings.getByRole('radio', { name: 'Auto', exact: true }).click();
  await show.uncheck();
  await settings.getByRole('radio', { name: '16:9', exact: true }).click();
  await show.check();
  await settings.getByRole('checkbox', { name: '93% Action Safe', exact: true }).check();
  await setValue('Frame color hex', '#75cd94');
  await settings.getByRole('radio', { name: '4:3', exact: true }).click();
  await show.check();
  await expect(guide.locator('[data-guide-aspect="custom"][data-guide-percent="100"]')).toHaveCount(
    2,
  );
  await expect(guide.locator('[data-guide-aspect="4:3"][data-guide-percent="100"]')).toHaveCount(1);
  await expect(
    guide.locator('[data-guide-frame="custom"][data-guide-percent="100"]'),
  ).toHaveAttribute('width', '810');
  await expect(
    guide.locator('[data-guide-frame="custom"][data-guide-percent="90"]'),
  ).toHaveAttribute('stroke', '#edab42');
  await expect(
    guide.locator('[data-guide-frame="custom"][data-guide-percent="80"]'),
  ).toHaveAttribute('stroke', '#46c2e3');
  await expect(guide.locator('[data-guide-percent="80"][stroke="#d6a2ff"]')).toHaveCount(1);
  await expect(guide.getByText('9:16 · 80%', { exact: true })).toBeVisible();
  await expect(
    guide.locator('g:last-child[data-safe-guide-labels]').getByText('16:9 · 93%', { exact: true }),
  ).toBeVisible();
  const captions = await Promise.all(
    ['3:4 · 100%', '9:16 · 100%'].map((label) =>
      guide.getByText(label, { exact: true }).boundingBox(),
    ),
  );
  expect(captions[0]).not.toBeNull();
  expect(captions[1]).not.toBeNull();
  if (!captions[0] || !captions[1]) throw new Error('Guide captions missing');
  expect(Math.abs(captions[0].y - captions[1].y)).toBeGreaterThanOrEqual(
    Math.min(captions[0].height, captions[1].height),
  );
  await settings.getByText('About safe areas · EBU R 95', { exact: true }).click();
  await expect(settings.getByText(/EBU R 95 defines Action Safe and Graphics Safe/)).toBeVisible();
  await settings.getByRole('button', { name: 'Close safe area settings', exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath('multiple-custom-safe-frames.png') });

  await app.goto();
  await app.newProject('Same saved safe frames');
  await page.keyboard.press('Shift+S');
  await expect(guide.locator('[data-guide-aspect="custom"][data-guide-percent="100"]')).toHaveCount(
    2,
  );
  await configure.click();
  await settings.getByRole('radio', { name: '9:16', exact: true }).click();
  await settings.getByRole('button', { name: 'Remove custom frame', exact: true }).click();
  await expect(guide.locator('[data-guide-aspect="custom"][data-guide-percent="100"]')).toHaveCount(
    1,
  );
  await expect(guide.getByText('3:4 · 80%', { exact: true })).toBeVisible();
});
