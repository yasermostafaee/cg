import { test, expect, type DesignerApp } from './fixtures/designer.js';

/**
 * D-108 + D-112 — the Playout "which content closes the graphic?" checklist surfaces the
 * hold-driving content that lives inside the active composition's nested composition instances
 * (which drive the parent's hold via D-104). D-108 first surfaced these READ-ONLY; D-112 makes them
 * WRITABLE per instance — each nested driver is a checkbox reflecting its effective participation
 * (the per-instance `holdOverrides` if set, else the element's own `drivesHold`), and the drill-in
 * stays to edit the shared child or a deeper level. This asserts the inspector surface; the runtime
 * effect + per-instance isolation are covered by the @cg/template-runtime + D-112 E2E tests.
 */

/** Parent `comp1` (auto-out, content-driven) nesting `TitleBlock`, which holds a countdown clock. */
async function authorParentNestingContentChild(app: DesignerApp): Promise<void> {
  // The child holds the only hold-driving content — a countdown clock.
  await app.newComposition('TitleBlock');
  await app.openComposition('TitleBlock');
  await app.addClock();
  await app.setClockCountdown(5);

  // The parent (comp1) has NO direct content; it only nests TitleBlock.
  await app.openComposition('comp1');
  await app.setPlayoutTiming('auto-out');
  await app.nestCompositionInstance('TitleBlock');
  // The nested instance is auto-selected and covers the canvas, so deselect via
  // Escape (a canvas click would re-hit it) and select Hold source directly.
  await app.page.keyboard.press('Escape');
  await app.page.getByRole('combobox', { name: 'Hold source' }).selectOption('content-driven');
}

const drillIn = (app: DesignerApp) =>
  app.page.getByRole('button', { name: /Open .* to edit its content/ });

test.describe('D-108/D-112 — surface nested-composition content that drives the hold', () => {
  test('surfaces nested hold-driving content as a writable toggle, and drills in', async ({
    app,
  }) => {
    await app.newProject('NestedSurface');
    await authorParentNestingContentChild(app);

    // D-112 — the nested countdown is a WRITABLE checkbox (effective = its drivesHold), checked.
    const checks = app.page.getByRole('checkbox', { name: /drives the hold/ });
    await expect(checks).toHaveCount(1);
    await expect(checks.nth(0)).toBeChecked();

    // The drill-in stays: activating it switches to the child (its own mode is the default
    // 'manual', not the parent's 'auto-out') so the child's own content can be edited there.
    await expect(drillIn(app)).toHaveCount(1);
    await drillIn(app).click();
    await expect(app.page.getByRole('combobox', { name: 'Playout mode' })).toHaveValue('manual');
  });

  test('toggling the nested row off persists as a per-instance override across a re-render', async ({
    app,
  }) => {
    await app.newProject('NestedOverride');
    await authorParentNestingContentChild(app);
    const checks = app.page.getByRole('checkbox', { name: /drives the hold/ });
    await expect(checks).toHaveCount(1);

    // Exclude the nested countdown from THIS parent's hold via the writable row.
    await checks.nth(0).uncheck();
    await expect(checks.nth(0)).not.toBeChecked();

    // The choice persists across a re-render (hide the checklist via 'timed', reshow it) — it is
    // stored on the parent's composition-instance element (holdOverrides), not session state. Use
    // the inline Hold-source locator (not the fixture helper, whose canvas-click deselect would
    // re-select the canvas-covering nested instance and hide the composition inspector).
    const holdSource = app.page.getByRole('combobox', { name: 'Hold source' });
    await holdSource.selectOption('timed');
    await expect(checks).toHaveCount(0);
    await holdSource.selectOption('content-driven');
    await expect(checks).toHaveCount(1);
    await expect(checks.nth(0)).not.toBeChecked(); // still excluded — stored per-instance
  });
});
