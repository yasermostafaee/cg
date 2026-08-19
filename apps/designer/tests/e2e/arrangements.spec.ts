import type { FrameLocator } from '@playwright/test';
import { expect, test } from './fixtures/designer.js';

/**
 * ⭐ **`multibox-layout-switch` C2 — the ARRANGEMENT authoring surface, walked end to end.**
 *
 * This is the first visually checkable thing in the whole feature, and this spec IS its
 * acceptance: it authors two arrangements, switches between them, and asserts that the
 * PREVIEW IFRAME's rendered geometry actually moves.
 *
 * 🔴 **The last assertion is the one that matters.** A selector that changes the authored
 * state but not the canvas is the written-but-unreachable class this repo has paid for
 * three times — `autoSqueeze` (`B-147`), `resolvePlateAspect`'s `assumed` flag (`B-143`),
 * and `liveLayers()` (`B-145`). Asserting the store, or the option list, would reproduce
 * exactly that mistake: all three of those defects would have passed a test written against
 * the thing that WRITES rather than the thing that READS. So the check reads the box's real
 * rendered rect out of the iframe.
 */

/** Where a box instance actually sits, read from the preview iframe's own layout. */
async function boxRect(
  frame: FrameLocator,
  index: number,
): Promise<{ x: number; y: number; width: number; height: number }> {
  const node = frame.locator('.cg-stage .cg-layer > [data-cg-element-id]').nth(index);
  const box = await node.boundingBox();
  if (box === null) throw new Error(`box instance ${String(index)} has no layout`);
  return box;
}

test.describe('C2 — authoring arrangements', () => {
  test('🔴 switching the toolbar selector visibly MOVES the boxes on the canvas', async ({
    app,
  }) => {
    await app.goto();
    await app.newProject('Arrangements');

    // ── a BOX composition: a plate plus its title, exactly the A′ model ──────
    await app.newComposition('Box');
    await app.addLiveSource({ x: 200, y: 160 });
    await app.setLiveSourceId('guest-1');
    await app.addTextElement({ x: 200, y: 240 });

    // ── the MAIN composition ────────────────────────────────────────────────
    await app.newComposition('Main');
    await app.openComposition('Main');

    // Author the arrangements FIRST, while nothing is selected: the right panel shows
    // COMPOSITION properties only then, which is precisely why the SELECTOR lives in the
    // canvas toolbar instead of here.
    await app.page.getByRole('button', { name: 'Arrangements' }).click();
    await app.page.getByTitle('Add a 2-box arrangement').click();
    await app.page.getByTitle('Add a 1-box arrangement').click();

    // ── then two instances of the box ───────────────────────────────────────
    await app.nestCompositionInstance('Box');
    await app.nestCompositionInstance('Box');

    const picker = app.page.getByLabel('Active arrangement');
    await expect(picker).toBeVisible();
    // 🔴 The count in each label is computed from `cells.length` at render — there is no
    // count field anywhere, so these labels cannot drift from the geometry they describe.
    await expect(picker).toContainText('2-box');
    await expect(picker).toContainText('1-box');

    // ── the acceptance: the canvas must MOVE ────────────────────────────────
    // By index: 0 is "As authored", 1 is the 2-box, 2 is the 1-box (authored in that order).
    await picker.selectOption({ index: 1 });
    await expect(picker).toHaveValue(/.+/);
    const twoBox = await boxRect(app.canvasFrame, 0);

    await picker.selectOption({ index: 2 });
    const oneBox = await boxRect(app.canvasFrame, 0);

    // A 1-box arrangement gives its single cell the whole frame; a 2-box arrangement
    // gives each box half of it. The first box must therefore be WIDER in 1-box.
    expect(
      oneBox.width,
      'the selector changed the authored state but not the canvas — the wiring is dead',
    ).toBeGreaterThan(twoBox.width);
  });

  test('the picker is absent until the composition has an arrangement', async ({ app }) => {
    // The negative control for the test above: the picker being VISIBLE has to mean
    // something, so it must not simply always be there.
    await app.goto();
    await app.newProject('NoArrangements');
    await app.newComposition('Main');
    await app.openComposition('Main');
    await expect(app.page.getByLabel('Active arrangement')).toHaveCount(0);
  });

  test('a new arrangement is the default for its count, and only for its count', async ({
    app,
  }) => {
    await app.goto();
    await app.newProject('Defaults');
    await app.newComposition('Main');
    await app.openComposition('Main');
    await app.deselect();

    await app.page.getByRole('button', { name: 'Arrangements' }).click();
    await app.page.getByTitle('Add a 2-box arrangement').click();
    await app.page.getByTitle('Add a 3-box arrangement').click();

    // Exactly one default PER COUNT is a schema invariant, and both failure directions are
    // silent on air: with none, deriving that count activates nothing; with two, which one
    // goes up depends on array order.
    await expect(
      app.page.getByTitle('The default for the 2-box count'),
      'the 2-box count lost its default when the 3-box arrangement was added',
    ).toHaveCount(1);
    await expect(app.page.getByTitle('The default for the 3-box count')).toHaveCount(1);
  });
});
