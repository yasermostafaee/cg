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
