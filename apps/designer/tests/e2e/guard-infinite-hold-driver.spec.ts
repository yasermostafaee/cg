import { test, expect } from './fixtures/designer.js';

/**
 * D-111 — guard against an infinite-repeat content element silently driving the hold.
 * A `ticker` / `sequence` with `repeat: 'infinite'` that participates in a content-driven
 * hold (`drivesHold !== false`) never completes, so the graphic holds until stop(). The
 * Playout checklist (D-107) flags each such row ("loops forever") and — when EVERY driver
 * is infinite — escalates to a prominent alert. Excluding the element clears it; a finite
 * driver (a countdown clock) shows no warning. UI-only; the runtime is unchanged.
 */
test.describe('D-111 — infinite-repeat hold driver discoverability', () => {
  test('an infinite-repeat ticker is flagged per-row + prominently; excluding it clears both', async ({
    app,
  }) => {
    await app.newProject('InfHoldDriver');
    await app.addTicker({ x: 120, y: 150 }); // a fresh ticker defaults to repeat: 'infinite'
    await app.addOutPoint();
    await app.setPlayoutTiming('auto-out');
    await app.setHoldSource('content-driven');

    const check = app.page.getByRole('checkbox', { name: /drives the hold/ });
    await expect(check).toHaveCount(1);
    await expect(check).toBeChecked();

    // Per-row "loops forever" flag + (since it is the ONLY driver and infinite) a prominent alert.
    await expect(app.page.getByText(/loops forever/)).toBeVisible();
    await expect(app.inspector.getByRole('alert')).toBeVisible();

    // Excluding the infinite driver clears BOTH — the graphic can auto-close again.
    await check.uncheck();
    await expect(app.page.getByText(/loops forever/)).toHaveCount(0);
    await expect(app.inspector.getByRole('alert')).toHaveCount(0);
  });

  test('a finite content driver (countdown clock) shows no warning (no false positive)', async ({
    app,
  }) => {
    await app.newProject('FiniteHoldDriver');
    await app.addClock({ x: 300, y: 165 });
    await app.setClockCountdown(30); // a countdown is finite — it CAN end the hold
    await app.addOutPoint();
    await app.setPlayoutTiming('auto-out');
    await app.setHoldSource('content-driven');

    const check = app.page.getByRole('checkbox', { name: /drives the hold/ });
    await expect(check).toHaveCount(1);
    await expect(check).toBeChecked();

    // Finite driver ⇒ no "loops forever" flag and no prominent alert.
    await expect(app.page.getByText(/loops forever/)).toHaveCount(0);
    await expect(app.inspector.getByRole('alert')).toHaveCount(0);
  });
});
