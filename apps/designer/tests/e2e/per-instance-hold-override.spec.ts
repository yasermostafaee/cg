import { test, expect } from './fixtures/designer.js';

/**
 * D-112 — the parent's content-driven checklist makes nested content WRITABLE per instance. A
 * nested driver's checkbox reflects its effective participation (the instance's override if set,
 * else the element's own `drivesHold`); toggling it writes a `holdOverrides` entry on the parent's
 * composition-INSTANCE element, so a second instance of the same child is unaffected. The folded-in
 * D-111 infinite warning shows on any effectively-driving `repeat: 'infinite'` row and clears when
 * the row is toggled off.
 *
 * The runtime EFFECT (the override actually changing which content ends the parent's hold) is
 * covered by packages/template-runtime/tests/per-instance-hold-override.test.ts; this asserts the
 * inspector surface + per-instance isolation.
 */
test.describe('D-112 — per-instance hold overrides (writable nested rows)', () => {
  test('nested content is a writable per-instance toggle; excluding one instance leaves the other', async ({
    app,
  }) => {
    await app.newProject('PerInstanceHold');
    // The child holds one hold driver — a ticker (defaults to repeat: 'infinite').
    await app.newComposition('TitleBlock');
    await app.openComposition('TitleBlock');
    await app.addTicker();

    // The parent (comp1) nests the SAME child TWICE → two independent instances.
    await app.openComposition('comp1');
    await app.setPlayoutTiming('auto-out');
    await app.nestCompositionInstance('TitleBlock');
    await app.nestCompositionInstance('TitleBlock');
    // The last instance is auto-selected and covers the canvas — deselect via Escape (a canvas
    // click would re-hit it), then pick the Hold source directly.
    await app.page.keyboard.press('Escape');
    await app.page.getByRole('combobox', { name: 'Hold source' }).selectOption('content-driven');

    // Two WRITABLE nested rows (one per instance), both checked (effective = the ticker's drivesHold).
    const checks = app.page.getByRole('checkbox', { name: /drives the hold/ });
    await expect(checks).toHaveCount(2);
    await expect(checks.nth(0)).toBeChecked();
    await expect(checks.nth(1)).toBeChecked();
    // The infinite ticker is flagged on BOTH effectively-driving rows (folded-in D-111).
    await expect(app.page.getByText(/loops forever/)).toHaveCount(2);

    // Excluding the FIRST instance's ticker leaves the SECOND instance untouched (per-instance).
    await checks.nth(0).uncheck();
    await expect(checks.nth(0)).not.toBeChecked();
    await expect(checks.nth(1)).toBeChecked();
    // The warning clears on the excluded row only — the other instance still loops forever.
    await expect(app.page.getByText(/loops forever/)).toHaveCount(1);

    // Re-checking restores it to driving — toggling back to the child's own default CLEARS the
    // override (it does not pin `true`), so the row falls back to `drivesHold` and is flagged again.
    await checks.nth(0).check();
    await expect(checks.nth(0)).toBeChecked();
    await expect(app.page.getByText(/loops forever/)).toHaveCount(2);
  });

  test('a finite nested driver is writable with no infinite warning, and the drill-in still works', async ({
    app,
  }) => {
    await app.newProject('PerInstanceFinite');
    // The child holds a finite hold driver — a 5s countdown clock.
    await app.newComposition('TitleBlock');
    await app.openComposition('TitleBlock');
    await app.addClock();
    await app.setClockCountdown(5);

    await app.openComposition('comp1');
    await app.setPlayoutTiming('auto-out');
    await app.nestCompositionInstance('TitleBlock');
    await app.page.keyboard.press('Escape');
    await app.page.getByRole('combobox', { name: 'Hold source' }).selectOption('content-driven');

    // One writable nested row, checked, with NO infinite warning (the countdown is finite).
    const checks = app.page.getByRole('checkbox', { name: /drives the hold/ });
    await expect(checks).toHaveCount(1);
    await expect(checks.nth(0)).toBeChecked();
    await expect(app.page.getByText(/loops forever/)).toHaveCount(0);

    // The drill-in stays — open the child (its own mode is the default 'manual').
    await app.page.getByRole('button', { name: /Open .* to edit its content/ }).click();
    await expect(app.page.getByRole('combobox', { name: 'Playout mode' })).toHaveValue('manual');
  });
});
