import { test, expect } from './fixtures/designer.js';

/**
 * Bug fix — the layer/element hide flag (`visible = false`) was IGNORED for clock and
 * sequence: their builders set `display: none` (via applyBaseStyles) then clobbered it with
 * `display: flex` (clock) / `display: grid` (sequence). A hidden clock/sequence must end up
 * `display: none` on the canvas (and preview/export); unhiding restores the flex/grid display.
 */
test.describe('Clock / sequence respect the visible flag (hide no longer clobbered)', () => {
  test('hiding a clock and a sequence layer removes them from the canvas; unhiding restores them', async ({
    app,
  }) => {
    await app.newProject('HideClockSeq');
    await app.addClock({ x: 200, y: 120 });
    const clockId = (await app.timelineRowIds())[0]!;
    await app.addSequence({ x: 200, y: 200 });
    const seqId = (await app.timelineRowIds()).find((id) => id !== clockId)!;

    const clock = app.canvasFrame.locator(`[data-cg-element-id="${clockId}"]`);
    const seq = app.canvasFrame.locator(`[data-cg-element-id="${seqId}"]`);

    // Visible — the time-driven flex / grid display.
    await expect(clock).toHaveCSS('display', 'flex');
    await expect(seq).toHaveCSS('display', 'grid');

    // Hide both → display:none (regression: the flex/grid display used to clobber the hide).
    await app.toggleElementVisibility(clockId);
    await app.toggleElementVisibility(seqId);
    await expect(clock).toHaveCSS('display', 'none');
    await expect(seq).toHaveCSS('display', 'none');

    // Unhide → the flex / grid display is restored.
    await app.toggleElementVisibility(clockId);
    await app.toggleElementVisibility(seqId);
    await expect(clock).toHaveCSS('display', 'flex');
    await expect(seq).toHaveCSS('display', 'grid');
  });
});
