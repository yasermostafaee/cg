import type { Page } from '@playwright/test';
import { expect, test } from './fixtures/runtime.js';

/**
 * 🔴 `CONSOLE-LOOK-06` DELTA R §4 — **THE REFUSAL SURFACE, IN A REAL ENGINE.**
 *
 * The owner's two defects were one cause: refusals were rendered by `CommandToast`, the
 * surface built for CONFIRMATIONS, whose auto-dismiss took a refusal off screen before it
 * could be read. Everything below is a property jsdom cannot answer — it persists across real
 * time, it does not overlap real boxes, and it paints (golden rule 12, and 12c in particular:
 * every geometry claim here is zeros in jsdom and would pass against any layout).
 */

/** Raise a refusal the way the app itself does, through the module the whole app shares. */
async function refuse(page: Page, message: string): Promise<void> {
  await page.evaluate((m) => {
    (window as unknown as { CG_TEST_REFUSE?: (s: string) => void }).CG_TEST_REFUSE?.(m);
  }, message);
}

test('§R — a refusal PERSISTS past any toast, coalesces, dismisses, and never covers the console', async ({
  app,
}) => {
  const page = app.page;
  await page.setViewportSize({ width: 1280, height: 800 });
  const banner = page.locator('[data-refusal]');
  await expect(banner, 'nothing is refused at rest').toHaveCount(0);

  await refuse(page, 'CH 1 already has a multi-box look on air.');
  await expect(banner).toBeVisible();
  await expect(banner).toContainText('CH 1 already has a multi-box look on air.');

  /*
    (a) IT PERSISTS. The toast this replaced dismissed itself at 3200 ms — `CONSOLE-LOOK-06`
    D3 had just shortened it from 4000, which made the owner's defect (b) worse before this
    fixed it. Waited well past that, in real time.
  */
  await page.waitForTimeout(4200);
  await expect(banner, 'a refusal that hides itself is the defect').toBeVisible();

  /*
    (c) IT DOES NOT COVER THE CONSOLE. The screenshot showed the old toast lying over the
    footer hint AND a table row. Asserted as real box intersection against both — a refusal
    about a row that hides the row is the failure mode, so it is measured rather than argued.
  */
  const b = await banner.boundingBox();
  expect(b).not.toBeNull();
  for (const sel of ['[data-layers-foothint]', '[data-layer][data-item-id]']) {
    const other = await page.locator(sel).first().boundingBox();
    expect(other, `${sel} has no box`).not.toBeNull();
    const overlaps =
      b!.x < other!.x + other!.width &&
      other!.x < b!.x + b!.width &&
      b!.y < other!.y + other!.height &&
      other!.y < b!.y + b!.height;
    expect(overlaps, `the refusal covers ${sel}`).toBe(false);
  }

  /*
    (d) IT COALESCES. Five presses of the same refused action are ONE banner and a count,
    never five stacked boxes.
  */
  for (let i = 0; i < 4; i += 1) await refuse(page, 'CH 1 already has a multi-box look on air.');
  await expect(page.locator('[data-refusal]'), 'five banners instead of one').toHaveCount(1);
  await expect(banner).toHaveAttribute('data-refusal-count', '5');
  await expect(banner).toContainText('(5 times)');

  /*
    (e) IT IS ASSERTIVE, and it does not steal focus. A toast is polite; a refusal interrupts —
    but taking focus would move the operator's hand away from the control that resolves it.
  */
  await expect(banner.locator('[role="alert"]')).toHaveCount(1);
  const focusMoved = await page.evaluate(() =>
    document.activeElement === null
      ? false
      : document.activeElement.closest('[data-refusal]') !== null,
  );
  expect(focusMoved, 'the refusal stole focus').toBe(false);

  // (b) IT IS DISMISSIBLE, by a real control with a real name.
  const dismiss = page.getByRole('button', { name: 'Dismiss this refusal' });
  await expect(dismiss).toBeVisible();
  await dismiss.click();
  await expect(banner).toHaveCount(0);

  // …and dismissing it does not silence the next one.
  await refuse(page, 'Another refusal.');
  await expect(page.locator('[data-refusal]')).toBeVisible();
});

test('§R — the success toast is untouched, and still the transient one', async ({ app }) => {
  const page = app.page;
  await page.setViewportSize({ width: 1280, height: 800 });
  /*
    The BOUNDARY, asserted so a later session cannot quietly merge the two surfaces again:
    a toast announces a completed action and MAY auto-hide; a refusal persists. Both halves
    are needed — a test that only pinned the refusal would be satisfied by deleting the toast.
  */
  await page.evaluate(() => {
    (window as unknown as { CG_TEST_SUCCEED?: (s: string) => void }).CG_TEST_SUCCEED?.(
      'Cleared · 2 rows',
    );
  });
  const toast = page.getByRole('status', { name: 'Command success' });
  await expect(toast).toBeVisible();
  await expect(toast).toContainText('Cleared · 2 rows');
  // Polite, not assertive — the opposite of the refusal above.
  await expect(toast).toHaveAttribute('aria-live', 'polite');
  // …and it goes on its own, which is what makes it the wrong home for a refusal.
  await expect(toast).toHaveCount(0, { timeout: 6000 });
  await expect(page.locator('[data-refusal]'), 'a success must never raise a refusal').toHaveCount(
    0,
  );
});
