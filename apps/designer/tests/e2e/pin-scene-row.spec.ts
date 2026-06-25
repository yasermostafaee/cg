import { test, expect } from './fixtures/designer.js';

/**
 * D-078 — the scene/root row stays pinned at the top of the timeline layers panel
 * (BOTH the left label column and the right lane column) while the element rows
 * scroll under it, and each layer's left label stays vertically aligned with its
 * right lane at every scroll offset (the two columns must not drift).
 */
test.describe('D-078 — pinned scene row in the layers panel', () => {
  test('scene row stays pinned on both columns while layers scroll; each label stays aligned with its lane', async ({
    app,
  }) => {
    await app.newProject('Pin');
    // Enough layers to overflow the timeline body vertically (rows start collapsed).
    for (let i = 0; i < 14; i++) {
      await app.addRectangle({ x: 120 + (i % 5) * 16, y: 120 + (i % 5) * 16 });
    }

    const laneBody = app.page.getByTestId('timeline-lane-body');
    const sceneLabel = app.page.getByTestId('scene-row-label');
    const sceneLane = app.page.getByTestId('scene-row-lane');

    // The body must actually overflow for the test to mean anything.
    expect(await laneBody.evaluate((el) => el.scrollHeight > el.clientHeight + 10)).toBe(true);

    // Pick a layer that will scroll (a lower row in the list).
    const ids = await app.timelineRowIds();
    expect(ids.length).toBeGreaterThan(8);
    const layerId = ids[ids.length - 1]!;
    const labelRow = app.page.locator(`.cg-tl-row[data-element-id="${layerId}"]`);
    const laneRow = app.page.locator(`[data-lane-id="${layerId}"]`);

    const topOf = async (loc: typeof sceneLabel): Promise<number> => (await loc.boundingBox())!.y;

    // ── At scrollTop = 0 ──────────────────────────────────────────────────────
    const sceneLabelTop0 = await topOf(sceneLabel);
    const sceneLaneTop0 = await topOf(sceneLane);
    expect(Math.abs(sceneLabelTop0 - sceneLaneTop0)).toBeLessThan(2); // scene row aligned across columns
    const labelTop0 = await topOf(labelRow);
    const laneTop0 = await topOf(laneRow);
    expect(Math.abs(labelTop0 - laneTop0)).toBeLessThan(2); // the layer's label aligned with its lane

    // ── Scroll the lane body down (the left column mirrors it) ─────────────────
    await laneBody.evaluate((el) => {
      el.scrollTop = 140;
    });
    await expect.poll(() => laneBody.evaluate((el) => el.scrollTop)).toBeGreaterThan(80);

    // The scene row stayed pinned at the top of BOTH columns (didn't move, still aligned).
    await expect.poll(() => topOf(sceneLabel)).toBeCloseTo(sceneLabelTop0, 0);
    await expect.poll(() => topOf(sceneLane)).toBeCloseTo(sceneLaneTop0, 0);
    expect(Math.abs((await topOf(sceneLabel)) - (await topOf(sceneLane)))).toBeLessThan(2);

    // The layer scrolled UP under the pinned scene row, and its label is STILL aligned
    // with its lane (no left/right drift).
    const labelTop1 = await topOf(labelRow);
    const laneTop1 = await topOf(laneRow);
    expect(labelTop0 - labelTop1).toBeGreaterThan(80); // it scrolled
    expect(Math.abs(labelTop1 - laneTop1)).toBeLessThan(2); // still aligned
  });
});
