import { test, expect } from './fixtures/designer.js';

/**
 * D-104/D-189 — a composition whose only finite content lives inside a NESTED
 * composition participates in the content-driven hold. D-189 keeps the authored
 * Hold-source choice visible even before that content exists; adding the nested
 * driver replaces the safe Timed fallback with the authored behavior. The runtime
 * side — the parent holds until the nested content
 * completes, starts it after the parent's intro, and holds until stop() for
 * infinite nested content (bullets 1/3/4) — is covered by the
 * @cg/template-runtime unit tests (nested-content-lifecycle.test.ts), which run
 * the SAME runtime source the preview and export use.
 */
test.describe('D-104/D-189 — nested content activates an always-reachable Hold source', () => {
  test('content-driven intent falls back safely, then activates when nested content is added', async ({
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

    // Before nesting, the authored choice is already available with concise values.
    await app.setPlayoutTiming('auto-out');
    const holdSource = app.page.getByRole('combobox', { name: 'Hold source' });
    await expect(holdSource).toBeVisible();
    await expect(holdSource.locator('option')).toHaveText(['Timed', 'Content-driven']);
    await expect(
      app.page.getByRole('combobox', { name: 'Playback mode' }).locator('option'),
    ).toHaveText(['Static', 'Manual', 'Auto-out', 'Loop cycle']);

    await holdSource.selectOption('content-driven');
    await expect(holdSource).toHaveValue('content-driven');
    await expect(app.page.getByTestId('hold-source-fallback-state')).toContainText(
      'No active hold driver · using Timed',
    );
    await expect(
      app.page.getByRole('spinbutton', { name: 'Hold duration in milliseconds' }),
    ).toBeVisible();

    // After nesting the content-bearing composition, the saved choice stays Content-driven
    // and becomes effective immediately.
    await app.nestCompositionInstance('TitleBlock');
    // The nested instance is auto-selected and sits at the origin (covering the
    // canvas), so deselect via Escape — a canvas click would re-hit it — to return
    // to the COMPOSITION inspector.
    await app.page.keyboard.press('Escape');
    await expect(holdSource).toBeVisible();
    await expect(holdSource).toHaveValue('content-driven');
    await expect(app.page.getByTestId('hold-source-fallback-state')).toHaveCount(0);
    await expect(
      app.page.getByRole('spinbutton', { name: 'Hold duration in milliseconds' }),
    ).toHaveCount(0);
  });
});
