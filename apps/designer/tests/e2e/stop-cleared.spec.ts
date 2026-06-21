import { test, expect } from './fixtures/designer.js';

/**
 * D-085 — Stop = CLEARED terminal. On Stop the composition settles into a cleared
 * state: the stage is hidden and content-driven elements (which carry no
 * opacity-out keyframes) go away with it — they do NOT linger frozen on the last
 * frame. Re-play restarts cleanly.
 *
 * These are the REAL-BROWSER visibility proofs (observable through the D-087
 * broadcast preview). The per-driver-kind halting (ticker / clock / sequence /
 * repeater scheduling no further frame, nodes staying mounted, deferred-until-
 * outro timing) is pinned deterministically in
 * `@cg/template-runtime` `tests/stop-cleared.test.ts`. A clock stands in here as
 * the content-driven element because its visibility is the most stable to assert.
 */
test.describe('Stop = CLEARED (D-085)', () => {
  test('a content-driven element is cleared on Stop and re-appears on re-play', async ({ app }) => {
    await app.newProject('StopCleared');
    await app.addClock();

    await app.openPreviewModal();
    const clockTime = app.previewFrame.locator('[data-cg-clock-time]');

    // D-087 — blank until Play; Play reveals + the clock ticks.
    await app.play();
    await expect(app.previewFrame.locator('body')).not.toHaveClass(/cg-pending/);
    await expect(clockTime).toBeVisible();

    // D-085 — Stop CLEARS the composition: the stage hides and the ticking
    // content goes away (no per-element opacity-out authored).
    await app.stop();
    await expect(app.previewFrame.locator('body')).toHaveClass(/cg-pending/, { timeout: 10_000 });
    await expect(clockTime).toBeHidden();

    // Re-play restarts cleanly — revealed and ticking again.
    await app.play();
    await expect(app.previewFrame.locator('body')).not.toHaveClass(/cg-pending/);
    await expect(clockTime).toBeVisible();
  });

  test('a nested child content element is GONE after the PARENT Stop', async ({ app }) => {
    // comp1 carries the content-driven clock; Parent nests comp1.
    await app.newProject('NestedClear');
    await app.addClock();
    await app.newComposition('Parent');
    await app.nestCompositionInstance('comp1');

    await app.openPreviewModal();
    const nestedClock = app.previewFrame.locator('[data-cg-clock-time]');

    // Parent Play cascades into the nested child (it renders + ticks).
    await app.play();
    await expect(nestedClock).toBeVisible();

    // Parent Stop clears the whole composition — the nested child goes too.
    await app.stop();
    await expect(app.previewFrame.locator('body')).toHaveClass(/cg-pending/, { timeout: 10_000 });
    await expect(nestedClock).toBeHidden();
  });
});
