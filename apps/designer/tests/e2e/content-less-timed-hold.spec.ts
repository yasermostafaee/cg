import { test, expect } from './fixtures/designer.js';

/**
 * B-032 investigation — a CONTENT-LESS composition with a TIMED hold (`holdMs`) holds
 * for `holdMs` before its outro, in the live preview, for BOTH `auto-out` and the
 * `loop-cycle` between-cycle hold. The runtime + override threading are proven by
 * packages/template-runtime/tests/content-less-timed-hold.test.ts; these guard the
 * preview UI path. Plus the out-point gate: without an explicit out-point marker the
 * preview correctly disables auto-out / loop-cycle AND hides the holdMs input (so a
 * value is never "set" into a mode that can't run — no UX trap).
 */
test.describe('B-032 — content-less timed hold honors holdMs (preview)', () => {
  test('loop-cycle: the between-cycle hold honors holdMs (does not cycle to ~0)', async ({
    app,
  }) => {
    await app.newProject('LoopHold');
    await app.addRectangle({ x: 240, y: 130 });
    await app.setSceneDuration(30); // short scene ⇒ brief intro/outro, observable hold
    await app.addOutPoint();
    await app.openPreviewModal();

    await app.previewDialog
      .getByRole('combobox', { name: 'Preview playout mode' })
      .selectOption('loop-cycle');
    const repeat = app.previewDialog.getByLabel('Preview repeat count', { exact: true });
    await repeat.fill('2');
    await repeat.blur();
    const hold = app.previewDialog.getByLabel('Preview hold duration in milliseconds', {
      exact: true,
    });
    await hold.fill('4000');
    await hold.blur();

    await app.play();

    // Cycle 1's 4s hold keeps it on air at 2.5s. If the loop-cycle hold collapsed to ~0
    // it would already be cycling/settled by then. (The multi-cycle / loop-back hold is
    // covered deterministically by the @cg/template-runtime test, repeat=2.)
    await app.page.waitForTimeout(2500);
    await expect(app.previewFrame.locator('body.cg-pending')).toHaveCount(0);
  });

  test('no explicit out-point: the preview disables auto-out/loop-cycle and hides the holdMs input', async ({
    app,
  }) => {
    await app.newProject('NoOutPoint');
    await app.addRectangle({ x: 240, y: 130 });
    // Deliberately NO out-point added.
    await app.openPreviewModal();

    // auto-out / loop-cycle need an out-point — they are disabled in the mode select, so the
    // operator cannot select them (and thus cannot "set" a holdMs that would never run).
    const mode = app.previewDialog.getByRole('combobox', { name: 'Preview playout mode' });
    await expect(mode.getByRole('option', { name: /Auto-out/ })).toBeDisabled();
    await expect(mode.getByRole('option', { name: /Loop cycle/ })).toBeDisabled();
    // The timed holdMs input is not shown without an out-point.
    await expect(
      app.previewDialog.getByLabel('Preview hold duration in milliseconds', { exact: true }),
    ).toHaveCount(0);
  });
});
