import { test, expect } from './fixtures/designer.js';

/**
 * D-104 — a composition whose only finite content lives inside a NESTED
 * composition still participates in the content-driven hold: `hasContentElement`
 * recurses into `composition` instances, so the Playout section OFFERS the
 * hold-source control for such a parent (acceptance bullet 1, the user-facing
 * surface). The runtime side — the parent holds until the nested content
 * completes, starts it after the parent's intro, and holds until stop() for
 * infinite nested content (bullets 1/3/4) — is covered by the
 * @cg/template-runtime unit tests (nested-content-lifecycle.test.ts), which run
 * the SAME runtime source the preview and export use.
 */
test.describe('D-104 — nested-composition content offers the content-driven hold', () => {
  test('the hold-source control is offered when finite content lives in a nested composition', async ({
    app,
  }) => {
    await app.newProject('NestedHold');

    // A child composition holds the only finite content — a countdown clock.
    await app.newComposition('TitleBlock');
    await app.openComposition('TitleBlock');
    await app.addClock();
    await app.setClockCountdown(5);

    // The parent (comp1) has NO direct content; it only nests TitleBlock.
    await app.openComposition('comp1');

    // Before nesting, an auto-out parent with no content offers no hold control
    // (setPlayoutTiming deselects, so the COMPOSITION inspector is shown).
    await app.setPlayoutTiming('auto-out');
    await expect(app.page.getByRole('combobox', { name: 'Hold source' })).toHaveCount(0);

    // After nesting the content-bearing composition, the parent's finite content
    // lives inside the nested instance ⇒ the hold-source control is offered.
    await app.nestCompositionInstance('TitleBlock');
    // The nested instance is auto-selected and sits at the origin (covering the
    // canvas), so deselect via Escape — a canvas click would re-hit it — to return
    // to the COMPOSITION inspector.
    await app.page.keyboard.press('Escape');
    const holdSource = app.page.getByRole('combobox', { name: 'Hold source' });
    await expect(holdSource).toBeVisible();

    // And it is selectable to content-driven (the D-104 authoring choice).
    await holdSource.selectOption('content-driven');
    await expect(holdSource).toHaveValue('content-driven');
  });
});
