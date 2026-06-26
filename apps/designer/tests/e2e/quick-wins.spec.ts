import { test, expect } from './fixtures/designer.js';

/**
 * Quick-wins batch — the integrated UI paths for a few items whose logic is also
 * unit-tested: B-024 (non-negative size/scale), D-100 (menubar hover-to-switch),
 * D-099 (minimum-window-size gate).
 */
test.describe('Quick-wins batch', () => {
  test('B-024 — width / scale reject negative values (clamped to >= 0)', async ({ app }) => {
    await app.newProject('QW-B024');
    await app.addRectangle({ x: 220, y: 160 }); // auto-selected → transform inspector shown

    const width = app.inspector.getByRole('spinbutton', { name: 'Width', exact: true });
    await width.fill('-100');
    await width.press('Enter');
    expect(Number(await width.inputValue())).toBeGreaterThanOrEqual(0);

    const scaleX = app.inspector.getByRole('spinbutton', { name: 'Scale X', exact: true });
    await scaleX.fill('-50');
    await scaleX.press('Enter');
    expect(Number(await scaleX.inputValue())).toBeGreaterThanOrEqual(0);
  });

  test('D-100 — once a menu is open, hovering another top-menu button opens it (no click)', async ({
    app,
  }) => {
    await app.newProject('QW-D100');
    await app.page.getByRole('button', { name: 'File', exact: true }).click();
    await expect(app.page.getByRole('menuitem', { name: 'New' })).toBeVisible();

    // Hover Edit — it opens and File closes, without a click.
    await app.page.getByRole('button', { name: 'Edit', exact: true }).hover();
    await expect(app.page.getByRole('menuitem', { name: /Undo/ })).toBeVisible();
    await expect(app.page.getByRole('menuitem', { name: 'New' })).toHaveCount(0);
  });

  test('D-099 — below the minimum size the editor is replaced by a message; it restores above', async ({
    app,
  }) => {
    await app.newProject('QW-D099');
    await expect(app.canvas).toBeVisible();

    await app.page.setViewportSize({ width: 800, height: 600 });
    await expect(app.page.getByTestId('screen-too-small')).toBeVisible();
    await expect(app.canvas).toHaveCount(0);

    await app.page.setViewportSize({ width: 1280, height: 800 });
    await expect(app.canvas).toBeVisible();
    await expect(app.page.getByTestId('screen-too-small')).toHaveCount(0);
  });
});
