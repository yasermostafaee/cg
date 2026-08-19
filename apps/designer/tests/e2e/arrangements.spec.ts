import type { FrameLocator } from '@playwright/test';
import { expect, test, type DesignerApp } from './fixtures/designer.js';

// ⚠ A′'s arrangement surface is DISABLED, not deleted (owner, 2026-08-19; LOOKS §14):
// this spec drives UI that is deliberately unreachable, so every case is SKIPPED — not
// to go green, but because its subject was retired. The spec is DELETED with the A′
// code by `tasks.md` §1b P2.DEL; until then it documents what the surface did.
test.beforeEach(() => {
  test.skip(true, 'A′ arrangements surface disabled (owner, 2026-08-19) — deleted with P2.DEL');
});

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
  const node = frame.locator('.cg-stage > .cg-layer > [data-cg-element-id]').nth(index);
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

/**
 * ⭐ **`D-153` — the surface has to TEACH the model, not just implement it.**
 *
 * 🔴 The third test here covers the `designer-multibox-arrangements` scenario _"The canvas
 * shows one arrangement at a time … not the union of all of them"_, **which had no test at
 * all** until now — it passed by describing behaviour nobody asserted. That is the same
 * shape session AV found one layer down, where eleven mask tests all asked where the hole
 * was and none asked where the box was, so it is written down rather than quietly fixed.
 */
test.describe('D-153 — the arrangement surface is legible', () => {
  test('🔴 the active arrangement CELLS are drawn on the canvas, labelled in order', async ({
    app,
  }) => {
    await app.goto();
    await app.newProject('Cells');
    await app.newComposition('Main');
    await app.openComposition('Main');

    await app.page.getByRole('button', { name: 'Arrangements' }).click();
    await app.page.getByTitle('Add a 2-box arrangement').click();

    // Drawn, and one per cell — the count comes from `cells.length`, as everywhere else.
    const cells = app.page.getByTestId('arrangement-cells').locator('> div');
    await expect(cells).toHaveCount(2);
    await expect(app.page.getByTestId('arrangement-cell-1')).toContainText('cell 1');
    await expect(app.page.getByTestId('arrangement-cell-2')).toContainText('cell 2');

    // With no box instances yet, each cell says so rather than looking authored-and-done.
    // This is the screen the owner was on when he asked what to do next.
    await expect(app.page.getByTestId('arrangement-cell-1')).toContainText('no box yet');
  });

  test('a cell NAMES the box instance it holds', async ({ app }) => {
    await app.goto();
    await app.newProject('Named');
    await app.newComposition('Box');
    await app.addLiveSource({ x: 200, y: 160 });
    await app.newComposition('Main');
    await app.openComposition('Main');

    await app.page.getByRole('button', { name: 'Arrangements' }).click();
    await app.page.getByTitle('Add a 2-box arrangement').click();
    await app.nestCompositionInstance('Box');

    // Cell 1 now holds the instance; cell 2 still has none. The binding is document order,
    // reported — never a per-cell assignment (§12.9.1 Q2).
    await expect(app.page.getByTestId('arrangement-cell-1')).not.toContainText('no box yet');
    await expect(app.page.getByTestId('arrangement-cell-2')).toContainText('no box yet');
  });

  test('🔴 the canvas shows ONE arrangement, not the union — a box with no cell is HIDDEN', async ({
    app,
  }) => {
    await app.goto();
    await app.newProject('OneAtATime');
    await app.newComposition('Box');
    await app.addLiveSource({ x: 200, y: 160 });
    await app.newComposition('Main');
    await app.openComposition('Main');

    await app.page.getByRole('button', { name: 'Arrangements' }).click();
    await app.page.getByTitle('Add a 2-box arrangement').click();
    await app.page.getByTitle('Add a 1-box arrangement').click();
    await app.nestCompositionInstance('Box');
    await app.nestCompositionInstance('Box');

    const picker = app.page.getByLabel('Active arrangement');
    const displays = async (): Promise<string[]> =>
      app.canvasFrame
        .locator('.cg-stage > .cg-layer > [data-cg-element-id]')
        .evaluateAll((ns) => ns.map((n) => (n as HTMLElement).style.display));

    // 2-box: both boxes have a cell, so both are on screen. The positive control — without
    // it, "the second one is hidden" below would also pass if NOTHING ever rendered.
    await picker.selectOption({ index: 1 });
    expect(await displays()).toEqual(['', '']);

    // 1-box: the second box has no cell. It must be HIDDEN, not left where it was authored
    // (which would make the canvas the union of both arrangements).
    await picker.selectOption({ index: 2 });
    expect(await displays()).toEqual(['', 'none']);

    // …and switching back RESTORES it. A one-way hide would strand the box off screen.
    await picker.selectOption({ index: 1 });
    expect(await displays()).toEqual(['', '']);
  });

  test('the panel says a box with no cell is HIDDEN, rather than leaving it to vanish', async ({
    app,
  }) => {
    await app.goto();
    await app.newProject('SaysHidden');
    await app.newComposition('Box');
    await app.addLiveSource({ x: 200, y: 160 });
    await app.newComposition('Main');
    await app.openComposition('Main');

    await app.page.getByRole('button', { name: 'Arrangements' }).click();
    await app.page.getByTitle('Add a 1-box arrangement').click();
    await app.nestCompositionInstance('Box');
    await app.nestCompositionInstance('Box');

    // §12.4's HELD state, said out loud — on the TIMELINE, which is visible whatever is
    // selected. The Arrangements panel says it too, but that panel is replaced by element
    // properties the moment the author selects something, which is exactly what adding a box
    // just did. An author who reads a vanished box as "broken" hunts a fault that is not there.
    await expect(
      app.page.locator('[title*="this arrangement has no cell for it"]').first(),
    ).toBeVisible();
  });

  test('the empty state points at the SHIPPED way to make a box', async ({ app }) => {
    await app.goto();
    await app.newProject('EmptyState');
    await app.newComposition('Main');
    await app.openComposition('Main');

    await app.page.getByRole('button', { name: 'Arrangements' }).click();
    await app.page.getByTitle('Add a 2-box arrangement').click();

    // The panel must name the operation that already exists — never offer a second one.
    await expect(app.page.getByText('This arrangement has no boxes to place.')).toBeVisible();
    await expect(app.page.getByText(/Add to composition/)).toBeVisible();
    await expect(app.page.getByText(/repeater/)).toBeVisible();

    // 🔴 The misunderstanding an author ARRIVES with — "switch to 3-box and import 3, then
    // switch to 2-box and import 2". Boxes are imported ONCE, as many as the largest
    // arrangement needs. It is not tidiness: per-arrangement instances would give each
    // arrangement its own plate identities, so the assigned source would not survive a switch.
    await expect(app.page.getByText(/not once per arrangement/)).toBeVisible();
  });

  test(
    String.raw`🔴 D4 flag is visible on an element INSIDE a box composition`,
    async ({ app }) => {
      // Found by eye in session AX. A box's TITLE lives inside the BOX composition while the
      // arrangements live on the composition that INSTANCES it, so scoping the section to the
      // ACTIVE document hid the flag on exactly the element D4 was written for. The section is
      // now shown when the PROJECT uses arrangements anywhere.
      await app.goto();
      await app.newProject('D4Flag');
      await app.newComposition('Box');
      await app.addLiveSource({ x: 200, y: 160 });
      await app.newComposition('Main');
      await app.openComposition('Main');
      await app.page.getByRole('button', { name: 'Arrangements' }).click();
      await app.page.getByTitle('Add a 2-box arrangement').click();

      // Back inside the BOX composition — which has no arrangements of its own.
      await app.openComposition('Box');
      await app.clickCanvas({ x: 200, y: 160 });
      await expect(
        app.page.getByRole('button', { name: 'Arrangement' }),
        'D4 flag missing on an element inside the box composition',
      ).toBeVisible();
    },
  );
});

/**
 * 🔴 **`D-154` — the gizmo edits the CELL, and is drawn where the element IS.**
 *
 * ⚠ **These tests ask WHERE THE GIZMO IS.** That is the axis every previous suite here
 * missed: AV's asked where the box was, AX's asked what the panel said, and the selection
 * rectangle sat in empty space through all of them. The owner found it by trying to drag it.
 */
test.describe('D-154 — a box is edited through its cell', () => {
  /** Author a Main with two box instances and a 2-box + 1-box arrangement. */
  async function twoBoxes(app: DesignerApp): Promise<void> {
    await app.goto();
    await app.newProject('D154');
    await app.newComposition('Box');
    await app.addLiveSource({ x: 200, y: 160 });
    await app.newComposition('Main');
    await app.openComposition('Main');
    await app.page.getByRole('button', { name: 'Arrangements' }).click();
    await app.page.getByTitle('Add a 2-box arrangement').click();
    await app.page.getByTitle('Add a 1-box arrangement').click();
    await app.nestCompositionInstance('Box');
    await app.nestCompositionInstance('Box');
    await app.page.getByLabel('Active arrangement').selectOption({ index: 1 });
  }

  test('🔴 the GIZMO rect equals the RENDERED rect for a box under an active arrangement', async ({
    app,
  }) => {
    await twoBoxes(app);
    await app.clickCanvas({ x: 120, y: 120 });

    const gizmo = await app.page.locator('[data-testid="gizmo-frame"]').boundingBox();
    const rendered = await app.canvasFrame
      .locator('.cg-stage > .cg-layer > [data-cg-element-id]')
      .first()
      .boundingBox();
    if (gizmo === null || rendered === null) throw new Error('no gizmo or no rendered box');

    // 🔴 CENTRES, exactly — that is the claim, and it is the one a tolerance cannot fudge.
    //
    // MEASURED: gizmo {x 387.72, y 101.30, w 236, h 265} against rendered
    // {x 389.72, y 103.30, w 232, h 261} — a UNIFORM 2 px outset on every side, which is the
    // selection outline being drawn just OUTSIDE the content edge rather than over it. The
    // centres are identical to the pixel (505.72, 233.80).
    //
    // The defect this catches is not subtle, and the magnitude was MEASURED rather than
    // guessed: reverting the one line in `Gizmo.tsx` and rebuilding put the width out by
    // **236 px** at this zoom (the gizmo drew the authored 1920-wide instance while the
    // element rendered the 960-wide cell), which moves the CENTRE by ~118 px. An assertion on
    // centres therefore fails hard on the old behaviour and exactly on the new one.
    const centre = (b: { x: number; y: number; width: number; height: number }) => ({
      x: b.x + b.width / 2,
      y: b.y + b.height / 2,
    });
    expect(Math.abs(centre(gizmo).x - centre(rendered).x), 'gizmo centre x').toBeLessThanOrEqual(1);
    expect(Math.abs(centre(gizmo).y - centre(rendered).y), 'gizmo centre y').toBeLessThanOrEqual(1);
    // …and the SIZE differs only by that outset, never by a scene-geometry mistake.
    const OUTSET = 5;
    expect(Math.abs(gizmo.width - rendered.width), 'gizmo width').toBeLessThanOrEqual(OUTSET);
    expect(Math.abs(gizmo.height - rendered.height), 'gizmo height').toBeLessThanOrEqual(OUTSET);
  });

  test('🔴 the Transform panel shows the CELL, and editing it moves ONLY this arrangement', async ({
    app,
  }) => {
    await twoBoxes(app);
    await app.clickCanvas({ x: 120, y: 120 });

    // Option (a): the panel shows the cell. Cell 1 of a 2-box arrangement is at x = 0.
    const xField = app.page.getByLabel('X position').first();
    await expect(xField).toHaveValue('0');

    // Write through it — this must land on the 2-box arrangement's cell 1.
    await xField.fill('300');
    await xField.press('Enter');

    // The CELLS field for cell 1 agrees: one value, two surfaces.
    await app.deselect();
    await expect(app.page.getByTestId('arrangement-cell-1')).toBeVisible();

    // …and the 1-box arrangement is UNTOUCHED — the owner's actual complaint.
    await app.page.getByLabel('Active arrangement').selectOption({ index: 2 });
    await app.clickCanvas({ x: 120, y: 120 });
    await expect(
      app.page.getByLabel('X position').first(),
      'editing the 2-box arrangement moved the 1-box one too',
    ).not.toHaveValue('300');
  });

  // ⚠ "a NON-box element is untouched" and "a box with NO cell refuses geometry" are asserted
  // in `tests/arrangement-cell-geometry.test.ts` instead: they are claims about which VALUE a
  // commit lands on, and driving a scrub-surface number field through a browser tests the
  // field's plumbing rather than the routing rule.

  test('🔴 switching to "As authored" RESTORES the authored geometry', async ({ app }) => {
    // Found by refusing to accept a screenshot that merely looked plausible. `repunch` had a
    // DEFAULT PARAMETER — `(view = arrangementView)` — so `repunch(undefined)`, which is
    // exactly what "As authored" sends, fell into the default and re-applied the PREVIOUS
    // arrangement. Every box stayed parked at the last arrangement's cells, and the preview
    // silently stopped being "the composition with no arrangement applied".
    await twoBoxes(app);
    const widths = async (): Promise<string[]> =>
      app.canvasFrame
        .locator('.cg-stage > .cg-layer > [data-cg-element-id]')
        .evaluateAll((ns) => ns.map((n) => (n as HTMLElement).style.width));

    // Under the 2-box arrangement each box is half the frame — the positive control.
    expect(await widths()).toEqual(['960px', '960px']);

    await app.page.getByLabel('Active arrangement').selectOption({ index: 0 });
    // …and "As authored" puts them back at the instance's own 1920-wide transform.
    await expect.poll(async () => (await widths()).join(',')).toBe('1920px,1920px');
  });
});
