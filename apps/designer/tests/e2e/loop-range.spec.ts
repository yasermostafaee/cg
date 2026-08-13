import { test, expect, type DesignerApp } from './fixtures/designer.js';

/**
 * D-133 — THE LOOP RANGE: authorable on any composition that has an out-point, drawn on
 * the timeline by default with full-height indicator lines, and named apart from the two
 * other loops this app already has.
 *
 * Scenario coverage, mapped from `specs/designer-playout-lifecycle/spec.md`:
 *
 *   "A shapes-only scene can author a loop range"      → the first test
 *   "Markers span the timeline height"                 → the second (MEASURED, not styled)
 *   "The three loops are distinguishable"              → the third
 *   "The surface explains why an authored range is inert" → the fourth
 *
 * WHAT IS NOT HERE, and why: the playback half (the wrap, the seam invariant, leaving the
 * loop after the Nth repeat) is covered deterministically in
 * `packages/template-runtime/tests/hold-loop-range.test.ts` against an injected clock. A
 * real-timer E2E cannot separate "the furniture replayed the range" from "the furniture
 * was repainted for some other reason" without reproducing that clock — the same division
 * `content-start-hold-entry.spec.ts` already draws for the same reason.
 */

/**
 * A shapes-only composition: one rectangle with a fade-in entrance, and an out-point.
 *
 * ⚠ The second keyframe is written by the VALUE EDIT alone, with no diamond click. Once a
 * track exists, `commitAnimatable` routes an edit to a keyframe at the playhead (D-006), so
 * clicking the diamond afterwards would TOGGLE that fresh keyframe straight back off — and
 * the entrance would settle nowhere, leaving a degenerate `[out-point → out-point]` range
 * that silently draws nothing. Observed, not theorised: this spec first failed exactly that
 * way, reporting a `frames 38 → 38` loop.
 */
async function shapesOnlyWithOutPoint(app: DesignerApp): Promise<void> {
  await app.addRectangle({ x: 240, y: 130 });
  await app.setInspectorNumber('Opacity', 0);
  await app.toggleInspectorKeyframe('opacity'); // the track's FIRST keyframe: @0 = 0
  await app.scrubToFrame(20);
  await app.setInspectorNumber('Opacity', 100); // upserts @20 — the entrance settles here
  await expect(app.inspectorDiamond('opacity')).toHaveAttribute('data-variant', 'at-frame');
  await app.scrubToFrame(0);
  await app.deselect();
  await app.addOutPoint();
}

test.describe('D-133 — the loop range is authorable and on the timeline', () => {
  test('a SHAPES-ONLY composition with an out-point offers the content-start pin — no ticker needed', async ({
    app,
  }) => {
    await app.newProject('LoopRangeShapes');
    await shapesOnlyWithOutPoint(app);

    // The gate's CONTENT half is gone: this scene has no ticker, sequence or clock.
    const pin = app.page.getByRole('button', { name: /Pin content start/ });
    await expect(pin).toBeVisible();
    await pin.click();

    // And it wrote a real marker — the affordance is not merely present.
    await expect(app.page.getByRole('button', { name: /Reset to auto/ })).toBeVisible();
    await expect(app.page.getByRole('separator', { name: 'Content start marker' })).toBeVisible();
  });

  test('the loop range is drawn BY DEFAULT and its indicator lines span the full timeline height', async ({
    app,
  }) => {
    await app.newProject('LoopRangeTimeline');
    await shapesOnlyWithOutPoint(app);
    // Nothing else is done: no pin, no drag. "Present by default" is the claim.

    const start = app.page.getByTestId('loop-range-start');
    const end = app.page.getByTestId('loop-range-end');
    const band = app.page.getByTestId('loop-range-band');
    await expect(start).toBeAttached();
    await expect(end).toBeAttached();
    await expect(band).toBeAttached();

    const box = async (loc: typeof start): Promise<{ x: number; height: number }> => {
      const b = await loc.boundingBox();
      if (b === null) throw new Error('loop-range element has no box');
      return { x: b.x, height: b.height };
    };
    const playhead = await box(app.page.getByTestId('body-playhead'));
    const sceneLane = await box(app.page.getByTestId('scene-row-lane'));

    // FULL HEIGHT, measured: exactly as tall as the shipped body playhead, and several
    // times the scene row the draggable grips live on. Asserting only "taller than the
    // scene row" would pass on a line two rows tall.
    for (const loc of [start, end, band]) {
      const b = await box(loc);
      expect(Math.abs(b.height - playhead.height)).toBeLessThan(2);
      expect(b.height).toBeGreaterThan(sceneLane.height * 3);
    }

    // The range runs left→right from the content start to the out-point, and the band
    // spans between them.
    const s = await box(start);
    const e = await box(end);
    expect(e.x).toBeGreaterThan(s.x);
    const bandBox = (await band.boundingBox())!;
    expect(bandBox.x).toBeCloseTo(s.x, 0);
    expect(bandBox.x + bandBox.width).toBeCloseTo(e.x, 0);

    // The scene-lane grips are still where they were — the full-height lines are an
    // addition, not a relocation.
    await expect(app.page.getByRole('separator', { name: 'Out point marker' })).toBeVisible();
  });

  test('the three loops are named apart: preview loop, loop cycle, hold loop', async ({ app }) => {
    await app.newProject('LoopRangeNaming');
    await shapesOnlyWithOutPoint(app);

    // 1 — the transport toggle is the PREVIEW's, and says so.
    await expect(app.page.getByRole('button', { name: 'Preview loop' })).toBeVisible();
    // Nothing on screen is called plain "Loop".
    await expect(app.page.getByRole('button', { name: 'Loop', exact: true })).toHaveCount(0);

    // 2 — the playout MODE keeps its own name…
    await expect(
      app.page.getByRole('option', { name: /Loop cycle — repeat in → hold → out/ }),
    ).toBeAttached();

    // 3 — …and the range is the "hold loop", stated on the Playout panel.
    await expect(app.page.getByTestId('hold-loop-state')).toContainText(/hold loop/i);
  });

  test('an INERT range says so, and names the missing condition rather than a generic sentence', async ({
    app,
  }) => {
    await app.newProject('LoopRangeInert');
    await shapesOnlyWithOutPoint(app);
    const state = app.page.getByTestId('hold-loop-state');

    // 1 — a fresh out-point leaves the mode `manual`, where `holdSource` is ignored
    // ENTIRELY. Naming the hold select here would send the operator to a control that is
    // already correct, so the surface names the MODE.
    await expect(state).toContainText(/no playback effect/i);
    await expect(state).toContainText(/manual hold/i);
    await expect(state).not.toContainText(/no effective hold driver/i);

    // 2 — on auto-out the mode is no longer the obstacle; shapes only ⇒ no effective hold
    // driver, so THAT is what it names (and not the select, which cannot help).
    await app.setPlayoutTiming('auto-out');
    await expect(state).toContainText(/no effective hold driver/i);
    await expect(state).not.toContainText(/manual hold/i);

    // 3 — add a ticker and put the hold on content-driven: the same surface now reports the
    // range as ACTIVE and states the seam guarantee that IS the item.
    await app.addTicker({ x: 140, y: 210 });
    await app.deselect();
    await app.setHoldSource('content-driven');
    await expect(state).not.toContainText(/no playback effect/i);
    await expect(state).toContainText(/never restarts/i);
  });
});
