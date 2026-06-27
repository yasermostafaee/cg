import { test, expect } from './fixtures/designer.js';

/**
 * D-107 — when a composition's hold is content-driven, the Playout section shows a
 * checklist of the scope's content elements ("which content closes the graphic?"),
 * pre-checked; unchecking one sets its `drivesHold: false` so it no longer gates the
 * hold (it still runs). Wall/countup clocks never drive the hold and never appear;
 * only tickers, sequences, and COUNTDOWN clocks are listed.
 *
 * The runtime EFFECT of `drivesHold` (the excluded element stops gating the hold) is
 * covered deterministically by packages/template-runtime/tests/selective-content-hold.test.ts;
 * a real-timer E2E can't reliably separate "held for the finite content" from
 * "held until stop". Here we assert the inspector BEHAVIOUR: the checklist contents,
 * the toggle, and that the choice persists.
 */

test.describe('D-107 — select which content drives the content-driven hold', () => {
  test('the checklist lists content and toggling participation persists', async ({ app }) => {
    await app.newProject('SelHoldTickers');
    // Two tickers — both content sources that drive the hold by default.
    await app.addTicker({ x: 120, y: 150 });
    await app.addTicker({ x: 120, y: 200 });
    await app.addOutPoint();
    await app.setPlayoutTiming('auto-out');
    await app.setHoldSource('content-driven');

    const checks = app.page.getByRole('checkbox', { name: /drives the hold/ });
    await expect(checks).toHaveCount(2);
    await expect(checks.nth(0)).toBeChecked(); // pre-checked: all participate by default
    await expect(checks.nth(1)).toBeChecked();

    // Exclude the first ticker from the hold.
    await checks.nth(0).uncheck();
    await expect(checks.nth(0)).not.toBeChecked();
    await expect(checks.nth(1)).toBeChecked();

    // The choice persists across a re-render (hide the checklist via 'timed', reshow it).
    await app.setHoldSource('timed');
    await expect(checks).toHaveCount(0);
    await app.setHoldSource('content-driven');
    await expect(checks.nth(0)).not.toBeChecked(); // still excluded — stored on the element
    await expect(checks.nth(1)).toBeChecked();
  });

  test('wall clocks never appear; only a countdown clock joins the checklist', async ({ app }) => {
    await app.newProject('SelHoldClocks');
    await app.addTicker({ x: 120, y: 200 });
    await app.addClock({ x: 300, y: 120 }); // wall (default) — must NOT be listed
    // A second clock, switched to a countdown while still selected — MUST be listed.
    await app.addClock({ x: 300, y: 165 });
    await app.setClockCountdown(30);
    await app.addOutPoint();
    await app.setPlayoutTiming('auto-out');
    await app.setHoldSource('content-driven');

    const checks = app.page.getByRole('checkbox', { name: /drives the hold/ });
    // The ticker + the countdown clock are listed; the WALL clock is excluded.
    await expect(checks).toHaveCount(2);
    await expect(checks.nth(0)).toBeChecked();
    await expect(checks.nth(1)).toBeChecked();
  });
});
