import { test, expect } from './fixtures/designer.js';

/**
 * D-114 (revises D-113) — `auto-out` and `loop-cycle` both require an out-point. A composition with
 * no out-point is `static` (play in → hold → cut on stop, no animated exit). So clearing the out-point
 * while in an out-point-dependent mode atomically reverts the mode to `static` (one undo step — covered
 * by tests/store-lifecycle.test.ts). The revert is one-directional: re-adding an out-point does NOT
 * restore the prior mode — it lands on `manual` (the benign default for an out-point composition).
 */
test.describe('D-114 — clearing the out-point reverts an out-point-dependent mode to static', () => {
  test('clear in auto-out → mode shows static; re-adding an out-point lands on manual (not auto-out)', async ({
    app,
  }) => {
    await app.newProject('OutPointRevert');
    await app.addRectangle({ x: 240, y: 130 });
    await app.setPlayoutTiming('auto-out'); // selecting auto-out seeds an out-point + sets the mode
    const mode = app.page.getByRole('combobox', { name: 'Playout mode' });
    await expect(mode).toHaveValue('auto-out');

    // Clear the out-point → the mode reverts to static (atomic, in the same store action).
    await app.page.getByRole('button', { name: 'Clear' }).click();
    await expect(mode).toHaveValue('static');

    // Re-adding an out-point does NOT auto-restore auto-out (one-directional) — it lands on manual.
    await app.page.getByRole('button', { name: 'Add an out point' }).click();
    await expect(mode).toHaveValue('manual');
  });

  test('clear in loop-cycle → mode shows static', async ({ app }) => {
    await app.newProject('OutPointRevertLoop');
    await app.addRectangle({ x: 240, y: 130 });
    await app.setPlayoutTiming('loop-cycle');
    const mode = app.page.getByRole('combobox', { name: 'Playout mode' });
    await expect(mode).toHaveValue('loop-cycle');

    await app.page.getByRole('button', { name: 'Clear' }).click();
    await expect(mode).toHaveValue('static');
  });
});
