import { test, expect } from './fixtures/designer.js';

/**
 * D-087 — the Preview modal opens loaded-but-unpainted (blank), like CasparCG
 * after CG ADD and before CG PLAY: the composition is built but the runtime stays
 * in its native `cg-pending` state with nothing on the stage. Play reveals + runs
 * the lifecycle (paint); Stop runs the outro and settles the stage blank again.
 * The editor canvas (which shares the same preview harness) is unaffected — its
 * own static-frame rendering is exercised across the ticker/clock/sequence specs.
 */
test.describe('Preview blank until Play (D-087)', () => {
  test('Reset immediately ends playing, paused and closing rehearsals and restores default data', async ({
    app,
  }) => {
    await app.page.getByTestId('starter-card').filter({ hasText: 'عنوان معرفی' }).click();
    await app.expectStudio();
    await app.openPreviewModal();
    const dialog = app.previewDialog;
    const reset = dialog.getByRole('button', { name: 'Reset', exact: true });
    const name = dialog.getByRole('textbox', { name: 'Name (نام)', exact: true });
    const elapsed = dialog.getByLabel('Elapsed preview time');
    const frame = dialog.getByLabel('Preview frame');
    for (const state of ['playing', 'paused', 'closing']) {
      await app.setPreviewField('Name (نام)', `آزمایش ${state}`);
      await app.play();
      await expect(app.previewElement('tt-name')).toHaveText(`آزمایش ${state}`);
      await expect(app.previewElement('tt-name')).toHaveCSS('opacity', '1');
      const oldName = await app.previewElement('tt-name').elementHandle();
      expect(oldName).not.toBeNull();
      if (state === 'paused') await app.pause();
      if (state === 'closing') await app.stop();
      await reset.click();
      // Hard Reset replaces the actual runtime, unlike Stop's authored outro. An old
      // detached element cannot keep painting or later settle the replacement transport.
      await expect.poll(() => oldName!.evaluate((element) => element.isConnected)).toBe(false);
      await expect(app.previewFrame.locator('body')).toHaveClass(/cg-pending/);
      await expect(name).toHaveValue('دکتر مریم احمدی');
      await expect(app.previewElement('tt-name')).toHaveText('دکتر مریم احمدی');
      await expect(elapsed).toContainText('00:00:00');
      await expect(frame).toContainText('000 / 128');
      await expect(dialog.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
      await expect(app.previewElement('tt-name')).toBeHidden();
      await app.play();
      await expect(app.previewElement('tt-name')).toHaveCSS('opacity', '1');
      await expect(app.previewElement('tt-name')).toHaveText('دکتر مریم احمدی');
      await reset.click();
      await expect(app.previewFrame.locator('body')).toHaveClass(/cg-pending/);
    }
  });

  test('the modal opens unpainted; Play paints the stage; Stop re-blanks', async ({ app }) => {
    await app.newProject('BlankUntilPlay');
    await app.addTextElement({ x: 240, y: 140 });
    await app.setDataKey('headline');

    // Open: loaded but unpainted — the runtime is in its pre-play `cg-pending`
    // state and no graphic is painted on the stage.
    await app.openPreviewModal();
    await expect(app.previewFrame.locator('body')).toHaveClass(/cg-pending/);
    await expect(app.previewFrame.getByText('New text')).toBeHidden();

    // Play reveals the stage and runs the lifecycle — the graphic paints.
    await app.play();
    await expect(app.previewFrame.locator('body')).not.toHaveClass(/cg-pending/);
    await expect(app.previewFrame.getByText('New text')).toBeVisible();

    // Stop runs the outro and the stage settles blank again.
    await app.stop();
    await expect(app.previewFrame.locator('body')).toHaveClass(/cg-pending/, { timeout: 10_000 });
    await expect(app.previewFrame.getByText('New text')).toBeHidden();
  });
});
