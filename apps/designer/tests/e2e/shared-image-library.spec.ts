import { test, expect } from './fixtures/designer.js';

/**
 * D-040 — shared image library + logo element. Maps the OpenSpec scenarios:
 *  - add / list / remove a library image
 *  - Image loader is not exposed as a redundant canvas tool
 *  - the inspector visual picker lists the library and re-points a normal Image
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
    await expect(app.sharedLibraryGrid.getByText('No shared assets yet.')).toBeVisible();
  });

  test('Image loader is hidden and project images use the Project Assets route', async ({
    app,
  }) => {
    await app.newProject('Project image');
    await expect.poll(() => app.canvasImageCount()).toBe(0);
    await expect(
      app.page.getByRole('toolbar', { name: 'Canvas tools' }).getByRole('button', {
        name: 'Image loader',
      }),
    ).toHaveCount(0);
    await app.placeProjectImage('emblem.png', { x: 240, y: 200 });
    await expect.poll(() => app.canvasImageCount()).toBe(1);
  });

  test('the inspector visual picker lists the library and re-points the selection', async ({
    app,
  }) => {
    await app.newProject('Repoint');
    await app.addSharedImage('logo-a.png');
    await app.addSharedImage('logo-b.png');
    await app.placeProjectImage('original.png', { x: 240, y: 200 });

    const picker = app.inspector.getByRole('button', { name: 'picture source' });
    await expect(picker).toContainText('original');
    await picker.click();
    const dialog = app.page.getByRole('dialog', { name: 'Choose picture for picture source' });
    await expect(dialog.getByRole('button', { name: /logo-a/ })).toBeVisible();
    await dialog.getByRole('button', { name: /logo-b/ }).click();
    await expect(picker).toContainText('logo-b');
  });
});
