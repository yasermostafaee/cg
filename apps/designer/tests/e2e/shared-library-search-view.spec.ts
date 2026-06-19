import { test, expect } from './fixtures/designer.js';

/**
 * D-068 — Shared Library search + grid/list view toggle (parity with Project
 * Assets). Maps the OpenSpec scenarios: search filters by filename; the toggle
 * switches grid↔list and persists across a panel re-mount.
 */

test.describe('D-068 — Shared Library search + view toggle', () => {
  test('search filters the library by filename (case-insensitive); empty shows all', async ({
    app,
  }) => {
    await app.newProject('Search');
    await app.addSharedImage('channel-logo.png');
    await app.addSharedImage('lower-bug.png');

    const grid = app.sharedLibraryGrid;
    await expect(grid.getByRole('button', { name: /channel-logo/ })).toBeVisible();
    await expect(grid.getByRole('button', { name: /lower-bug/ })).toBeVisible();

    const search = app.page.getByRole('searchbox', { name: 'Search library images' });
    await search.fill('LOGO'); // case-insensitive
    await expect(grid.getByRole('button', { name: /channel-logo/ })).toBeVisible();
    await expect(grid.getByRole('button', { name: /lower-bug/ })).toHaveCount(0);

    await search.fill(''); // empty query → all
    await expect(grid.getByRole('button', { name: /lower-bug/ })).toBeVisible();
  });

  test('the view toggle switches grid↔list and persists across a panel re-mount', async ({
    app,
  }) => {
    await app.newProject('View');
    await app.addSharedImage('logo.png');

    const grid = app.sharedLibraryGrid;
    // Default grid: rows carry no type/size meta (that's list-only).
    await expect(grid.getByText('png', { exact: true })).toHaveCount(0);

    await app.page.getByRole('button', { name: 'Switch to list view' }).click();
    // List layout renders the per-row file type.
    await expect(grid.getByText('png', { exact: true }).first()).toBeVisible();

    // Persists across a re-mount (switch the left panel away and back).
    await app.showCompositions();
    await app.showSharedLibrary();
    await expect(app.page.getByRole('button', { name: 'Switch to grid view' })).toBeVisible();

    const stored = await app.page.evaluate(() =>
      localStorage.getItem('cg.designer.sharedLibraryView'),
    );
    expect(stored).toBe('list');
  });
});
