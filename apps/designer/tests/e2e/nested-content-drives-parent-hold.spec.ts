import { test, expect } from './fixtures/designer.js';

/**
 * B-031 — a content-driven nested composition drives its PARENT's hold. The preview half:
 * the per-scope timing now offers the content-driven hold source for a parent whose closing
 * content lives entirely inside a nested composition (the per-scope `hasContent` recurses
 * nested instances, matching the inspector's `hasContentElement`; previously it was shallow,
 * so the parent was only offered a numeric/timed hold).
 *
 * The runtime effect — the parent holds until the nested content-driven comp self-settles,
 * honoring per-element `drivesHold` — is covered deterministically by the
 * @cg/template-runtime tests (nested-content-lifecycle.test.ts + ticker-runtime.test.ts).
 */
test.describe('B-031 — preview offers the content-driven hold for nested content', () => {
  test('a parent whose only content is nested is offered the content-driven hold in the preview', async ({
    app,
  }) => {
    await app.newProject('NestedHoldPreview');

    // A child composition holds the only content — a countdown clock.
    await app.newComposition('TitleBlock');
    await app.openComposition('TitleBlock');
    await app.addClock();
    await app.setClockCountdown(5);

    // The parent (comp1) has NO direct content; it only nests TitleBlock, auto-out.
    await app.openComposition('comp1');
    await app.setPlayoutTiming('auto-out');
    await app.nestCompositionInstance('TitleBlock');
    await app.page.keyboard.press('Escape'); // deselect the canvas-covering instance

    await app.openPreviewModal();
    // The parent's preview timing offers the content-driven hold source — the per-scope
    // content check now recurses the nested composition (shallow pre-B-031 hid it).
    await expect(
      app.previewDialog.getByRole('combobox', { name: 'Preview hold source' }).first(),
    ).toBeVisible();
  });
});
