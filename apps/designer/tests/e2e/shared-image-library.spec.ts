import { test, expect } from './fixtures/designer.js';

/**
 * D-040 — shared image library + logo element. Maps the OpenSpec scenarios:
 *  - add / list / remove a library image
 *  - the logo tool inserts a selected library image; empty library ⇒ a hint, no insert
 *  - the inspector combo lists the library and re-points the selection
 */

test.describe('D-040 — shared image library', () => {
  test('adds an image to the library, then removes it', async ({ app }) => {
    await app.newProject('Library');
    await app.addSharedImage('channel-logo.png');

    // Listed with a thumbnail.
    const thumb = app.sharedLibraryGrid.getByRole('button', { name: /channel-logo/ });
    await expect(thumb).toBeVisible();

    // Remove via the context menu → confirm.
    await thumb.click({ button: 'right' });
    await app.page.getByRole('menuitem', { name: 'Remove from library' }).click();
    await app.page.getByRole('dialog').getByRole('button', { name: 'Remove' }).click();

    await expect(thumb).toHaveCount(0);
    await expect(app.sharedLibraryGrid.getByText('No library images yet.')).toBeVisible();
  });

  test('the logo tool stamps the selected library image onto the canvas', async ({ app }) => {
    await app.newProject('Logo');
    await expect.poll(() => app.canvasImageCount()).toBe(0);

    await app.addSharedImage('emblem.png');
    await app.selectSharedImage('emblem');

    await app.placeLogo({ x: 240, y: 200 });

    // A `source: 'shared'` image element now renders in the canvas preview.
    await expect.poll(() => app.canvasImageCount()).toBe(1);
  });

  test('empty-library guard: the logo tool surfaces a hint and inserts nothing', async ({
    app,
  }) => {
    await app.newProject('Guard');
    await expect.poll(() => app.canvasImageCount()).toBe(0);

    await app.placeLogo({ x: 240, y: 200 });

    // A notice appears and no element was inserted (D-030-style guard).
    await expect(app.page.getByRole('status')).toContainText(/Shared Library/i);
    await expect.poll(() => app.canvasImageCount()).toBe(0);
  });

  test('the inspector combo lists the library and re-points the selection', async ({ app }) => {
    await app.newProject('Repoint');
    await app.addSharedImage('logo-a.png');
    await app.addSharedImage('logo-b.png');

    // Stamp logo-a, which selects the element → its inspector is shown.
    await app.selectSharedImage('logo-a');
    await app.placeLogo({ x: 240, y: 200 });

    const combo = app.inspector.getByRole('combobox', { name: 'library image' });
    await expect(combo).toBeVisible();
    // Lists both library images (+ the placeholder option).
    await expect(combo.getByRole('option')).toHaveCount(3);

    // Re-point to logo-b → the combo (driven by the element's assetId) reflects it.
    const bValue = await combo.locator('option', { hasText: 'logo-b' }).getAttribute('value');
    await combo.selectOption({ label: 'logo-b' });
    await expect(combo).toHaveValue(bValue ?? '');
  });
});
