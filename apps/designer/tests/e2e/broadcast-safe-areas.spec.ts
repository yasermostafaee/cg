import { expect, test } from './fixtures/designer.js';

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
