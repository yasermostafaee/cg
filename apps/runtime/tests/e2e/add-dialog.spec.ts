import { test, expect } from './fixtures/runtime.js';

/**
 * `STATION-CHROME-01` §6 and §7 — **one way to add anything, and a lock that asks twice** — in a
 * real browser.
 *
 * ── WHY THESE ARE IN ONE FILE ───────────────────────────────────────────────
 *
 * They share one mechanism: a dialog on top of a dialog. `nestedDialog.dom.test.ts` measures
 * what jsdom can see of it (Escape reaching only the top layer, no trap hijacking a mid-ring
 * Tab), and says plainly what it CANNOT: **jsdom does not implement sequential focus
 * navigation**, so "Tab actually walks the sub-dialog's fields" is unmeasurable there. It is
 * measurable here, and it is the assertion an operator would notice failing.
 *
 * ⚠ `PLAYOUT-SOURCES-01` — §5 (the live-source fields that changed with the kind) is RETIRED with
 * the dialog it drove: the station's sources are the Playout's, and Station setup lists them
 * read-only (`live-source-sources.spec.ts`). §6's claims never depended on WHICH Add opened the
 * second dialog, so they are carried by the delimiter Add, the same primitive.
 */

test('§6 — an Add opens a small SECOND dialog, and the keyboard belongs to it', async ({ app }) => {
  const page = app.page;
  const dialog = page.getByRole('dialog', { name: 'Station setup' });

  await app.openStationSetupAt('Text file delimiters');
  await expect(dialog).toBeVisible();

  await dialog.getByRole('button', { name: 'Add delimiter' }).click();
  const sub = page.getByRole('dialog', { name: 'Add delimiter' });
  await expect(sub).toBeVisible();
  // BOTH dialogs are up: the second sits ON the first rather than replacing it.
  await expect(page.getByRole('dialog')).toHaveCount(2);
  await expect(sub.getByLabel('New delimiter name')).toBeVisible();
  await expect(sub.getByLabel('New delimiter character')).toBeVisible();
  // …and the INLINE strip it replaces is gone.
  await expect(dialog.getByLabel('New delimiter name')).toHaveCount(0);

  /*
    🔴 TAB WALKS THE SUB-DIALOG. This is the half `nestedDialog.dom.test.ts` cannot run: with
    both traps live and neither deferring, the outer one dragged focus out and the inner one
    dragged it back, so every press landed the operator on the first control and the second
    field was unreachable. Three presses, three DIFFERENT stops, all inside the sub-dialog.
  */
  const stops: string[] = [];
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('Tab');
    stops.push(
      await page.evaluate(
        () =>
          document.activeElement?.getAttribute('aria-label') ??
          document.activeElement?.tagName ??
          '?',
      ),
    );
    await expect(sub.locator(':focus')).toHaveCount(1);
  }
  expect(new Set(stops).size, `Tab did not move: ${stops.join(' → ')}`).toBeGreaterThan(1);

  // 🔴 ESCAPE closes ONLY the top dialog — the settings dialog he was working in survives.
  await page.keyboard.press('Escape');
  await expect(sub).toBeHidden();
  await expect(dialog).toBeVisible();

  // …and the Live sources tab carries no Add at all any more: nothing there is defined here.
  await dialog
    .getByRole('tablist', { name: 'Station setup sections' })
    .getByRole('tab', { name: /^Live sources/ })
    .click();
  await expect(dialog.getByRole('button', { name: /^Add/ })).toHaveCount(0);
});

test('§7 — engaging the lock asks for the PIN twice and refuses a mismatch', async ({ app }) => {
  const page = app.page;

  // ⚠ ANCHORED, not /Lock/: the dialog's own confirm is also called Lock now that the bar's
  // control has lost its ellipsis (`MODAL-CHROME-10` A §A2). This is the BAR's.
  await page
    .getByRole('button', { name: /^Lock$/ })
    .first()
    .click();
  const lock = page.getByRole('dialog', { name: 'Engage lock' });
  await expect(lock).toBeVisible();

  // TWO fields, and the copy says why the second one is there.
  await expect(lock.getByLabel('Lock PIN (4–64 characters)')).toBeVisible();
  await expect(lock.getByLabel('Lock PIN again')).toBeVisible();
  await expect(lock).toContainText('Asked twice on purpose');
  // …and what the lock will do, said BEFORE he does it.
  await expect(lock).toContainText('refuses everything, including Clear and Stop');
  await expect(lock).toContainText('not stored');

  // 🔴 A MISMATCH DOES NOT LOCK. The console is still usable behind the dialog.
  await lock.getByLabel('Lock PIN (4–64 characters)').fill('1234');
  await lock.getByLabel('Lock PIN again').fill('1235');
  await lock.getByRole('button', { name: 'Lock', exact: true }).click();
  await expect(lock).toContainText('The two PINs are different');
  await expect(lock).toBeVisible();
  // `CONSOLE-MATCH-03` §5 — the chip is `Icon` + `LOCKED` now, not a text glyph, so it is
  // addressed by its WORD. The glyph was never the assertion; it was just what was there.
  await expect(page.getByText('LOCKED', { exact: true })).toHaveCount(0);

  // Matching PINs engage it.
  await lock.getByLabel('Lock PIN again').fill('1234');
  await lock.getByRole('button', { name: 'Lock', exact: true }).click();
  await expect(page.getByText('LOCKED', { exact: true })).toBeVisible();
});
