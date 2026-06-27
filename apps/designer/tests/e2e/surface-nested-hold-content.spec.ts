import { test, expect, type DesignerApp } from './fixtures/designer.js';

/**
 * D-108 — the Playout "which content closes the graphic?" checklist surfaces,
 * READ-ONLY, the hold-driving content that lives inside the active composition's
 * nested composition instances (which drive the parent's hold via D-104). Each
 * immediate nested instance is listed by name with a count of its hold-driving
 * items; the rows are NOT togglable (`drivesHold` is on the shared child element)
 * and drilling in switches the active composition so the child's own checklist
 * (D-107) can edit the flag.
 *
 * The runtime EFFECT (nested content actually driving the parent's hold) is covered
 * by the @cg/template-runtime tests; this asserts the inspector surface.
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

const nestedRow = (app: DesignerApp) =>
  app.page.getByRole('button', { name: /choose which of its content closes the graphic/ });

test.describe('D-108 — surface nested-composition content that drives the hold', () => {
  test('surfaces nested hold-driving content read-only with a count, and drills in', async ({
    app,
  }) => {
    await app.newProject('NestedSurface');
    await authorParentNestingContentChild(app);

    // The nested instance is listed once with its hold-driving item count.
    await expect(nestedRow(app)).toHaveCount(1);
    await expect(nestedRow(app)).toContainText('1 item');

    // Read-only: the nested surface uses a drill-in button, not a toggle — the
    // parent (no own content) shows no `drives the hold` checkbox.
    await expect(app.page.getByRole('checkbox', { name: /drives the hold/ })).toHaveCount(0);

    // Activating the row drills into the child (its mode is the default 'manual',
    // not the parent's 'auto-out') so its own checklist can edit the flag.
    await nestedRow(app).click();
    await expect(app.page.getByRole('combobox', { name: 'Playout mode' })).toHaveValue('manual');
  });

  test('excluding the nested content in its own checklist removes the parent row', async ({
    app,
  }) => {
    await app.newProject('NestedExclude');
    await authorParentNestingContentChild(app);
    await expect(nestedRow(app)).toHaveCount(1);

    // Drill into the child, make it content-driven so its OWN checklist shows, and
    // exclude the countdown clock there (the only place `drivesHold` is editable).
    await app.openComposition('TitleBlock');
    await app.setPlayoutTiming('auto-out');
    await app.setHoldSource('content-driven');
    const ownChecks = app.page.getByRole('checkbox', { name: /drives the hold/ });
    await expect(ownChecks).toHaveCount(1);
    await ownChecks.nth(0).uncheck();

    // Back in the parent, the nested instance no longer contributes hold-driving
    // content, so the read-only row is gone. (openComposition clears selection, so
    // the COMPOSITION inspector — and its Playout checklist — is shown; a canvas
    // click would re-select the canvas-covering instance.)
    await app.openComposition('comp1');
    await expect(nestedRow(app)).toHaveCount(0);
  });
});
