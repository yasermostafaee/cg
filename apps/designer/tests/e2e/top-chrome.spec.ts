import { test, expect } from './fixtures/designer.js';

/**
 * D-086 Phase B — top-chrome relocation. The global bar keeps the project-wide
 * menus + a centered project name + Save; Preview / Export (.vcg + HTML) move to the
 * per-composition action bar pinned at the foot of the left rail (off the canvas;
 * the export engine is already per-composition from Phase A).
 */
test.describe('D-086 Phase B — top-chrome relocation', () => {
  test('global bar shows the project name + Save and no Preview / Export / HTML', async ({
    app,
  }) => {
    await app.newProject('Chrome E2E');
    const nav = app.page.getByRole('navigation', { name: 'Application menu' });

    // Centered project name + Save remain on the global bar.
    await expect(nav.getByTestId('project-name')).toBeVisible();
    await expect(nav.getByTestId('project-name')).toContainText('Chrome E2E');
    await expect(nav.getByRole('button', { name: 'SAVE', exact: true })).toBeVisible();

    // The relocated actions are gone from the global bar.
    await expect(nav.getByRole('button', { name: 'PREVIEW', exact: true })).toHaveCount(0);
    await expect(nav.getByRole('button', { name: 'EXPORT', exact: true })).toHaveCount(0);
    await expect(nav.getByRole('button', { name: 'HTML', exact: true })).toHaveCount(0);

    // The File menu no longer offers an Export… item.
    await nav.getByRole('button', { name: 'File' }).click();
    const menu = app.page.getByRole('menu');
    await expect(menu).toBeVisible();
    await expect(menu.getByText('Export…')).toHaveCount(0);
  });

  test('per-composition bar renders in the left rail and exports the active comp', async ({
    app,
  }) => {
    await app.newProject('Bar E2E');
    const bar = app.compositionActionBar;
    await expect(bar).toBeVisible();
    await expect(bar.getByRole('button', { name: 'Preview', exact: true })).toBeVisible();
    await expect(bar.getByRole('button', { name: 'Export .vcg', exact: true })).toBeVisible();
    await expect(bar.getByRole('button', { name: 'Export HTML', exact: true })).toBeVisible();

    // Exporting from the per-composition bar produces the active composition's output.
    const { html } = await app.exportHtml();
    expect(html).toContain('createRuntime');
  });
});
