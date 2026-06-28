import { test, expect } from './fixtures/designer.js';

/**
 * D-113 — `auto-out` and `loop-cycle` both require an out-point (an exit segment to start the
 * animated outro from). Clearing the out-point while in one of those modes leaves an impossible
 * state, so the clear atomically reverts the mode to `manual` (one undo step — covered by
 * tests/store-lifecycle.test.ts). The revert is one-directional: re-adding an out-point does NOT
 * restore the prior mode.
 */
test.describe('D-113 — clearing the out-point reverts an out-point-dependent mode to manual', () => {
  test('clear in auto-out → mode shows manual; re-adding an out-point does not restore it', async ({
    app,
  }) => {
    await app.newProject('OutPointRevert');
    await app.addRectangle({ x: 240, y: 130 });
    await app.setPlayoutTiming('auto-out'); // selecting auto-out seeds an out-point + sets the mode
    const mode = app.page.getByRole('combobox', { name: 'Playout mode' });
    await expect(mode).toHaveValue('auto-out');

    // Clear the out-point → the mode reverts to manual (atomic, in the same store action).
    await app.page.getByRole('button', { name: 'Clear' }).click();
    await expect(mode).toHaveValue('manual');

    // Re-adding an out-point does NOT auto-restore auto-out (the invariant is one-directional).
    await app.page.getByRole('button', { name: 'Add an out point' }).click();
    await expect(mode).toHaveValue('manual');
  });

  test('clear in loop-cycle → mode shows manual', async ({ app }) => {
    await app.newProject('OutPointRevertLoop');
    await app.addRectangle({ x: 240, y: 130 });
    await app.setPlayoutTiming('loop-cycle');
    const mode = app.page.getByRole('combobox', { name: 'Playout mode' });
    await expect(mode).toHaveValue('loop-cycle');

    await app.page.getByRole('button', { name: 'Clear' }).click();
    await expect(mode).toHaveValue('manual');
  });
});
