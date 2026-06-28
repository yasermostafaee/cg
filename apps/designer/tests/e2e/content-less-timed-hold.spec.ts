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
    await expect(repeat).toHaveValue('2'); // the repeat override applied (2 finite cycles)
    const hold = app.previewDialog.getByLabel('Preview hold duration in milliseconds', {
      exact: true,
    });
    await hold.fill('3000');
    await hold.blur();

    await app.play();

    // Content-less ⇒ intro/outro are ~instant, so cycle 1's hold ≈ [0,3s] and the
    // BETWEEN-CYCLE (cycle 2) hold ≈ [3s,6s]. At 4.5s it must still be on air — i.e. the
    // loop-back path honored cycle 2's holdMs; if it collapsed to ~0 the two cycles would
    // have settled by ~3s.
    await app.page.waitForTimeout(4500);
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

test.describe('B-032 — the inspector persists a stored holdMs (so the export holds)', () => {
  test('a content-less timed auto-out / loop-cycle gets a hold-ms control that persists', async ({
    app,
  }) => {
    await app.newProject('StoredHold');
    await app.addRectangle({ x: 240, y: 130 });
    await app.addOutPoint();
    await app.setPlayoutTiming('auto-out'); // content-less timed auto-out

    // The authorable hold-ms control appears and writes the STORED playout.holdMs.
    const holdMs = app.page.getByRole('spinbutton', { name: 'Hold duration in milliseconds' });
    await expect(holdMs).toBeVisible();
    await holdMs.fill('5000');
    await holdMs.blur();
    await expect(holdMs).toHaveValue('5000'); // reflects the stored value

    // It persists across a mode round-trip (still timed under loop-cycle) — i.e. it is stored
    // on the composition, not a transient field, so the single-file export bakes it.
    await app.setPlayoutTiming('loop-cycle');
    await expect(
      app.page.getByRole('spinbutton', { name: 'Hold duration in milliseconds' }),
    ).toHaveValue('5000');

    // Manual has no timed hold ⇒ the control is gone.
    await app.setPlayoutTiming('manual');
    await expect(
      app.page.getByRole('spinbutton', { name: 'Hold duration in milliseconds' }),
    ).toHaveCount(0);
  });
});

test.describe('B-032 ext — a content-LESS comp left content-driven resolves to timed (no trap)', () => {
  test('deleting the only content leaves a content-driven hold that resolves to timed → holdMs control appears', async ({
    app,
  }) => {
    await app.newProject('TrappedHold');
    await app.addRectangle({ x: 300, y: 120 });
    // A ticker so content-driven is selectable; then we delete it to recreate the trapped scene
    // (stored content-driven, but no content) the bug report describes.
    await app.addTicker({ x: 120, y: 240 });
    await app.addOutPoint();
    await app.setPlayoutTiming('auto-out');
    await app.setHoldSource('content-driven');

    // Delete the ticker → the comp is now CONTENT-LESS but still stored content-driven.
    // Click clearly INSIDE the ticker's box (placed at 120,240) to select it, then Delete.
    await app.selectTool('Select');
    await app.canvas.click({ position: { x: 150, y: 252 } });
    await app.page.keyboard.press('Delete');

    // The content-driven hold with no drivers resolves to TIMED at the boundary, so the holdMs
    // control appears (the operator is NOT trapped) and the runtime/export honor the duration.
    await expect(
      app.page.getByRole('spinbutton', { name: 'Hold duration in milliseconds' }),
    ).toBeVisible();
  });
});
