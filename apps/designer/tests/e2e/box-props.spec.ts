import { test, expect } from './fixtures/designer.js';

/**
 * D-042 — per-corner border radius + stroke on background-capable elements through
 * the real UI. Uses a TEXT element (a non-shape background-capable kind) to prove
 * the cross-cutting box style: the per-corner toggle (uniform ↔ four inputs), the
 * corner rendering in the preview, and a static stroke rendering on a non-shape
 * kind. The registry/store/runtime details are unit-tested; this guards the
 * integrated inspector → store → preview path.
 */
test.describe('Box props for all background-capable elements (D-042)', () => {
  test('per-corner border-radius toggle on a text element: uniform ↔ four corners; a corner renders', async ({
    app,
  }) => {
    await app.newProject('D042Radius');
    await app.addTextElement({ x: 220, y: 160 });

    // Expand the Border Radius section (collapsed by default).
    await app.inspector.getByRole('button', { name: 'Toggle Border Radius' }).click();
    await expect(
      app.inspector.getByRole('spinbutton', { name: 'radius', exact: true }),
    ).toBeVisible();

    // Toggle to per-corner → four corner inputs appear; the single radius is gone.
    await app.inspector.getByRole('button', { name: 'Use per-corner border radius' }).click();
    await expect(app.inspector.getByRole('spinbutton', { name: 'top left radius' })).toBeVisible();
    await expect(
      app.inspector.getByRole('spinbutton', { name: 'bottom right radius' }),
    ).toBeVisible();
    await expect(
      app.inspector.getByRole('spinbutton', { name: 'radius', exact: true }),
    ).toHaveCount(0);

    // Set the top-left corner → the preview text element gets a rounded corner.
    const tl = app.inspector.getByRole('spinbutton', { name: 'top left radius' });
    await tl.fill('24');
    await tl.press('Enter');
    await expect.poll(() => app.canvasElementsWithRoundedCorner()).toBeGreaterThan(0);

    // Toggle back to uniform → the four corner inputs collapse to one.
    await app.inspector.getByRole('button', { name: 'Use a single border radius' }).click();
    await expect(
      app.inspector.getByRole('spinbutton', { name: 'radius', exact: true }),
    ).toBeVisible();
    await expect(app.inspector.getByRole('spinbutton', { name: 'top left radius' })).toHaveCount(0);
  });

  test('a static stroke set on a text element renders a border in the preview', async ({ app }) => {
    await app.newProject('D042Stroke');
    await app.addTextElement({ x: 220, y: 160 });

    // The Path Style (stroke) section is now present on text (D-042).
    await app.inspector.getByRole('button', { name: 'Toggle Path Style' }).click();
    const width = app.inspector.getByRole('spinbutton', { name: 'stroke width' });
    await expect(width).toBeVisible();
    await width.fill('4');
    await width.press('Enter');

    await expect.poll(() => app.canvasElementsWithBorder()).toBeGreaterThan(0);
  });
});
